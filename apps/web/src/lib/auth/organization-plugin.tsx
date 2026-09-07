import { createAuthPlugin } from "@better-auth-ui/core"
import {
  organizationPlugin as coreOrganizationPlugin,
  type OrganizationLocalization,
  type OrganizationPluginOptions
} from "@better-auth-ui/core/plugins/organization"
import { Briefcase } from "lucide-react"

import { OrganizationsSettings } from "@/components/auth/organization/organizations-settings"

export const organizationPlugin = createAuthPlugin(
  coreOrganizationPlugin.id,
  (options: OrganizationPluginOptions = {}) => {
    const core = coreOrganizationPlugin(options)

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
