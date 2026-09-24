import type { Bindings } from "../../env.js";

/**
 * Whether verified gateway payments are switched on at all.
 *
 * Everything gateway-shaped sits behind this: the connect routes, starting a
 * checkout, the builder's method choice. Who may use it once it is on is the
 * plan's call (`collect_payments`), not this switch's, so it is one value:
 * `PAYMENTS_GATEWAY_ENABLED=on`, and anything else is off.
 *
 * Webhooks deliberately do not consult it. A payment already taken before the
 * switch went off still has to be recorded, or the respondent paid and nothing
 * anywhere says so.
 */
export function gatewayEnabled(env: Pick<Bindings, "PAYMENTS_GATEWAY_ENABLED">): boolean {
  return env.PAYMENTS_GATEWAY_ENABLED?.trim().toLowerCase() === "on";
}
