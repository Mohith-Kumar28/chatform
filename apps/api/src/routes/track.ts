import { Hono } from "hono";
import type { Bindings } from "../env.js";
import { readBeacon, writeTraffic } from "../lib/traffic.js";

/**
 * `POST /p/t`: the web app's page-view beacon. See `lib/traffic.ts`.
 *
 * Always 204, whatever arrived. The browser does nothing with the answer (it is
 * a `sendBeacon`), and telling a scraper which payloads were accepted would only
 * help it write better fakes.
 */
export const trackRouter = new Hono<{ Bindings: Bindings }>();

trackRouter.post("/t", async (c) => {
  const beacon = await readBeacon(c.req.raw);
  if (beacon) {
    // Per visitor, on the respondent limiter's binding under its own prefix: a
    // tab stuck in a navigation loop is the thing to stop, and a crowd behind
    // one address is not.
    const limit = await c.env.RATE_LIMIT_P?.limit({ key: `t:${beacon.v}` }).catch(() => ({ success: true }));
    if (limit?.success !== false) writeTraffic(c.env, c.req.raw, beacon);
  }
  return c.body(null, 204);
});
