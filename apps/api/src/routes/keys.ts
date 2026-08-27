import { Hono } from "hono";
import { describeRoute, resolver, validator } from "hono-openapi";
import { z } from "zod";
import type { Bindings } from "../env.js";
import { requireSession, requireOrg, type GuardVars } from "../lib/guards.js";
import { generateApiKey } from "../lib/apikeys.js";
import { requirePermission, requireFeature, type AuthzVars } from "../lib/authorize.js";

export const keysRouter = new Hono<{ Bindings: Bindings; Variables: Partial<AuthzVars & GuardVars> }>();

keysRouter.use("/keys", requireSession);
keysRouter.use("/keys/*", requireSession);
keysRouter.use("/keys", requireOrg);
keysRouter.use("/keys/*", requireOrg);

/**
 * Listing keys is free — someone on a lapsed plan must still be able to see and revoke
 * what exists. Minting a new one needs the paid feature, so a downgrade cannot be worked
 * around by issuing more keys.
 */
keysRouter.use("/keys", requirePermission("apikey", "read"));
keysRouter.post("/keys", requirePermission("apikey", "create"), requireFeature("api_access", { surface: "api-keys" }));
keysRouter.delete("/keys/:id", requirePermission("apikey", "revoke"));

const KeyMeta = z.object({
  id: z.string(),
  name: z.string().nullable(),
  start: z.string().nullable(),
  enabled: z.boolean(),
  lastUsedAt: z.number().nullable(),
  createdAt: z.number(),
});

keysRouter.get(
  "/keys",
  describeRoute({ tags: ["dashboard"], summary: "List my API keys (metadata only)", responses: { 200: { description: "Keys", content: { "application/json": { schema: resolver(z.array(KeyMeta)) } } } } }),
  async (c) => {
    const userId = c.get("userId");
    const rows = await c.env.DB.prepare(
      `SELECT id, name, start, enabled, last_used_at, created_at FROM api_keys WHERE user_id = ? ORDER BY created_at DESC LIMIT 50`,
    )
      .bind(userId)
      .all<{ id: string; name: string | null; start: string | null; enabled: number; last_used_at: number | null; created_at: number }>();
    return c.json(
      (rows.results ?? []).map((r) => ({
        id: r.id,
        name: r.name,
        start: r.start,
        enabled: r.enabled === 1,
        lastUsedAt: r.last_used_at,
        createdAt: r.created_at,
      })),
    );
  },
);

keysRouter.post(
  "/keys",
  validator("json", z.object({ name: z.string().min(1).max(100).default("Default key") })),
  describeRoute({
    tags: ["dashboard"],
    summary: "Create an API key — raw key shown ONCE",
    responses: { 200: { description: "Created", content: { "application/json": { schema: resolver(KeyMeta.extend({ key: z.string() })) } } } },
  }),
  async (c) => {
    const userId = c.get("userId");
    const { name } = c.req.valid("json");
    const { raw, hash, start } = generateApiKey();
    const id = `key_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;

    // org resolved by requireOrg
    const orgId = c.get("orgId") ?? null;

    await c.env.DB.prepare(
      `INSERT INTO api_keys (id, name, start, key, user_id, organization_id, scopes, enabled, environment, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, 'live', ?, ?)`,
    )
      .bind(id, name, start, hash, userId, orgId, JSON.stringify(["forms:read", "submissions:read", "sessions:write"]), Date.now(), Date.now())
      .run();

    return c.json({ id, name, start, enabled: true, lastUsedAt: null, createdAt: Date.now(), key: raw });
  },
);

keysRouter.delete(
  "/keys/:id",
  describeRoute({ tags: ["dashboard"], summary: "Revoke an API key", responses: { 200: { description: "Revoked", content: { "application/json": { schema: resolver(z.object({ ok: z.boolean() })) } } } } }),
  async (c) => {
    const userId = c.get("userId");
    const id = c.req.param("id");
    await c.env.DB.prepare(`UPDATE api_keys SET enabled = 0, updated_at = ? WHERE id = ? AND user_id = ?`).bind(Date.now(), id, userId).run();
    return c.json({ ok: true });
  },
);
