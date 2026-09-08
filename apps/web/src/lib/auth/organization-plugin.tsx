import { createAuthPlugin } from "@better-auth-ui/core"
import {
  organizationPlugin as coreOrganizationPlugin,
  type OrganizationLocalization,
  type OrganizationPluginOptions
} from "@better-auth-ui/core/plugins/organization"
import { Briefcase } from "lucide-react"

import { OrganizationsSettings } from "@/components/auth/organization/organizations-settings"
import { uploadAuthImage } from "@/lib/auth/upload-image"
import { ROLE_LABELS } from "@/lib/roles"

/**
 * The words Better Auth UI uses, kept — with one clarification.
 *
 * This map used to rename every "organization" string to "workspace", because
 * the product called a Better Auth organization a workspace: the switcher, the
 * empty states, `/team`. That was the wrong noun in the wrong place. There has
 * always been a `workspaces` table with `forms.workspace_id` pointing at it;
 * it just had no UI, so the name was free to be borrowed. Now that workspaces
 * are real folders you can create and switch between, the two levels are:
 *
 *   organization   the account — subscription, seats, members, roles
 *   workspace      a folder of forms inside it
 *
 * and the library's own vocabulary is simply correct. What is left here is the
 * one thing it cannot know: that an invitation is to an *organization*, and so
 * grants a role and consumes a seat, rather than to any one folder.
 */
const orgLocalization = {
  organizationsDescription:
    "An organization is an account: it holds your plan, your teammates and the workspaces your forms live in.",
  inviteMemberDescription:
    "We'll email them a link to join this organization. Choose the role they'll have once they accept — it applies across every workspace in it.",
  changeMemberRoleDescription:
    "Choose the role this member should have. Roles are set per organization, not per workspace.",
  organizationInvitationsEmptyDescription:
    "Invite a teammate to collaborate across this organization.",
  userInvitationsEmptyDescription:
    "Invitations to join an organization will show up here."
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
       * This product's role vocabulary, not the library's.
       *
       * Unset, the plugin labels roles from its own hardcoded trio — Owner,
       * Admin, Member — which never matched what `permissions.ts` enforces. The
       * visible cost was in the members table: `editor` and `viewer`, the two
       * roles most people are meant to hold, had no label and rendered as raw
       * lowercase column values.
       *
       * This map is labels, not permission. It covers every role a row may
       * hold, including the two that exist but may not be handed out — see
       * `ROLE_LABELS` — and which of them an invitation may *assign* is a
       * separate question, answered by `ASSIGNABLE_ROLES` at each picker.
       */
      roles: options.roles ?? ROLE_LABELS,
      /**
       * A role is one choice, not a set.
       *
       * The library defaults this to true, so the picker was a checkbox menu
       * and an invitation could go out as "Admin, Member" — two roles that are
       * not alternatives, since `member` *is* `editor` and admin already
       * contains everything editor can do. Better Auth stores the pair
       * comma-separated and `roleAllows` unions their permissions, so it
       * resolved to plain admin: the row said something self-contradictory and
       * the product did the sensible thing with it, which is the worst place
       * for a control to be — nothing visibly breaks and the stored data is
       * nonsense.
       */
      allowMultipleRoles: options.allowMultipleRoles ?? false,
      /**
       * The segments the settings rail actually uses.
       *
       * Set here rather than at the provider because `organizationPlugin()` is
       * called bare in more than one place and each call reads its own
       * `viewPaths` — a default is the only way every call site agrees. These
       * are the URLs the rail links to, so a mismatch shows up as a section
       * that navigates to a 404.
       *
       * `organizations` pointed at "workspaces" while the two words meant the
       * same thing. `/settings/workspaces` is now the folders inside an
       * organization, and this list of organizations moved to its own segment —
       * so the old value would have sent this rail to the wrong page rather
       * than to no page, which is the harder kind of wrong to notice.
       */
      viewPaths: {
        ...options.viewPaths,
        settings: { organizations: "organizations", ...options.viewPaths?.settings },
        organization: { settings: "general", ...options.viewPaths?.organization },
      },
      localization: { ...orgLocalization, ...options.localization }
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
