"use client";

import { SecuritySettings } from "@/components/auth/settings/security/security-settings";
import { SettingsSectionHeader } from "@/components/settings/settings-section-header";

export default function SecuritySettingsPage() {
  return (
    <>
      <SettingsSectionHeader
        title="Security"
        description="Your password, the accounts you sign in with, and every session that is currently open."
      />
      <SecuritySettings />
    </>
  );
}
