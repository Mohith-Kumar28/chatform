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

/**
 * Local escape hatch: take a payment from a respondent nobody has identified.
 *
 * Sign-in is a rule about the money, not a UI preference — a payment that is
 * not tied to a verified person cannot be matched to the human who says they
 * paid, and refunds and duplicate-detection both work from that identity. So
 * the product requires it, `lint` refuses to publish a gateway block without
 * it, and `startPayment` refuses to open a checkout without one.
 *
 * That same rule makes the flow untestable outside a browser that can complete
 * a real Google or Firebase sign-in, which is the one thing a local stack
 * cannot do. This exists for exactly that: `wrangler dev --var
 * PAYMENTS_DEV_SKIP_SIGNIN:on`, never set on a deployed worker (it is absent
 * from `.prod.vars.example` and `push-secrets.py` on purpose), and every call
 * site logs when it takes the bypass so it cannot go unnoticed in a log.
 */
export function signInBypassed(env: Pick<Bindings, "PAYMENTS_DEV_SKIP_SIGNIN">): boolean {
  return env.PAYMENTS_DEV_SKIP_SIGNIN?.trim().toLowerCase() === "on";
}
