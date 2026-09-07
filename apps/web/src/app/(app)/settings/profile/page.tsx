"use client";

import { AccountSettings } from "@/components/auth/settings/account/account-settings";
import { SettingsSectionHeader } from "@/components/settings/settings-section-header";

/**
 * Composed from the library's inner card group directly, not its `<Settings>`
 * wrapper. That wrapper is a tab strip plus a path-to-view resolver, and the
 * rail now does both — rendering it here would put a second navigation for the
 * same six destinations inside the pane, and its resolver is exactly what forced
 * the allow-list page this replaces.
 */
export default function ProfileSettingsPage() {
  return (
    <>
      <SettingsSectionHeader title="Profile" description="How you appear, and the address we reach you at." />
      <AccountSettings />
    </>
  );
}
