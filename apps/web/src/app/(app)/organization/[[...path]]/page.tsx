"use client";

import { use } from "react";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { Organization } from "@/components/auth/organization/organization";
import { organizationPlugin } from "@/lib/auth/organization-plugin";

/**
 * The workspace you are currently in.
 *
 * `/team` answers "who is in this workspace and what can they do" — it is the
 * screen built around our seat limits and plan gates, and it stays. This one
 * answers the questions it never covered: what the workspace is called, what
 * its slug and logo are, and how to get out of it. Leaving is the one that was
 * genuinely missing — there was no way to do it anywhere in the product.
 *
 * `teams` and `roles` are real segments in the plugin but nothing enables them
 * on the server, so they are left out of the allow-list rather than rendered
 * as tabs that resolve to nothing.
 */
const VIEW_PATHS = organizationPlugin().viewPaths.organization;
const ALLOWED = [VIEW_PATHS.settings, VIEW_PATHS.people];

export default function OrganizationPage({ params }: { params: Promise<{ path?: string[] }> }) {
  const { path } = use(params);
  const segment = path?.[0] ?? VIEW_PATHS.settings;
  if (path && path.length > 1) notFound();
  if (!ALLOWED.includes(segment)) notFound();

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
      <PageHeader title="Workspace" description="The workspace's name and logo, who is in it, and how to leave." />
      <Organization path={segment} className="mt-6" />
    </div>
  );
}
