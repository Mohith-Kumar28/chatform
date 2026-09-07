"use client";

import { OrganizationsSettings } from "@/components/auth/organization/organizations-settings";
import { SettingsSectionHeader } from "@/components/settings/settings-section-header";

/**
 * The plural one: every workspace you belong to, and the invitations waiting for
 * you. Distinct from "General", which is the single workspace you are in right
 * now — the rail keeps them apart by naming that group after the workspace itself.
 */
export default function WorkspacesSettingsPage() {
  return (
    <>
      <SettingsSectionHeader
        title="Workspaces"
        description="Everywhere you have access, and any invitations waiting for you."
      />
      <OrganizationsSettings />
    </>
  );
}
