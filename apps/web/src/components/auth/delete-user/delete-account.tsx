"use client"

import { useAuth, useListAccounts, useSession } from "@better-auth-ui/react"
import { useQueryClient } from "@tanstack/react-query"
import { Eye, EyeOff, TriangleAlert } from "lucide-react"
import { useState } from "react"
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
  AlertDialogTrigger
} from "@/components/ui/alert-dialog"
import { Button, buttonVariants } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Field, FieldLabel } from "@/components/ui/field"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput
} from "@/components/ui/input-group"
import { Spinner } from "@/components/ui/spinner"
import { TypeToConfirm, phraseMatches } from "@/components/ui/type-to-confirm"
import { authClient as chatformAuthClient } from "@/lib/auth/auth-client"
import { purgeDate } from "@/lib/account-deletion"
import { cn } from "@/lib/utils"
import { ReauthenticationAction } from "../reauthentication"

export type DeleteAccountProps = {
  className?: string
}

type Step = "explain" | "confirm"

/**
 * Danger-zone card to delete the signed-in account.
 *
 * Two steps, on purpose: the first says what deleting does and that there are
 * thirty days to undo it; the second asks for the email address typed out and,
 * when the account has one, the password. Deleting only schedules the erase;
 * signing back in within the thirty days recovers everything.
 */
export function DeleteAccount({ className }: DeleteAccountProps) {
  const { authClient } = useAuth()
  const { data: session } = useSession(authClient)
  const { data: accounts } = useListAccounts(authClient)
  const queryClient = useQueryClient()

  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<Step>("explain")
  const [typed, setTyped] = useState("")
  const [password, setPassword] = useState("")
  const [passwordVisible, setPasswordVisible] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [needsReauth, setNeedsReauth] = useState(false)
  // Taken when the dialog opens, so the date it promises holds still while it is read.
  const [openedAt, setOpenedAt] = useState(0)

  const email = session?.user.email ?? ""
  const hasPassword = accounts?.some((a) => a.providerId === "credential") ?? false
  const ready =
    !!email && phraseMatches(typed.toLowerCase(), email.toLowerCase()) && (!hasPassword || password.length > 0)

  const reset = () => {
    setStep("explain")
    setTyped("")
    setPassword("")
    setPasswordVisible(false)
    setError(null)
    setNeedsReauth(false)
  }

  const handleOpenChange = (next: boolean) => {
    if (pending) return
    if (next) setOpenedAt(Date.now())
    setOpen(next)
    if (!next) reset()
  }

  const submit = async () => {
    if (!ready || pending) return
    setPending(true)
    setError(null)
    const { error } = await chatformAuthClient.$fetch<{ deletedAt: number; purgeAt: number }>(
      "/account/delete",
      {
        method: "POST",
        body: { confirmation: typed.trim(), ...(hasPassword ? { password } : {}) }
      }
    )
    setPending(false)
    if (error) {
      const code = (error as { code?: string }).code
      if (code === "SESSION_NOT_FRESH") setNeedsReauth(true)
      else setError(code === "INVALID_PASSWORD" ? "That password isn't right." : (error.message ?? "Couldn't delete your account."))
      return
    }
    // Every session is gone server-side. A full navigation, so nothing in
    // memory still thinks this account is signed in.
    queryClient.clear()
    window.location.replace("/signin?deleted=1")
  }

  return (
    <Card className={cn("border-destructive", className)}>
      <CardContent className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-medium leading-tight">Delete account</p>
          <p className="text-muted-foreground mt-0.5 text-xs">
            Recoverable for 30 days, then erased for good.
          </p>
        </div>

        <AlertDialog open={open} onOpenChange={handleOpenChange}>
          <AlertDialogTrigger
            className={cn(buttonVariants({ variant: "destructive", size: "sm" }))}
            disabled={!accounts || !session}
          >
            Delete account
          </AlertDialogTrigger>

          <AlertDialogContent>
            {needsReauth ? (
              <>
                <AlertDialogHeader>
                  <AlertDialogTitle>Sign in again to continue</AlertDialogTitle>
                </AlertDialogHeader>
                <ReauthenticationAction className="p-0" showTitle={false} />
              </>
            ) : step === "explain" ? (
              <>
                <AlertDialogHeader>
                  <AlertDialogMedia className="bg-destructive/10 text-destructive dark:bg-destructive/20">
                    <TriangleAlert />
                  </AlertDialogMedia>
                  <AlertDialogTitle>Delete your account?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Here is what happens.
                  </AlertDialogDescription>
                </AlertDialogHeader>

                <ul className="text-muted-foreground list-disc space-y-1.5 pl-5 text-sm">
                  <li>You are signed out on every device.</li>
                  <li>Forms in workspaces only you are in stop taking responses.</li>
                  <li>
                    For 30 days you can sign in again and recover everything as it was.
                  </li>
                  <li>
                    On <span className="text-foreground font-medium">{purgeDate(openedAt)}</span>,
                    your account and those workspaces, with every form, response and file, are
                    erased for good.
                  </li>
                  <li>Workspaces shared with others stay with them.</li>
                </ul>

                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <Button variant="destructive" onClick={() => setStep("confirm")}>
                    Continue
                  </Button>
                </AlertDialogFooter>
              </>
            ) : (
              <form
                className="flex flex-col gap-6"
                onSubmit={(e) => {
                  e.preventDefault()
                  void submit()
                }}
              >
                <AlertDialogHeader>
                  <AlertDialogMedia className="bg-destructive/10 text-destructive dark:bg-destructive/20">
                    <TriangleAlert />
                  </AlertDialogMedia>
                  <AlertDialogTitle>Confirm it&apos;s you</AlertDialogTitle>
                  <AlertDialogDescription>
                    Your data is erased on {purgeDate(openedAt)} unless you sign in again before then.
                  </AlertDialogDescription>
                </AlertDialogHeader>

                <TypeToConfirm phrase={email} value={typed} onChange={setTyped} disabled={pending} />

                {hasPassword && (
                  <Field>
                    <FieldLabel htmlFor="delete-password">Password</FieldLabel>
                    <InputGroup>
                      <InputGroupInput
                        id="delete-password"
                        type={passwordVisible ? "text" : "password"}
                        autoComplete="current-password"
                        value={password}
                        onChange={(e) => {
                          setPassword(e.target.value)
                          setError(null)
                        }}
                        disabled={pending}
                      />
                      <InputGroupAddon align="inline-end">
                        <InputGroupButton
                          size="icon-xs"
                          aria-label={passwordVisible ? "Hide password" : "Show password"}
                          onClick={() => setPasswordVisible((v) => !v)}
                        >
                          {passwordVisible ? <EyeOff /> : <Eye />}
                        </InputGroupButton>
                      </InputGroupAddon>
                    </InputGroup>
                  </Field>
                )}

                {error && <p className="text-destructive text-sm">{error}</p>}

                <AlertDialogFooter>
                  <Button type="button" variant="outline" onClick={() => setStep("explain")} disabled={pending}>
                    Back
                  </Button>
                  <Button type="submit" variant="destructive" disabled={!ready || pending}>
                    {pending && <Spinner />}
                    Delete my account
                  </Button>
                </AlertDialogFooter>
              </form>
            )}
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  )
}
