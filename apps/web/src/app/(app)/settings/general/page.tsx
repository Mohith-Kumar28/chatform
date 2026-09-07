"use client";

import { Building2 } from "lucide-react";
import { OrganizationSettings } from "@/components/auth/organization/organization-settings";
import { SettingsSectionHeader } from "@/components/settings/settings-section-header";
import { useActiveOrg } from "@/hooks/use-active-org";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * This workspace's name, logo and danger zone.
 *
 * `OrganizationSettings` is kept — unlike the `<Settings>`/`<Organization>` tab
 * shells — because it does something beyond routing: it threads plugin-supplied
 * `organizationCards` between the profile form and the danger zone. The ids it
 * needs used to come from the `<Organization>` wrapper; they come from
 * `useActiveOrg()` now, which is the same org source the People section reads,
 * so the whole shell agrees about which workspace it is showing.
 */
export default function GeneralSettingsPage() {
  const { org, isPending } = useActiveOrg();

  if (isPending) {
    return (
      <>
        <SettingsSectionHeader title="General" />
        <div className="space-y-4">
          <Skeleton className="h-44 rounded-xl" />
          <Skeleton className="h-36 rounded-xl" />
        </div>
      </>
    );
  }

  if (!org) {
    return (
      <>
        <SettingsSectionHeader title="General" />
        <EmptyState
          icon={Building2}
          title="You're not in a workspace yet"
          description="Create one from the switcher in the header, and its name, logo and people will appear here."
        />
      </>
    );
  }

  return (
    <>
      <SettingsSectionHeader title="General" description="What this workspace is called, and how to leave it." />
      <OrganizationSettings organizationId={org.id} organizationSlug={org.slug ?? undefined} />
    </>
  );
}
