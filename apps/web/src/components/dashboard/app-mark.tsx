"use client";

import { useState } from "react";
import { LogoMark } from "@/components/brand/logo";
import { useActiveOrg } from "@/hooks/use-active-org";

/**
 * The mark in the app header.
 *
 * It was a rounded orange square with a lowercase "c" in it — a placeholder
 * that outlived the logo it was standing in for. We ship an actual mark
 * (`LogoMark`, two plates and two tails); the header is the one place in the
 * product that was still ignoring it.
 *
 * A workspace that has uploaded its own logo gets that instead. Better Auth's
 * organization plugin already carries `logo` on the org, so this reads a field
 * that exists rather than inventing branding: someone who has told us what
 * their company looks like should see it, and everyone else sees ours. A URL
 * that fails to load falls back to our mark rather than leaving a broken-image
 * glyph in the chrome — the address is whatever the workspace typed, and it can
 * rot long after it was typed.
 */
export function AppMark({ className }: { className?: string }) {
  const { org } = useActiveOrg();
  const [broken, setBroken] = useState(false);
  const logo = org?.logo;

  if (!logo || broken) return <LogoMark className={className} />;

  return (
    // eslint-disable-next-line @next/next/no-img-element -- an arbitrary remote host, not a configured image domain
    <img
      src={logo}
      alt={org?.name ? `${org.name} logo` : "Workspace logo"}
      className={className ?? "size-7 shrink-0 rounded-lg object-cover"}
      onError={() => setBroken(true)}
    />
  );
}
