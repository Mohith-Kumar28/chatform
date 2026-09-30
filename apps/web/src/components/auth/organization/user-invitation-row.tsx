"use client"

import type { OrganizationAuthClient } from "@better-auth-ui/core/plugins/organization"
import { useAuth, useAuthPlugin } from "@better-auth-ui/react"
import { useQueryClient } from "@tanstack/react-query"
import { Check, Clock, X } from "lucide-react"
import { useState } from "react"

import type { PendingInvitation } from "@/components/dashboard/pending-invitations"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle
} from "@/components/ui/item"
import { Spinner } from "@/components/ui/spinner"
import { acceptAndEnter } from "@/lib/accept-invitation"
import { getGetApiMeInvitationsQueryKey } from "@/lib/api/dashboard/dashboard"
import { organizationPlugin } from "@/lib/auth/organization-plugin"
import { roleTitle } from "@/lib/roles"

export type UserInvitationRowProps = {
  invitation: PendingInvitation
}

/**
 * Single invitation row with accept/reject actions for the current user.
 * Accepting lands on the first workspace the invitation opens.
 */
export function UserInvitationRow({ invitation }: UserInvitationRowProps) {
  const { authClient } = useAuth<OrganizationAuthClient>()
  const { localization: organizationLocalization } =
    useAuthPlugin(organizationPlugin)
  const queryClient = useQueryClient()
  const [busy, setBusy] = useState<"accept" | "reject" | null>(null)

  const accept = async () => {
    setBusy("accept")
    try {
      await acceptAndEnter(invitation.id, invitation.workspaces[0]?.slug)
    } catch {
      setBusy(null)
    }
  }

  const reject = async () => {
    setBusy("reject")
    await authClient.organization.rejectInvitation({ invitationId: invitation.id })
    await queryClient.invalidateQueries({ queryKey: getGetApiMeInvitationsQueryKey() })
    setBusy(null)
  }

  const spaces = invitation.workspaces.map((w) => w.name).join(", ")

  return (
    <Item>
      <ItemMedia variant="icon">
        <Clock />
      </ItemMedia>
      <ItemContent>
        <ItemTitle>
          {invitation.organizationName}
          <Badge variant="secondary">{roleTitle(invitation.role)}</Badge>
        </ItemTitle>
        <ItemDescription>
          {spaces ? `${spaces} · ` : ""}Expires{" "}
          {new Date(invitation.expiresAt).toLocaleDateString(undefined, {
            dateStyle: "medium"
          })}
        </ItemDescription>
      </ItemContent>
      <ItemActions>
        <Button
          variant="outline"
          size="sm"
          disabled={busy !== null}
          onClick={() => void accept()}
        >
          {busy === "accept" ? <Spinner /> : <Check />}

          {organizationLocalization.accept}
        </Button>

        <Button
          variant="outline"
          size="icon"
          className="size-8 text-destructive"
          disabled={busy !== null}
          onClick={() => void reject()}
          aria-label={organizationLocalization.rejectInvitation}
        >
          {busy === "reject" ? <Spinner /> : <X />}
        </Button>
      </ItemActions>
    </Item>
  )
}
