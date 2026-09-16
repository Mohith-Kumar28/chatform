import type { Bindings } from "../../env.js";

/**
 * Whether verified gateway payments are on for this organization.
 *
 * Everything gateway-shaped sits behind this — the connect routes, starting a
 * checkout, the builder's method choice — so production can ship the code with
 * the flag off, then turn it on for one internal org on sandbox accounts before
 * anyone else. `PAYMENTS_GATEWAY_ENABLED=on` is general availability; until
 * then `PAYMENTS_GATEWAY_ORGS` is the allow-list.
 *
 * Webhooks deliberately do not consult it. A payment already taken on an
 * org that was then flagged off still has to be recorded, or the respondent
 * paid and nothing anywhere says so.
 */
export function gatewayEnabled(
  env: Pick<Bindings, "PAYMENTS_GATEWAY_ENABLED" | "PAYMENTS_GATEWAY_ORGS">,
  orgId: string | null | undefined,
): boolean {
  if (env.PAYMENTS_GATEWAY_ENABLED?.trim().toLowerCase() === "on") return true;
  if (!orgId) return false;
  return (env.PAYMENTS_GATEWAY_ORGS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .includes(orgId);
}
