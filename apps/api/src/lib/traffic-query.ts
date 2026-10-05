import type { Bindings } from "../env.js";
import { trafficStore } from "./traffic.js";

/**
 * Reading traffic back out of `TrafficDO` for the platform console.
 *
 * Each report is one call to the object, which answers from its own SQLite, and
 * the caller caches the whole answer (`cachedJson`) so a page that several
 * admins have open is computed once.
 */

/** The periods the Traffic page offers. Page-level rows are kept for 180 days. */
export const TRAFFIC_RANGES = { "1d": 1, "7d": 7, "30d": 30, "90d": 90 } as const;
export type TrafficRange = keyof typeof TRAFFIC_RANGES;

export async function trafficReport(env: Bindings, range: TrafficRange) {
  return { range, ...(await trafficStore(env).report(TRAFFIC_RANGES[range])) };
}

export type TrafficReport = Awaited<ReturnType<typeof trafficReport>>;

/** The last half hour a minute at a time, who is here now, and where. */
export function trafficLive(env: Bindings) {
  return trafficStore(env).live();
}

/** Per-campaign traffic, for the Campaigns page. Joined to sign-ups by the caller. */
export function campaignTraffic(env: Bindings, days: number) {
  return trafficStore(env).campaigns(days);
}

/** Visits that arrived from mail we sent, per mail kind (`utm_campaign`). */
export function emailTraffic(env: Bindings, days: number) {
  return trafficStore(env).emailVisits(days);
}

/**
 * One whole UTC day of traffic, for the history `platform_metrics_daily` keeps
 * after the object has dropped the day's page-level rows.
 */
export function dailyTrafficRollup(env: Bindings, day: string) {
  return trafficStore(env).dailyRollup(day);
}

/**
 * One cached answer per key, shared by concurrent misses in this isolate.
 *
 * KV's shortest TTL is sixty seconds; anything shorter lives in the isolate
 * alone, which is what the live view wants: a poll every thirty seconds from
 * one admin should not be one report each, and two admins polling should not
 * be two.
 */
const inflight = new Map<string, Promise<unknown>>();
const memo = new Map<string, { at: number; value: unknown }>();

export async function cachedJson<T>(
  env: Bindings,
  key: string,
  ttlSeconds: number,
  load: () => Promise<T>,
): Promise<T> {
  const hit = memo.get(key);
  if (hit && Date.now() - hit.at < ttlSeconds * 1000) return hit.value as T;
  if (ttlSeconds >= 60) {
    const stored = await env.KV_CONFIG.get(key).catch(() => null);
    if (stored) {
      const value = JSON.parse(stored) as T;
      memo.set(key, { at: Date.now(), value });
      return value;
    }
  }
  const pending = inflight.get(key);
  if (pending) return pending as Promise<T>;
  const run = (async () => {
    try {
      const value = await load();
      memo.set(key, { at: Date.now(), value });
      if (ttlSeconds >= 60) {
        await env.KV_CONFIG.put(key, JSON.stringify(value), { expirationTtl: ttlSeconds }).catch(() => {});
      }
      return value;
    } finally {
      inflight.delete(key);
    }
  })();
  inflight.set(key, run);
  return run;
}
