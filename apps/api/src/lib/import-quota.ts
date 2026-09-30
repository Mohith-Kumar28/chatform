import { sha256Hex } from "@repo/form-schema";
import type { Bindings } from "../env.js";

/**
 * How many forms a signed-out visitor may import and try per day.
 *
 * Converting is code, not a model, so it costs almost nothing; what costs is
 * the conversation they then have with it. Three a day is enough to try your
 * own form and a couple of others, and not enough to use the trial account as
 * a free plan.
 *
 * Counted by the device alone: the FingerprintJS signal the chat already
 * computes (`apps/web/src/lib/respondent-signal.ts`), hashed with the signing
 * salt so nothing stored can be traced back to a browser.
 *
 * Never by IP address, not as a backstop and not as a fallback. A campus or a
 * mobile carrier puts thousands of real people behind one address, and
 * counting them together turned all of them away. A browser that sends no
 * signal has no key, and a signed-out visitor without one is asked to sign in
 * rather than counted by where they are sitting.
 */
export const DEVICE_DAILY_LIMIT = 3;

/** The salted key a signed-out visitor is counted under, or null when their browser sent no usable signal. */
export async function quotaKey(env: Bindings, deviceSignal: string | null | undefined): Promise<string | null> {
  if (!deviceSignal || deviceSignal.length < 8) return null;
  return sha256Hex(`import-device:${env.SIGNING_SALT ?? ""}:${deviceSignal}`);
}

/** Today in UTC, the unit the cap resets on. */
export function quotaDay(now = Date.now()): string {
  return new Date(now).toISOString().slice(0, 10);
}

/** Today's counts for one key, or two (the second defaults to the first). */
async function used(env: Bindings, keys: [string] | [string, string], day: string): Promise<Map<string, number>> {
  const rows = await env.DB.prepare(`SELECT key_hash, count FROM import_quota WHERE day = ? AND key_hash IN (?, ?)`)
    .bind(day, keys[0], keys[1] ?? keys[0])
    .all<{ key_hash: string; count: number }>();
  return new Map((rows.results ?? []).map((r) => [r.key_hash, r.count]));
}

async function spend(env: Bindings, keys: string[], day: string): Promise<void> {
  const upsert = `INSERT INTO import_quota (key_hash, day, count) VALUES (?, ?, 1)
                  ON CONFLICT (key_hash, day) DO UPDATE SET count = count + 1`;
  await env.DB.batch(keys.map((key) => env.DB.prepare(upsert).bind(key, day)));
}

export async function remainingImports(env: Bindings, key: string, day = quotaDay()): Promise<number> {
  const counts = await used(env, [key], day);
  return Math.max(0, DEVICE_DAILY_LIMIT - (counts.get(key) ?? 0));
}

/** Spend one. Called only after a conversion succeeded, so a private or broken link costs nothing. */
export async function spendImport(env: Bindings, key: string, day = quotaDay()): Promise<void> {
  await spend(env, [key], day);
}

/**
 * Conversations with imported trial forms, per signed-out device per day.
 *
 * Converting is free; talking to the result is what spends model calls, and
 * the trial account has no plan limit of its own (migration 0052 lifts Free's
 * caps so one busy day cannot switch the demo off for everyone). So the cap
 * lives here: a handful of different forms a day, and a handful of starts on
 * each. Counted per form rather than per open because reopening the page
 * resumes the same response, and a refresh must not use up the allowance.
 *
 * A browser with no device signal cannot be counted, so it cannot start a
 * trial chat either. That is the price of never counting by address.
 */
export const TRIAL_FORMS_PER_DEVICE = 5;
export const TRIAL_STARTS_PER_FORM = 6;

export async function claimTrialChat(
  env: Bindings,
  formId: string,
  deviceSignal: string | null | undefined,
): Promise<boolean> {
  const device = await quotaKey(env, deviceSignal);
  if (!device) return false;
  const forms = `chat:${device}`;
  const starts = `chat:${device}:${formId}`;
  const day = quotaDay();
  const counts = await used(env, [forms, starts], day);
  const startsSoFar = counts.get(starts) ?? 0;
  if (startsSoFar >= TRIAL_STARTS_PER_FORM) return false;
  // A form this visitor has not opened today counts against the daily forms.
  if (startsSoFar === 0 && (counts.get(forms) ?? 0) >= TRIAL_FORMS_PER_DEVICE) return false;
  await spend(env, startsSoFar === 0 ? [forms, starts] : [starts], day);
  return true;
}
