import { Hono } from "hono";
import type { Bindings } from "../env.js";
import { readBeacon, recordTraffic } from "../lib/traffic.js";
import { deferOn } from "../lib/translations.js";
import { resolveLinkCode } from "./admin/campaigns.js";
import { withinLimit } from "../lib/ratelimit.js";

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
    if (await withinLimit(c.env, "RATE_LIMIT_P", `t:${beacon.v}`)) deferOn(c)(recordTraffic(c.env, c.req.raw, beacon));
  }
  return c.body(null, 204);
});

/**
 * `GET /p/l/:code`: where a campaign's short link leads. Asked by the edge
 * worker (`apps/web/edge/edge.ts`) only when KV has no answer for the code, and
 * it remembers a miss itself, so a made-up code is one read and then none.
 */
trackRouter.get("/l/:code", async (c) => {
  const target = await resolveLinkCode(c.env, c.req.param("code").toLowerCase());
  if (!target) return c.json({ error: { code: "not_found", message: "Not found" } }, 404);
  return c.json({ target });
});
