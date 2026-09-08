"use client";

import { OrganizationsSettings } from "@/components/auth/organization/organizations-settings";
import { SettingsSectionHeader } from "@/components/settings/settings-section-header";

/**
 * The plural one: every organization you belong to, and the invitations waiting
 * for you. Distinct from "General", which is the single organization you are in
 * right now — the rail keeps them apart by naming that group after the
 * organization itself.
 *
 * This page lived at `/settings/workspaces` while an organization was called a
 * workspace. That URL now belongs to the folders inside one.
 */
export default function OrganizationsSettingsPage() {
  return (
    <>
      <SettingsSectionHeader title="Organizations" />
      <OrganizationsSettings />
    </>
  );
}
