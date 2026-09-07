"use client";

import { use } from "react";
import { notFound } from "next/navigation";
import { viewPaths } from "@better-auth-ui/core";
import { PageHeader } from "@/components/ui/page-header";
import { Settings } from "@/components/auth/settings/settings";
import { organizationPlugin } from "@/lib/auth/organization-plugin";

/**
 * Your account.
 *
 * Everything on this screen is a Better Auth UI card, and that is the point:
 * name and avatar, the address on the account and the two codes it takes to
 * move it, the password, the linked Google account, and every session signed
 * in right now with the device it is on and a button to end it. Writing any of
 * that by hand would have meant re-deriving rules — reauthentication before a
 * sensitive change, revoking the session you are currently using, the order of
 * the two-step email change — that this library already gets right.
 *
 * The third tab comes from the organization plugin and lists the workspaces
 * you belong to plus any invitations waiting for you. `/team` is still the
 * screen for running *a* workspace; this is the one for seeing which ones you
 * are in and leaving one.
 *
 * An optional catch-all rather than a required segment so `/account` itself is
 * a real address — a menu item pointing at `/account/account` reads like a
 * mistake.
 */
const SETTINGS_PATHS = [
  ...Object.values(viewPaths.settings),
  ...Object.values(organizationPlugin().viewPaths?.settings ?? {}),
];

export default function AccountPage({ params }: { params: Promise<{ path?: string[] }> }) {
  const { path } = use(params);
  const segment = path?.[0] ?? viewPaths.settings.account;
  if (path && path.length > 1) notFound();
  if (!SETTINGS_PATHS.includes(segment)) notFound();

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
      <PageHeader title="Account" description="Your profile, sign-in details, and the workspaces you belong to." />
      <Settings path={segment} className="mt-6" />
    </div>
  );
}
