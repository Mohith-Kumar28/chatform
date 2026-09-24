import { safeWebhookUrl } from "@repo/guard";
import type { Bindings } from "../env.js";

/**
 * One rule for a webhook endpoint, for both surfaces that accept one.
 *
 * The two had drifted apart: the dashboard required `https://` or
 * `http://localhost`, while its `/v1` twin required neither, so a URL the
 * dashboard refused could be created through the API and then delivered to —
 * `http://10.0.0.1/` included. They land in the same `webhooks.url` column and
 * are read by the same delivery worker, so they have to answer the same
 * question the same way.
 *
 * Loopback stays allowed outside production because that is the one address a
 * developer legitimately points a webhook at while building an integration.
 * In production it is refused along with every other private address.
 */
export function webhookUrlSchema(env: Bindings) {
  const development = env.ENVIRONMENT !== "production";
  return safeWebhookUrl({ max: 2000, allowInsecure: development, allowLoopback: development });
}

/** The refusal both create routes return. */
export const BAD_WEBHOOK_URL = {
  error: {
    code: "bad_url",
    message: "A webhook URL must be a public https endpoint.",
  },
} as const;

/**
 * The same rule, applied to a URL already in the database.
 *
 * Rows created before this existed are not re-validated on write, and a
 * delivery is the moment it matters: the URL is fetched from inside the
 * worker. Checked at send time rather than trusted because that is the only
 * check an old row ever gets.
 */
export function deliverableUrl(env: Bindings, url: string): boolean {
  return webhookUrlSchema(env).safeParse(url).success;
}
