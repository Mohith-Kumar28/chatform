"use client";

import { useSession } from "@/lib/auth/auth-client";
import { useActiveOrg } from "@/hooks/use-active-org";

interface MemberRow {
  userId: string;
  role: string;
}

/**
 * The caller's own role in the workspace they are currently in.
 *
 * Free, in the sense that it costs no request: Better Auth's active
 * organization already arrives with its members attached — it is what `/team`
 * renders the roster from — so the answer is a lookup in data the page has
 * anyway.
 *
 * `null` covers three different situations that all mean the same thing to a
 * caller, and none of which is worth a placeholder on screen: the session is
 * still loading, no organization is active yet, or the membership row has not
 * arrived. Callers render nothing rather than guessing at "member".
 *
 * Deliberately scoped to the *active* organization. `organization.list` returns
 * organizations without the membership that produced them, so a per-workspace
 * role for every row in the switcher would need an endpoint of its own — and
 * "what am I here" is the question people actually have.
 */
export function useMyRole(): string | null {
  const { data: session } = useSession();
  const { org } = useActiveOrg();

  const userId = session?.user?.id;
  if (!userId || !org) return null;

  const members = (org.members ?? []) as MemberRow[];
  return members.find((m) => m.userId === userId)?.role ?? null;
}
