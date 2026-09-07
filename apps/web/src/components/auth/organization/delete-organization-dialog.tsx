"use client"

import type { OrganizationAuthClient } from "@better-auth-ui/core/plugins/organization"
import { useAuth, useAuthPlugin } from "@better-auth-ui/react"
import { useDeleteOrganization } from "@better-auth-ui/react/plugins/organization"
import type { Organization } from "better-auth/client"
import { TriangleAlert } from "lucide-react"
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
import { Card, CardContent } from "@/components/ui/card"
import { organizationPlugin } from "@/lib/auth/organization-plugin"
import { useAuthForm } from "../auth-form"
import { OrganizationView } from "./organization-view"

export type DeleteOrganizationDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  organization: Organization
}

export function DeleteOrganizationDialog({
  open,
  onOpenChange,
  organization
}: DeleteOrganizationDialogProps) {
  const { authClient, basePaths, localization } =
    useAuth<OrganizationAuthClient>()
  const {
    localization: organizationLocalization,
    viewPaths: organizationPluginViewPaths
  } = useAuthPlugin(organizationPlugin)

  const { mutateAsync: deleteOrganization, isPending } = useDeleteOrganization(
    authClient,
    {
      onSuccess: () => {
        onOpenChange(false)
        toast.success(organizationLocalization.organizationDeleted)

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

  const form = useAuthForm({
    defaultValues: {},
    onSubmit: async () => {
      await deleteOrganization({ organizationId: organization.id })
    }
  })

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <form.AppForm>
          <form.AuthFormRoot className="flex flex-col gap-6">
            <AlertDialogHeader>
              <AlertDialogMedia className="bg-destructive/10 text-destructive">
                <TriangleAlert />
              </AlertDialogMedia>

              <AlertDialogTitle>
                {organizationLocalization.deleteOrganization}
              </AlertDialogTitle>

              <AlertDialogDescription>
                {organizationLocalization.deleteOrganizationDescription}
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

              <form.AuthFormSubmitButton
                isPending={isPending}
                variant="destructive"
                disabled={isPending}
              >
                {organizationLocalization.deleteOrganization}
              </form.AuthFormSubmitButton>
            </AlertDialogFooter>
          </form.AuthFormRoot>
        </form.AppForm>
      </AlertDialogContent>
    </AlertDialog>
  )
}
