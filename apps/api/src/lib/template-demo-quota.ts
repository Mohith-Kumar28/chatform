import { sha256Hex } from "@repo/form-schema";
import type { Bindings } from "../env.js";

/**
 * How many templates one visitor may try live per UTC day.
 *
 * Every try is a real conversation with the model, paid for by us, so it has
 * to be capped per person. Signed in, the person is their user id. Signed out,
 * they are the FingerprintJS device id the chat already computes
 * (`apps/web/src/lib/respondent-signal.ts`).
 *
 * Never an IP address, not even as a fallback. A college campus or a mobile
 * carrier puts thousands of real people behind one address, and counting them
 * together would lock all of them out after ten tries. A signed-out browser
 * that sends no device id is refused a live try instead; the questions and the
 * flow on the page stay open to it.
 */
export const ANON_DAILY_LIMIT = 10;
export const USER_DAILY_LIMIT = 20;

/** Today in UTC, the unit the cap resets on. */
export function demoDay(now = Date.now()): string {
  return new Date(now).toISOString().slice(0, 10);
}

export type DemoWho = { kind: "user"; userId: string } | { kind: "device"; signal: string };

/** The salted key a visitor is counted under. Null when a signed-out visitor sent no usable device id. */
export async function demoQuotaKey(env: Bindings, who: DemoWho): Promise<string | null> {
  const salt = env.SIGNING_SALT ?? "";
  if (who.kind === "user") return sha256Hex(`template-demo-user:${salt}:${who.userId}`);
  if (who.signal.length < 8) return null;
  return sha256Hex(`template-demo-device:${salt}:${who.signal}`);
}

export interface DemoClaim {
  ok: boolean;
  /** Tries left today after this one. */
  remaining: number;
  limit: number;
}

/**
 * Count one try and say whether it was allowed.
 *
 * One atomic statement: two tabs starting at once cannot both slip under the
 * limit, because each increment returns the count it produced. A try that took
 * the count over the limit is handed straight back, so a visitor who keeps
 * clicking after the last one does not push the counter further.
 */
export async function claimDemo(env: Bindings, key: string, limit: number, day = demoDay()): Promise<DemoClaim> {
  const row = await env.DB.prepare(
    `INSERT INTO template_demo_quota (key_hash, day, count) VALUES (?, ?, 1)
     ON CONFLICT (key_hash, day) DO UPDATE SET count = count + 1
     RETURNING count`,
  )
    .bind(key, day)
    .first<{ count: number }>();
  const count = row?.count ?? limit + 1;
  if (count > limit) {
    await refundDemo(env, key, day);
    return { ok: false, remaining: 0, limit };
  }
  return { ok: true, remaining: limit - count, limit };
}

/** Hand a try back: it was over the limit, or the session could not be started after it was counted. */
export async function refundDemo(env: Bindings, key: string, day = demoDay()): Promise<void> {
  await env.DB.prepare(`UPDATE template_demo_quota SET count = MAX(0, count - 1) WHERE key_hash = ? AND day = ?`)
    .bind(key, day)
    .run();
}

/**
 * Housekeeping for the cron: day counters once their day is over, and the
 * session rows template tries leave behind. A try writes no response, so the
 * `chat_sessions` row is all there is, and after two days nothing reads it.
 */
export async function pruneTemplateDemos(env: Bindings, now = Date.now()): Promise<void> {
  const twoDaysAgo = now - 2 * 86_400_000;
  await env.DB.batch([
    env.DB.prepare(`DELETE FROM template_demo_quota WHERE day < ?`).bind(demoDay(twoDaysAgo)),
    env.DB.prepare(`DELETE FROM chat_sessions WHERE form_id = 'frm_template_demo' AND created_at < ?`).bind(twoDaysAgo),
  ]);
}
