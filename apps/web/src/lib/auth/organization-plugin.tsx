import { createAuthPlugin } from "@better-auth-ui/core"
import {
  organizationPlugin as coreOrganizationPlugin,
  type OrganizationLocalization,
  type OrganizationPluginOptions
} from "@better-auth-ui/core/plugins/organization"
import { Briefcase } from "lucide-react"

import { OrganizationsSettings } from "@/components/auth/organization/organizations-settings"
import { uploadAuthImage } from "@/lib/auth/upload-image"

/**
 * "Workspace", everywhere a person can read it.
 *
 * Better Auth calls this an organization and so does its UI; the product has
 * called it a workspace since before either was installed — the switcher in
 * the header, `/team`, the empty states. Left alone, the create dialog opened
 * from a menu item that says "New workspace" and titled itself "Create
 * organization", which reads as two different features.
 *
 * Only the strings a user sees are changed. `organization` stays the name of
 * the plugin, the endpoints, the tables and the role scope — renaming a noun
 * in the copy is not a reason to rename it in the code.
 */
const workspaceLocalization = {
  createOrganization: "Create workspace",
  deleteOrganization: "Delete workspace",
  deleteOrganizationDescription:
    "Permanently delete this workspace and all of its data. All members will lose access and this cannot be undone.",
  leaveOrganization: "Leave workspace",
  leaveOrganizationDescription:
    "Leave this workspace and lose access to its data and resources. You'll need a new invitation to rejoin.",
  leftOrganization: "You left the workspace",
  namePlaceholder: "Acme Inc",
  noOrganizations: "No workspaces",
  organization: "Workspace",
  organizationDeleted: "Workspace deleted",
  organizationLimitReached: "You have reached the workspace limit.",
  organizationProfile: "Workspace profile",
  organizationUpdatedSuccess: "Workspace updated",
  organizations: "Workspaces",
  organizationsDescription:
    "A workspace is where your forms, responses and teammates live.",
  acceptInvitationTitle: "Workspace invitation",
  changeMemberRoleDescription:
    "Choose the roles this member should have in the workspace.",
  inviteMemberDescription:
    "We'll email them a link to join this workspace. Choose the role they'll have once they accept.",
  membershipLimitReached: "This workspace has reached its member limit.",
  organizationInvitationsEmptyDescription:
    "Invite a teammate to collaborate in this workspace.",
  removeMemberWarning:
    "Are you sure you want to remove this member from the workspace? They will lose access immediately.",
  removeSelectedMembersDescription:
    "Remove the selected members from this workspace? They will lose access immediately.",
  slugPlaceholder: "workspace-slug",
  userInvitationsEmptyDescription:
    "Invitations to join a workspace will show up here."
} satisfies Partial<OrganizationLocalization>

export const organizationPlugin = createAuthPlugin(
  coreOrganizationPlugin.id,
  (options: OrganizationPluginOptions = {}) => {
    const core = coreOrganizationPlugin({
      ...options,
      /**
       * The logo needs its own uploader, and this is not belt-and-braces.
       *
       * The plugin resolves `logo` from Better Auth UI's *default* avatar
       * config rather than from the one `AuthProvider` is given, so the R2
       * uploader set in `auth-ui-provider` never reaches it. What it inherits
       * is `{ enabled, resize, size, extension }` and no `upload` — which does
       * not disable the feature, it silently selects the base64 fallback. That
       * would write a data URL into `organizations.logo`, a column carried in
       * the session cookie cache, and a 256px PNG against a 4KB cookie ceiling
       * is a broken session rather than a large one.
       */
      logo: { upload: uploadAuthImage, ...options.logo },
      /**
       * The segments the settings rail actually uses.
       *
       * Set here rather than at the provider because `organizationPlugin()` is
       * called bare in more than one place and each call reads its own
       * `viewPaths` — a default is the only way every call site agrees. The
       * library's own words are "organizations" and "settings"; ours are
       * "workspaces" and "general", and these are the URLs the rail links to,
       * so a mismatch shows up as a section that navigates to a 404.
       */
      viewPaths: {
        ...options.viewPaths,
        settings: { organizations: "workspaces", ...options.viewPaths?.settings },
        organization: { settings: "general", ...options.viewPaths?.organization },
      },
      localization: { ...workspaceLocalization, ...options.localization }
    })

    return {
      ...core,
      localization: core.localization as OrganizationLocalization,
      /**
       * `views.auth.acceptInvitation` is deliberately not set.
       *
       * Better Auth UI's version reads the invitation through
       * `GET /organization/get-invitation`, which requires a session whose
       * email already equals the invitee's and collapses every other case into
       * one opaque error — so a live invitation opened by somebody signed in as
       * the person who *sent* it reads as "no longer valid". Our own page at
       * `(auth)/accept-invitation` goes through `/api/invitation-preview`
       * instead, which needs no session and can tell revoked from used from
       * expired from wrong-account.
       *
       * Requiring email verification makes this the common path rather than an
       * edge: an invitee who signs up now has no session at all until they
       * confirm their address.
       */
      settingsTabs: [
        {
          view: "organizations",
          label: (
            <>
              <Briefcase className="text-muted-foreground" />
              {core.localization.organizations}
            </>
          ),
          component: OrganizationsSettings
        }
      ]
    }
  }
)
