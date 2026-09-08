"use client";

import { WorkspacesSection } from "@/components/settings/workspaces-section";

/**
 * The folders inside the organization you are in.
 *
 * This URL used to render the list of organizations you belong to, back when an
 * organization was called a workspace. That list now lives at
 * `/settings/organizations`.
 */
export default function WorkspacesSettingsPage() {
  return <WorkspacesSection />;
}
