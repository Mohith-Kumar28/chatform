"use client";

import { useEffect, useState } from "react";
import { authClient, useActiveOrganization, useListOrganizations } from "@/lib/auth/auth-client";

/**
 * One repair per page load, shared by every caller.
 *
 * The switcher in the header and the page under it both ask for the active
 * organization; without this they would send two identical `setActive` calls on
 * the same render. Holding the promise rather than a boolean means the second
 * caller waits on the first one's answer instead of racing it — and a caller
 * that mounts after the repair has already failed learns that immediately.
 *
 * Resolves to whether an organization ended up active.
 */
let repair: Promise<boolean> | null = null;

function repairActiveOrg(organizationId: string): Promise<boolean> {
  repair ??= authClient.organization
    .setActive({ organizationId })
    .then((res) => !res.error)
    .catch(() => false);
  return repair;
}

/**
 * The active organization, repairing a session that never picked one.
 *
 * `sessions.active_organization_id` is only written when something sets it, and
 * until recently nothing did — signup created the organization and the
 * membership and left the session pointing at nothing. New sessions are fixed
 * server-side (`defaultActiveOrgId` in the API), but every session issued before
 * that is still null, and those users would have to sign out and back in to get
 * a working `/team`.
 *
 * So: if the account belongs to organizations and none of them is active, adopt
 * the first one — the same one `resolveOrgId` has been serving their data from
 * all along, so nothing they see changes except that the session now agrees.
 * `setActive` is a Better Auth endpoint, and the organization client's own atom
 * listeners refetch the active org when it returns, so the caller re-renders
 * with a real organization rather than an empty state.
 *
 * An account with organizations but none active is therefore never *settled* —
 * it is mid-repair — which is why `isPending` covers it. Only a refusal (offline,
 * a revoked session) or an account with no memberships at all lets a caller
 * render its empty state.
 */
export function useActiveOrg() {
  const { data: active, isPending: activePending } = useActiveOrganization();
  const { data: orgs, isPending: listPending } = useListOrganizations();
  const [failed, setFailed] = useState(false);

  const first = orgs?.[0];
  const needsRepair = !activePending && !active && Boolean(first) && !failed;

  useEffect(() => {
    if (!needsRepair || !first) return;
    void repairActiveOrg(first.id).then((ok) => {
      if (!ok) setFailed(true);
    });
  }, [needsRepair, first]);

  return {
    org: active ?? null,
    isPending: activePending || listPending || needsRepair,
  };
}
