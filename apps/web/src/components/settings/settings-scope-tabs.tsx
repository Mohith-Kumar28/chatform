"use client";

import { usePathname } from "next/navigation";
import { Building2, User } from "lucide-react";
import { SCOPE_HOME, settingsScope } from "@/components/settings/sections";
import { SegmentedControl } from "@/components/ui/segmented-control";

/**
 * The settings title and the switch between its two halves.
 *
 * Organization settings are the account everyone in it shares; profile
 * settings are yours alone. Each has its own addresses (`/settings/general`
 * and on, `/settings/profile` and on), so the avatar menu and the
 * organization switcher each open the right one, and a tab crosses over.
 */
export function SettingsScopeTabs() {
  const pathname = usePathname();
  const scope = settingsScope(pathname);

  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
      <h1 className="text-h1">{scope === "account" ? "Profile settings" : "Organization settings"}</h1>
      {/* The product's one segmented control, so it looks and moves like every other. */}
      <SegmentedControl
        ariaLabel="Settings for"
        value={scope}
        options={[
          { value: "organization", label: "Organization", icon: Building2, href: SCOPE_HOME.organization },
          { value: "account", label: "Profile", icon: User, href: SCOPE_HOME.account },
        ]}
      />
    </div>
  );
}
