"use client"

import { formatAdditionalFieldValue } from "@better-auth-ui/core"
import {
  memberRoleLabels,
  type OrganizationAuthClient
} from "@better-auth-ui/core/plugins/organization"
import { useAuth, useAuthPlugin } from "@better-auth-ui/react"
import {
  useCancelInvitation,
  useHasPermission,
  useInviteMember
} from "@better-auth-ui/react/plugins/organization"
import type { Invitation } from "better-auth/client"
import { Send, X } from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { TableCell, TableRow } from "@/components/ui/table"
import { organizationPlugin } from "@/lib/auth/organization-plugin"
import { useClientValue } from "@/hooks/use-client-value"
import { cn } from "@/lib/utils"
import { OrganizationInvitationRowSkeleton } from "./organization-invitation-row-skeleton"
import {
  type OrganizationSelectableRow,
  OrganizationTableSelectRow
} from "./organization-table-selection"

export type OrganizationInvitationRowProps = {
  invitation: Invitation
  selectableRow?: OrganizationSelectableRow<Invitation>
  showCreatedAt?: boolean
  showEmail?: boolean
  showRole?: boolean
  showStatus?: boolean
}

/*
  Design tokens, not raw palette steps.

  `bg-amber-500/10 text-amber-600 dark:text-amber-400` is the library's default
  and it is the one pairing this codebase has already shipped a contrast bug
  with — the soft/foreground pairs are defined together precisely so the ink and
  the ground are lit for each other in both themes.
*/
const statusBadgeClasses: Record<string, string> = {
  pending: "bg-[var(--warning-soft)] text-[var(--warning-soft-foreground)]",
  expired: "bg-muted text-muted-foreground",
  accepted: "bg-[var(--success-soft)] text-[var(--success-soft-foreground)]",
  rejected: "bg-[var(--destructive-soft)] text-[var(--destructive-soft-foreground)]",
  canceled: "bg-muted text-muted-foreground"
}

export function OrganizationInvitationRow({
  invitation,
  selectableRow,
  showCreatedAt = true,
  showEmail = true,
  showRole = true,
  showStatus = true
}: OrganizationInvitationRowProps) {
  const { authClient } = useAuth<OrganizationAuthClient>()
  const {
    modelFields: { invitation: invitationFields },
    localization: organizationLocalization,
    roles
  } = useAuthPlugin(organizationPlugin)

  const {
    data: cancelInvitationPermission,
    isPending: cancelPermissionPending
  } = useHasPermission(authClient, {
    permissions: { invitation: ["cancel"] }
  })

  const { mutate: cancelInvitation, isPending: cancelPending } =
    useCancelInvitation(authClient)

  const { data: inviteMemberPermission, isPending: invitePermissionPending } =
    useHasPermission(authClient, {
      permissions: { invitation: ["create"] }
    })

  // Better Auth treats a re-invite as a resend: it extends the existing
  // invitation's expiry and sends the email again rather than creating a
  // second row.
  const { mutate: resendInvitation, isPending: resendPending } =
    useInviteMember(authClient, {
      onSuccess: () => toast.success(organizationLocalization.invitationResent)
    })

  const roleLabel = memberRoleLabels(invitation.role, roles).join(", ")

  /**
   * An invitation that has lapsed still says `pending` in the row.
   *
   * Better Auth never writes `status` back to `expired` — expiry is only checked
   * at accept time, against `expires_at`. So the table showed a week-old dead
   * invite in the same amber as one sent a minute ago, and the only way to find
   * out was to invite the person again. The server already excludes these from
   * `countSeats`, so a seat is not being held; the row just has to stop implying
   * that one is.
   */
  /* One clock reading per mount, not one per render: `Date.now()` in render is
     impure, and a 48-hour window does not need a clock that ticks. */
  const now = useClientValue(() => Date.now(), 0)
  const expired =
    now > 0 &&
    invitation.status === "pending" &&
    new Date(invitation.expiresAt).getTime() <= now
  const effectiveStatus = expired ? "expired" : invitation.status

  const statusLabel = expired
    ? "Expired"
    : (organizationLocalization[
        invitation.status as keyof typeof organizationLocalization
      ] ?? invitation.status)

  if (cancelPermissionPending || invitePermissionPending) {
    return <OrganizationInvitationRowSkeleton />
  }

  const isPending = invitation.status === "pending"

  return (
    <TableRow
      data-state={selectableRow?.getIsSelected() ? "selected" : undefined}
    >
      {selectableRow && (
        <TableCell>
          <OrganizationTableSelectRow
            localization={organizationLocalization}
            row={selectableRow}
          />
        </TableCell>
      )}

      {showEmail && (
        <TableCell>
          <div className="flex flex-col gap-1">
            <span className="font-medium text-sm">{invitation.email}</span>
            {invitationFields.map((field) => {
              const value = formatAdditionalFieldValue(
                (invitation as unknown as Record<string, unknown>)[field.name]
              )
              return value ? (
                <span
                  className="text-xs text-muted-foreground"
                  key={field.name}
                >
                  {field.label}: {value}
                </span>
              ) : null
            })}
          </div>
        </TableCell>
      )}

      {showCreatedAt && (
        <TableCell className="text-muted-foreground text-xs tabular-nums whitespace-nowrap">
          {new Date(invitation.createdAt).toLocaleString(undefined, {
            dateStyle: "short",
            timeStyle: "short"
          })}
        </TableCell>
      )}

      {showRole && <TableCell className="text-sm">{roleLabel}</TableCell>}

      {showStatus && (
        <TableCell className="text-sm">
          <Badge
            variant="secondary"
            className={cn(statusBadgeClasses[effectiveStatus])}
          >
            {String(statusLabel)}
          </Badge>
        </TableCell>
      )}

      <TableCell className="text-end">
        <div className="flex justify-end gap-2">
          {inviteMemberPermission?.success && isPending && (
            <Button
              size="icon"
              variant="outline"
              className="size-8"
              disabled={resendPending}
              onClick={() =>
                resendInvitation({
                  ...Object.fromEntries(
                    invitationFields.flatMap((field) => {
                      const value = (
                        invitation as unknown as Record<string, unknown>
                      )[field.name]
                      return value === undefined ? [] : [[field.name, value]]
                    })
                  ),
                  email: invitation.email,
                  organizationId: invitation.organizationId,
                  role: invitation.role as Parameters<
                    typeof resendInvitation
                  >[0]["role"],
                  resend: true
                })
              }
              aria-label={organizationLocalization.resendInvitation}
            >
              {resendPending ? <Spinner /> : <Send />}
            </Button>
          )}

          {cancelInvitationPermission?.success && isPending && (
            <Button
              size="icon"
              variant="outline"
              className="size-8 text-destructive"
              disabled={cancelPending}
              onClick={() => cancelInvitation({ invitationId: invitation.id })}
              aria-label={organizationLocalization.cancelInvitation}
            >
              {cancelPending ? <Spinner /> : <X />}
            </Button>
          )}
        </div>
      </TableCell>
    </TableRow>
  )
}
