"use client";

import { usePathname, useRouter } from "next/navigation";
import { SCOPE_HOME, settingsScope } from "@/components/settings/sections";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

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
  const router = useRouter();
  const scope = settingsScope(pathname);

  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
      <h1 className="text-h1">{scope === "account" ? "Profile settings" : "Organization settings"}</h1>
      <Tabs value={scope} onValueChange={(v) => router.push(SCOPE_HOME[v as keyof typeof SCOPE_HOME])}>
        <TabsList>
          <TabsTrigger value="organization">Organization</TabsTrigger>
          <TabsTrigger value="account">Profile</TabsTrigger>
        </TabsList>
      </Tabs>
    </div>
  );
}
