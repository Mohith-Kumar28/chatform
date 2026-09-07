import { redirect } from "next/navigation";

/**
 * `/account` is now the Account half of `/settings`.
 *
 * Kept as a catch-all so the segments the old tab strip produced still resolve —
 * these are real bookmarks, and the library itself linked to them until
 * `basePaths` was re-rooted. An unrecognised segment lands on Profile rather
 * than 404-ing: an old link deserves the section, not a dead end.
 */
const SECTIONS: Record<string, string> = {
  account: "/settings/profile",
  profile: "/settings/profile",
  security: "/settings/security",
  organizations: "/settings/workspaces",
  workspaces: "/settings/workspaces",
};

export default async function AccountPage({ params }: { params: Promise<{ path?: string[] }> }) {
  const { path } = await params;
  redirect(SECTIONS[path?.[0] ?? ""] ?? "/settings/profile");
}
