"use client"

import { useQueryClient } from "@tanstack/react-query"
import { Loader2, UserPlus } from "lucide-react"
import { useEffect, useState } from "react"
import { toast } from "sonner"
import { LockedControl } from "@/components/billing/gate"
import {
  grantsToList,
  OrgRoleChoice,
  refreshAccess,
  WorkspaceGrantsPicker,
  WorkspaceRoleHelp,
  type Grants,
  type WorkspaceLite
} from "@/components/settings/access/access-shared"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { useEntitlements } from "@/hooks/use-entitlements"
import { getGetApiWorkspacesQueryKey, useGetApiWorkspaces, usePostApiInvitations } from "@/lib/api/dashboard/dashboard"
import { apiData } from "@/lib/api/payload"
import { DEFAULT_INVITE_ROLE, type AssignableRole } from "@/lib/roles"

/** Props for the `InviteMemberDialog` component. */
export type InviteMemberDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /**
   * The workspace to start ticked, as Editor: the one the invite was opened
   * from. Absent, a single-workspace organization ticks its only one.
   */
  defaultWorkspaceId?: string
  /**
   * Opened from somewhere that is looking at a workspace by URL: its `?ws=`
   * slug, or null for the first workspace. Resolved once the list arrives.
   */
  currentWorkspaceSlug?: string | null
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** The message the server sent, or the exception's own. */
function reason(err: unknown): string | undefined {
  if (err && typeof err === "object" && "error" in err) {
    const inner = (err as { error?: { message?: string } }).error
    if (inner?.message) return inner.message
  }
  return err instanceof Error ? err.message : undefined
}

/**
 * Invite someone: an address, a role, and for a member, which workspaces.
 *
 * One step, the way Typeform, Tally and Notion do it. Admin needs no workspace
 * list because an admin opens every workspace; a member needs at least one,
 * or they would arrive in an organization where they can open nothing.
 *
 * Sent through `POST /api/invitations`, which still has Better Auth create the
 * invitation (so the seat check and the email are unchanged) and then records
 * the workspaces for the moment it is accepted. A seat refusal is a 402 gate
 * envelope, which the app's fetch layer turns into the paywall on its own.
 */
export function InviteMemberDialog({
  open,
  onOpenChange,
  defaultWorkspaceId,
  currentWorkspaceSlug
}: InviteMemberDialogProps) {
  const queryClient = useQueryClient()
  const { data } = useGetApiWorkspaces({ query: { queryKey: getGetApiWorkspacesQueryKey(), enabled: open } })
  const workspaces = apiData<WorkspaceLite[]>(data) ?? []

  const [email, setEmail] = useState("")
  const [role, setRole] = useState<AssignableRole>(DEFAULT_INVITE_ROLE)
  const [grants, setGrants] = useState<Grants>({})
  const [touched, setTouched] = useState(false)

  // The workspace to start ticked: named outright, or the one the page is on.
  const startId =
    defaultWorkspaceId ??
    (currentWorkspaceSlug !== undefined
      ? (workspaces.find((w) => (w as { slug?: string }).slug === currentWorkspaceSlug) ?? workspaces[0])?.id
      : workspaces.length === 1
        ? workspaces[0]!.id
        : undefined)

  // Fresh every time it opens.
  useEffect(() => {
    if (!open) return
    setEmail("")
    setRole(DEFAULT_INVITE_ROLE)
    setTouched(false)
    setGrants({})
  }, [open])

  // Tick the starting workspace once it is known, unless someone already chose.
  useEffect(() => {
    if (!open || !startId) return
    setGrants((g) => (Object.keys(g).length ? g : { [startId]: "editor" }))
  }, [open, startId])

  const invite = usePostApiInvitations()

  const ent = useEntitlements()
  const seatLimit = ent.limit("seats")
  const seatsUsed = ent.data?.gauges.seats ?? 0
  const atSeatLimit = seatLimit !== null && seatsUsed >= seatLimit

  const emailValid = EMAIL.test(email.trim())
  const needsWorkspace = role === "member" && Object.keys(grants).length === 0
  const canSubmit = emailValid && !needsWorkspace && !invite.isPending && !atSeatLimit

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setTouched(true)
    if (!canSubmit) return
    try {
      await invite.mutateAsync({
        data: {
          email: email.trim(),
          role,
          workspaces: role === "member" ? grantsToList(grants) : []
        }
      })
      await refreshAccess(queryClient)
      toast.success(`Invitation sent to ${email.trim()}`)
      onOpenChange(false)
    } catch (err) {
      // A 402 has already opened the paywall; anything else is worth a toast.
      const status = (err as { status?: number })?.status
      if (status === 402) {
        onOpenChange(false)
        return
      }
      toast.error("Couldn't send the invitation", { description: reason(err) })
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={submit} className="flex flex-col gap-5">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="size-4" />
              Invite a teammate
            </DialogTitle>
            <DialogDescription>They get an email with a link to join.</DialogDescription>
          </DialogHeader>

          <Field data-invalid={touched && !emailValid}>
            <FieldLabel htmlFor="invite-email">Email</FieldLabel>
            <Input
              id="invite-email"
              type="email"
              autoFocus
              placeholder="name@company.com"
              value={email}
              disabled={invite.isPending}
              onChange={(e) => setEmail(e.target.value)}
              aria-invalid={touched && !emailValid}
            />
          </Field>

          <Field>
            <FieldLabel>Role</FieldLabel>
            <OrgRoleChoice value={role} onChange={setRole} disabled={invite.isPending} idPrefix="invite-role" />
          </Field>

          {role === "member" && (
            <Field data-invalid={touched && needsWorkspace}>
              <FieldLabel>Workspaces</FieldLabel>
              <WorkspaceGrantsPicker
                workspaces={workspaces}
                value={grants}
                onChange={setGrants}
                disabled={invite.isPending}
              />
              {touched && needsWorkspace ? (
                <FieldDescription className="text-destructive">Pick at least one workspace.</FieldDescription>
              ) : (
                <WorkspaceRoleHelp />
              )}
            </Field>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={invite.isPending}>
              Cancel
            </Button>
            {/* Padlocked rather than merely disabled: the chip is the only
                thing here that names the plan which would raise the ceiling. */}
            <LockedControl limit="seats" used={seatsUsed} locked={atSeatLimit} chip="inline">
              <Button type="submit" disabled={invite.isPending || atSeatLimit}>
                {invite.isPending && <Loader2 className="size-3.5 animate-spin" />}
                Send invite
              </Button>
            </LockedControl>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
