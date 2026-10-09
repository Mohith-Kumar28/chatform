import { DurableObject } from "cloudflare:workers";
import type { Bindings } from "../env.js";

/**
 * A count that every copy of the worker shares.
 *
 * The worker runs with a placement, and Cloudflare spreads its requests over
 * many isolates there: two hundred requests down one connection were answered
 * by more than fifteen of them, a dozen or so each. Nothing counted inside one
 * isolate, the platform's own rate limit binding included, ever sees enough of
 * one caller to refuse them. An object is one place, so its count is the count.
 *
 * Held in memory and nowhere else. When nobody has asked for half a minute the
 * object is dropped and the counts go with it, which is right: there is no
 * flood to remember.
 *
 * Reaching it costs a call: a few ms warm, most of a second after it has been
 * idle. Callers that somebody is waiting on do not wait that long; see
 * `PATIENCE_MS` in `lib/ratelimit.ts`.
 */
export class RateLimitDO extends DurableObject<Bindings> {
  private windows = new Map<string, { started: number; count: number }>();

  /**
   * Count one against every key given.
   *
   * Null when all of them are within their limit. Otherwise the first that is
   * not, and how long until its window ends, so the caller can refuse that key
   * until then without asking again.
   */
  async take(
    asks: { key: string; limit: number; periodMs: number }[],
  ): Promise<{ key: string; retryMs: number } | null> {
    const now = Date.now();
    if (this.windows.size > 50_000) {
      for (const [key, w] of this.windows) if (now - w.started >= 60_000) this.windows.delete(key);
    }
    let refused: { key: string; retryMs: number } | null = null;
    for (const { key, limit, periodMs } of asks) {
      const current = this.windows.get(key);
      if (!current || now - current.started >= periodMs) {
        this.windows.set(key, { started: now, count: 1 });
        continue;
      }
      current.count += 1;
      if (current.count > limit && !refused) refused = { key, retryMs: current.started + periodMs - now };
    }
    return refused;
  }
}
