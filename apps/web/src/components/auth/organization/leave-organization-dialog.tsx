"use client"

import type { OrganizationAuthClient } from "@better-auth-ui/core/plugins/organization"
import { useAuth, useAuthPlugin } from "@better-auth-ui/react"
import { useLeaveOrganization } from "@better-auth-ui/react/plugins/organization"
import type { Organization } from "better-auth/client"
import { LogOut } from "lucide-react"
import { toast } from "sonner"

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Spinner } from "@/components/ui/spinner"
import { organizationPlugin } from "@/lib/auth/organization-plugin"
import { OrganizationView } from "./organization-view"

export type LeaveOrganizationDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  organization: Organization
}

export function LeaveOrganizationDialog({
  open,
  onOpenChange,
  organization
}: LeaveOrganizationDialogProps) {
  const { authClient, basePaths, localization } =
    useAuth<OrganizationAuthClient>()
  const {
    localization: organizationLocalization,
    viewPaths: organizationPluginViewPaths
  } = useAuthPlugin(organizationPlugin)

  const { mutate: leaveOrganization, isPending } = useLeaveOrganization(
    authClient,
    {
      onSuccess: () => {
        onOpenChange(false)
        toast.success(organizationLocalization.leftOrganization)

        /*
          A real navigation, not a router transition.

          The workspace you were in lives in the session cookie, and the server
          reads it on every request — so leaving one changes state that no
          client-side cache can see. Better Auth clears the session's active
          organization on the way out, and a `router.replace` would then paint
          the new page over a header, a workspace switcher and a react-query
          cache all still holding the workspace you just left. That is exactly
          what people saw: the nav bar naming a workspace they were no longer
          a member of, and a refresh that did not help because the client had
          never been told to forget it.

          `WorkspaceSwitcher` reached the same conclusion for `setActive` and
          says so in the same words. This is the other half of that rule: any
          write that moves you between workspaces leaves the page.
        */
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination
        window.location.assign(
          `${basePaths.settings}/${organizationPluginViewPaths.settings.organizations}`
        )
      }
    }
  )

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogMedia className="bg-destructive/10 text-destructive">
            <LogOut />
          </AlertDialogMedia>

          <AlertDialogTitle>
            {organizationLocalization.leaveOrganization}
          </AlertDialogTitle>

          <AlertDialogDescription>
            {organizationLocalization.leaveOrganizationDescription}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <Card>
          <CardContent>
            <OrganizationView organization={organization} hideRole />
          </CardContent>
        </Card>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>
            {localization.settings.cancel}
          </AlertDialogCancel>

          <Button
            variant="destructive"
            disabled={isPending}
            onClick={() =>
              leaveOrganization({ organizationId: organization.id })
            }
          >
            {isPending && <Spinner />}

            {organizationLocalization.leaveOrganization}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
