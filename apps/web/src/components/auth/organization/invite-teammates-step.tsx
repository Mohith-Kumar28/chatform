"use client"

import { useQueryClient } from "@tanstack/react-query"
import { Loader2, Plus, X } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import { LockChip } from "@/components/billing/gate"
import { Button } from "@/components/ui/button"
import { DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select"
import { ENTITLEMENTS_KEY, useEntitlements } from "@/hooks/use-entitlements"
import { authClient } from "@/lib/auth/auth-client"
import {
  ASSIGNABLE_ROLES,
  type AssignableRole,
  DEFAULT_INVITE_ROLE,
} from "@/lib/roles"
import { cn } from "@/lib/utils"

/** One row of the form: an address and the role it is being invited to. */
interface Row {
  /** Stable across re-orders, so React does not reuse the wrong input. */
  id: number
  email: string
  role: AssignableRole
  /** Set only after a send attempt that this row specifically failed. */
  error?: string
}

let nextRowId = 0
const blankRow = (): Row => ({ id: nextRowId++, email: "", role: DEFAULT_INVITE_ROLE })

export type InviteTeammatesStepProps = {
  /**
   * Passed explicitly, never inferred from the session.
   *
   * `inviteMember` falls back to the active organization, and the workspace
   * that was just created only becomes active once a new session cookie is
   * issued — the API caches sessions for five minutes. Inferring it here is
   * how invitations meant for a brand-new workspace end up in the one the user
   * happened to be looking at before.
   */
  organizationId: string
  /** Named in the description, so it is obvious which workspace this fills. */
  organizationName: string
  /** Skipped, or finished sending. Either way the flow is over. */
  onDone: () => void
}

/**
 * "Now invite the people you made it for" — the second half of creating a
 * workspace, and skippable.
 *
 * Better Auth UI ships `InviteMemberDialog`, and this is deliberately not it.
 * That component is a good generic invite form, but it knows nothing about the
 * two things that decide whether an invitation here can succeed: seats are a
 * plan limit read from `/api/billing/entitlements`, and the roles are ours
 * (`editor`/`admin`/`viewer` with the blurbs that make them choosable) rather
 * than Better Auth's `owner`/`admin`/`member`. Using it would have offered
 * roles the product does not have and let somebody fill in five addresses on a
 * plan with three seats.
 *
 * Several rows rather than one, because this is the one moment when somebody
 * has their whole team in mind. `/team` invites one person at a time and that
 * is right for a roster you visit to add a hire to; it is wrong for the minute
 * after you name a workspace.
 *
 * Sent sequentially, and a failure does not discard the rest. Addresses are
 * typed from memory, so one of them being wrong — a typo, someone already
 * invited, the seat limit reached partway down — is the ordinary case, not the
 * exception. Every row that worked is dropped and every row that did not stays
 * on screen carrying the server's reason, so the fix is to correct that line
 * rather than to type all five again.
 */
export function InviteTeammatesStep({
  organizationId,
  organizationName,
  onDone,
}: InviteTeammatesStepProps) {
  const qc = useQueryClient()
  const ent = useEntitlements()
  const [rows, setRows] = useState<Row[]>(() => [blankRow()])
  const [sending, setSending] = useState(false)
  /**
   * Invitations this step has already got out of the door.
   *
   * Only ever non-zero after a partial failure — a clean send closes the
   * dialog — but a seat spent is a seat spent, and the count below has to
   * include them or a second attempt would offer seats that are already gone.
   */
  const [sent, setSent] = useState(0)

  /**
   * Entitlements are refreshed by whoever switched the active workspace, not
   * here.
   *
   * They do need refreshing — the seat limit this step enforces belongs to the
   * workspace that was created seconds ago, and the cached copy describes the
   * one before it. But doing that from a mount effect meant React's
   * development double-invoke started a refetch and then immediately cancelled
   * it, and query-core reports that cancellation as an unhandled AbortError
   * from inside its own batch, where a `.catch` on the returned promise never
   * sees it. `CreateOrganizationDialog` does it in the same handler that calls
   * `setActive`, which is both quieter and more honest about cause and effect.
   */

  const seatLimit = ent.limit("seats")
  // The creator holds the first seat, and anything already sent holds one each.
  const seatsUsed = 1 + sent
  // Only the rows with something in them count — three empty rows are not
  // three people.
  const filled = rows.filter((row) => row.email.trim().length > 0)
  const seatsAfter = seatsUsed + filled.length
  const overSeats = seatLimit !== null && seatsAfter > seatLimit
  const canAddRow = seatLimit === null || seatsUsed + rows.length < seatLimit

  const update = (id: number, patch: Partial<Row>) =>
    setRows((current) =>
      current.map((row) => (row.id === id ? { ...row, ...patch, error: undefined } : row)),
    )

  async function send() {
    if (filled.length === 0 || overSeats) return
    setSending(true)

    const failed: Row[] = []
    let sentNow = 0

    for (const row of filled) {
      const email = row.email.trim()
      try {
        const res = await authClient.organization.inviteMember({
          email,
          organizationId,
          role: row.role as never,
        })
        if (res.error) throw new Error(res.error.message ?? "Invite failed")
        sentNow++
      } catch (err) {
        failed.push({
          ...row,
          error: err instanceof Error ? err.message : "Invite failed",
        })
      }
    }

    // The roster and the seat count both moved; every gate in the product
    // reads the latter.
    await qc.invalidateQueries({ queryKey: ENTITLEMENTS_KEY })

    if (sentNow > 0) {
      setSent((current) => current + sentNow)
      toast.success(
        `${sentNow} ${sentNow === 1 ? "invitation" : "invitations"} sent`,
      )
    }

    if (failed.length === 0) {
      onDone()
      return
    }

    // Only the failures survive, so the next attempt is a correction rather
    // than a re-send of everything that already worked.
    setRows(failed)
    setSending(false)
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Invite your team</DialogTitle>
        <DialogDescription>
          {organizationName} is ready. Add the people who will work in it — or do this
          later from Team.
        </DialogDescription>
      </DialogHeader>

      <div className="flex flex-col gap-3">
        {rows.map((row, index) => (
          <div key={row.id} className="flex flex-col gap-1.5">
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                {/* Labelled once. Five repetitions of "Email address" down a
                    column says nothing the first one did not. */}
                {index === 0 && (
                  <Label htmlFor={`invite-email-${row.id}`} className="sr-only">
                    Email address
                  </Label>
                )}
                <Input
                  id={`invite-email-${row.id}`}
                  type="email"
                  autoFocus={index === 0}
                  placeholder="teammate@company.com"
                  value={row.email}
                  disabled={sending}
                  aria-invalid={Boolean(row.error)}
                  onChange={(e) => update(row.id, { email: e.target.value })}
                />
              </div>

              <Select
                value={row.role}
                disabled={sending}
                onValueChange={(value) => update(row.id, { role: value as AssignableRole })}
              >
                {/*
                  The label, spelled out, rather than `<SelectValue />`.

                  `SelectItem` puts everything it is given inside Radix's
                  `ItemText`, and `SelectValue` renders exactly that — so an
                  option carrying a blurb underneath its name puts the blurb in
                  the closed trigger too, where it clips to "Build forms ar…".
                  The two-line option is worth keeping: "Admin" and "Editor"
                  are not self-explanatory at the moment somebody is handing
                  out access. So the list keeps both lines and the trigger
                  names the role.
                */}
                <SelectTrigger className="w-28 shrink-0" aria-label="Role">
                  {ASSIGNABLE_ROLES.find((role) => role.value === row.role)?.label}
                </SelectTrigger>
                <SelectContent>
                  {ASSIGNABLE_ROLES.map((role) => (
                    <SelectItem
                      key={role.value}
                      value={role.value}
                      textValue={role.label}
                    >
                      <span className="flex flex-col gap-0.5">
                        <span>{role.label}</span>
                        <span className="text-muted-foreground text-xs">{role.blurb}</span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* The first row is the form; there is nothing to remove it to. */}
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Remove"
                disabled={sending || rows.length === 1}
                className={cn(rows.length === 1 && "invisible")}
                onClick={() => setRows((current) => current.filter((r) => r.id !== row.id))}
              >
                <X className="size-3.5" />
              </Button>
            </div>

            {row.error && <p className="text-destructive pl-1 text-xs">{row.error}</p>}
          </div>
        ))}

        <div className="flex items-center justify-between gap-3">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="w-fit"
            disabled={sending || !canAddRow}
            onClick={() => setRows((current) => [...current, blankRow()])}
          >
            <Plus className="size-3.5" />
            Add another
          </Button>

          {/* Only once the real number is in. A seat count that arrives wrong
              and corrects itself is worse than one that arrives late. */}
          {ent.data && seatLimit !== null && (
            <div className="flex items-center gap-2">
              <p
                className={cn(
                  "text-muted-foreground text-xs",
                  overSeats && "text-destructive",
                )}
              >
                {seatsAfter} of {seatLimit} seats
              </p>

              {/*
                The padlock sits by the number, not on the button.

                `LockedControl` is the right primitive for a full-width control
                — it lays its chip over the top-right corner, which on /team's
                "Send invite" lands in empty space. This button is compact and
                sits in a dialog footer, so the same chip lands squarely on top
                of the word "invitation". Same `LockChip`, same paywall, same
                `{ limit, used }` reason; it is only parked somewhere it can be
                read, next to the count that explains why it is there.
              */}
              {overSeats && (
                <LockChip
                  reason={{ limit: "seats", used: seatsUsed }}
                  context={{ surface: "create-workspace" }}
                />
              )}
            </div>
          )}
        </div>

        {overSeats && (
          <p className="text-muted-foreground text-xs">
            That is more people than this plan has seats for. Remove a row, or invite the
            rest from Team once there is room.
          </p>
        )}
      </div>

      <DialogFooter>
        {/* Skip is a real answer, not a way out, so it says what it is rather
            than wearing the muted "cancel" treatment — plenty of workspaces
            genuinely start with one person in them. */}
        <Button type="button" variant="ghost" onClick={onDone} disabled={sending}>
          Skip for now
        </Button>

        <Button
          type="button"
          onClick={send}
          disabled={sending || filled.length === 0 || overSeats}
        >
          {sending && <Loader2 className="size-3.5 animate-spin" />}
          {filled.length > 1 ? `Send ${filled.length} invitations` : "Send invitation"}
        </Button>
      </DialogFooter>
    </>
  )
}
