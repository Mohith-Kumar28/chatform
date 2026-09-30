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
 * Two keys, both hashed with the signing salt so nothing stored can be traced
 * back to a browser or an address:
 * - the device, from the same FingerprintJS signal the chat already computes
 *   (`apps/web/src/lib/respondent-signal.ts`). Sent by the browser, so it can
 *   be changed by anyone determined to;
 * - the IP, as a backstop against exactly that, with a higher cap because a
 *   whole office or campus can share one address.
 *
 * A browser that sends no signal (blocked by an extension) is counted by its
 * address under the device cap, so blocking the script buys nothing.
 */
export const DEVICE_DAILY_LIMIT = 3;
export const IP_DAILY_LIMIT = 10;

export interface QuotaKeys {
  device: string;
  ip: string | null;
}

export async function quotaKeys(env: Bindings, deviceSignal: string | undefined, ip: string | undefined): Promise<QuotaKeys> {
  const salt = env.SIGNING_SALT ?? "";
  const ipHash = ip ? await sha256Hex(`import-ip:${salt}:${ip}`) : null;
  const device = deviceSignal && deviceSignal.length >= 8
    ? await sha256Hex(`import-device:${salt}:${deviceSignal}`)
    : ipHash
      ? `ip:${ipHash}`
      : await sha256Hex(`import-anon:${salt}`);
  return { device, ip: ipHash };
}

/** Today in UTC, the unit the cap resets on. */
export function quotaDay(now = Date.now()): string {
  return new Date(now).toISOString().slice(0, 10);
}

export async function remainingImports(env: Bindings, keys: QuotaKeys, day = quotaDay()): Promise<number> {
  const rows = await env.DB.prepare(`SELECT key_hash, count FROM import_quota WHERE day = ? AND key_hash IN (?, ?)`)
    .bind(day, keys.device, keys.ip ?? keys.device)
    .all<{ key_hash: string; count: number }>();
  const used = new Map((rows.results ?? []).map((r) => [r.key_hash, r.count]));
  const byDevice = DEVICE_DAILY_LIMIT - (used.get(keys.device) ?? 0);
  const byIp = keys.ip ? IP_DAILY_LIMIT - (used.get(keys.ip) ?? 0) : byDevice;
  return Math.max(0, Math.min(byDevice, byIp));
}

/** Spend one. Called only after a conversion succeeded, so a private or broken link costs nothing. */
export async function spendImport(env: Bindings, keys: QuotaKeys, day = quotaDay()): Promise<void> {
  const upsert = `INSERT INTO import_quota (key_hash, day, count) VALUES (?, ?, 1)
                  ON CONFLICT (key_hash, day) DO UPDATE SET count = count + 1`;
  const statements = [env.DB.prepare(upsert).bind(keys.device, day)];
  if (keys.ip) statements.push(env.DB.prepare(upsert).bind(keys.ip, day));
  await env.DB.batch(statements);
}
