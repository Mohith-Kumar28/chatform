import { Hono } from "hono";
import { describeRoute, resolver, validator } from "hono-openapi";
import { z } from "zod";
import type { Bindings } from "../env.js";
import { requireSession, requireOrg, type GuardVars } from "../lib/guards.js";
import { getAuth } from "../lib/auth-instance.js";
import {
  KEY_TYPES,
  RATE_LIMIT_DEFAULTS,
  environmentOf,
  isPublishable,
  keyTypeOf,
  storedConfigId,
  type KeyType,
} from "../lib/apikey-config.js";
import { clampScopes, SCOPES, type Scopes } from "../lib/scopes.js";
import { requirePermission, requireFeature, type AuthzVars } from "../lib/authorize.js";
import { audit } from "../lib/gate-log.js";

/**
 * API key management.
 *
 * Thin wrappers over `@better-auth/api-key`, not a passthrough to it: the
 * plugin's own endpoints are 404'd in `dashboard.ts` because they would bypass
 * the paid-feature gate, RBAC, the audit trail and our metadata conventions.
 * Everything a key can be is decided here.
 */

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
keysRouter.post("/keys/:id/rotate", requirePermission("apikey", "create"), requireFeature("api_access", { surface: "api-keys" }));
keysRouter.delete("/keys/:id", requirePermission("apikey", "revoke"));

const ScopesSchema = z.record(z.string(), z.array(z.string()));

const KeyMeta = z.object({
  id: z.string(),
  name: z.string().nullable(),
  keyType: z.enum(["sk_live", "sk_test", "pk_live", "pk_test"]),
  environment: z.enum(["live", "test"]),
  start: z.string().nullable(),
  enabled: z.boolean(),
  scopes: ScopesSchema,
  origins: z.array(z.string()),
  formIds: z.array(z.string()),
  rateLimitMax: z.number().nullable(),
  rateLimitTimeWindow: z.number().nullable(),
  requestCount: z.number(),
  lastUsedAt: z.number().nullable(),
  expiresAt: z.number().nullable(),
  createdBy: z.string().nullable(),
  createdAt: z.number(),
});

interface KeyRow {
  id: string;
  name: string | null;
  prefix: string | null;
  start: string | null;
  enabled: number;
  permissions: string | null;
  metadata: string | null;
  rate_limit_max: number | null;
  rate_limit_time_window: number | null;
  request_count: number;
  last_request: number | null;
  expires_at: number | null;
  created_by: string | null;
  created_at: number;
  config_id: string;
}

function parseJson<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function project(row: KeyRow) {
  const keyType = keyTypeOf(row.prefix) ?? "sk_live";
  const meta = parseJson<{ origins?: string[]; formIds?: string[]; createdBy?: string }>(row.metadata, {});
  return {
    id: row.id,
    name: row.name,
    keyType,
    environment: environmentOf(keyType),
    start: row.start,
    enabled: row.enabled === 1,
    scopes: parseJson<Scopes>(row.permissions, {}),
    origins: meta.origins ?? [],
    formIds: meta.formIds ?? [],
    rateLimitMax: row.rate_limit_max,
    rateLimitTimeWindow: row.rate_limit_time_window,
    requestCount: row.request_count ?? 0,
    lastUsedAt: row.last_request,
    expiresAt: row.expires_at,
    createdBy: row.created_by ?? meta.createdBy ?? null,
    createdAt: row.created_at,
  };
}

const KEY_COLUMNS = `id, name, prefix, start, enabled, permissions, metadata, rate_limit_max,
                     rate_limit_time_window, request_count, last_request, expires_at, created_by,
                     created_at, config_id`;

/**
 * Read straight from D1, org-scoped.
 *
 * Not `auth.api.listApiKeys`: that returns the plugin's shape, which would have
 * to be re-mapped anyway, and this also fixes the bug it replaces — keys used to
 * be listed by `user_id`, so a teammate could not see, let alone revoke, a key
 * their colleague had created.
 */
keysRouter.get(
  "/keys",
  describeRoute({
    tags: ["dashboard"],
    summary: "List the organization's API keys (metadata only)",
    responses: { 200: { description: "Keys", content: { "application/json": { schema: resolver(z.array(KeyMeta)) } } } },
  }),
  async (c) => {
    const orgId = c.get("orgId");
    const rows = await c.env.DB.prepare(
      `SELECT ${KEY_COLUMNS} FROM api_keys WHERE organization_id = ? ORDER BY created_at DESC LIMIT 100`,
    )
      .bind(orgId ?? "")
      .all<KeyRow>();
    return c.json((rows.results ?? []).map(project));
  },
);

/** The per-key ceiling this plan allows, so a customer cannot raise their own limit. */
function clampRate(requested: number | undefined, keyType: KeyType): number {
  const ceiling = RATE_LIMIT_DEFAULTS[keyType];
  if (!requested || requested <= 0) return ceiling;
  return Math.min(requested, ceiling);
}

const CreateKeyBody = z.object({
  name: z.string().min(1).max(64).default("Default key"),
  keyType: z.enum(["sk_live", "sk_test", "pk_live", "pk_test"]).default("sk_live"),
  scopes: ScopesSchema.optional(),
  /** Required for publishable keys: without it the key is not publishable, just leaked. */
  origins: z.array(z.string().max(200)).max(20).optional(),
  formIds: z.array(z.string().max(64)).max(50).optional(),
  expiresInDays: z.number().int().min(1).max(365).optional(),
  rateLimitMax: z.number().int().min(1).max(10_000).optional(),
});

keysRouter.post(
  "/keys",
  validator("json", CreateKeyBody),
  describeRoute({
    tags: ["dashboard"],
    summary: "Create an API key — the raw key is shown ONCE",
    responses: {
      200: { description: "Created", content: { "application/json": { schema: resolver(KeyMeta.extend({ key: z.string() })) } } },
      422: { description: "A publishable key needs at least one allowed origin" },
    },
  }),
  async (c) => {
    const userId = c.get("userId")!;
    const orgId = c.get("orgId")!;
    const body = c.req.valid("json");
    const keyType = body.keyType as KeyType;

    if (isPublishable(keyType) && (body.origins?.length ?? 0) === 0) {
      return c.json(
        {
          error: {
            code: "origins_required",
            message: "A publishable key must list the origins allowed to use it.",
          },
        },
        422,
      );
    }

    const created = await getAuth(c.env).api.createApiKey({
      body: {
        // sk_live is stored as the literal "default" — see storedConfigId.
        configId: storedConfigId(keyType),
        name: body.name,
        organizationId: orgId,
        userId,
        permissions: clampScopes(keyType, body.scopes),
        rateLimitEnabled: true,
        rateLimitMax: clampRate(body.rateLimitMax, keyType),
        rateLimitTimeWindow: 60_000,
        metadata: { createdBy: userId, origins: body.origins ?? [], formIds: body.formIds ?? [] },
        ...(body.expiresInDays ? { expiresIn: body.expiresInDays * 86_400 } : {}),
      },
      /**
       * No `headers`, deliberately. The plugin treats a request-bearing call as
       * a client call and rejects `permissions`, `rateLimit*` and `remaining` as
       * SERVER_ONLY_PROPERTY — so the scopes we just clamped would be dropped.
       * Passing `userId` explicitly is what the organization permission check
       * uses instead.
       */
    });

    // `organization_id` mirrors `reference_id` for our own org-scoped SQL and
    // for the ON DELETE CASCADE; `environment` and `created_by` are ours too.
    await c.env.DB.prepare(
      `UPDATE api_keys SET organization_id = ?, environment = ?, created_by = ? WHERE id = ?`,
    )
      .bind(orgId, environmentOf(keyType), userId, created.id)
      .run();

    await audit(c.env, {
      orgId,
      actorType: "user",
      actorId: userId,
      action: "api_key.create",
      resourceType: "api_key",
      resourceId: created.id,
      meta: {
        keyType,
        start: created.start,
        scopes: clampScopes(keyType, body.scopes),
        origins: body.origins ?? [],
        formIds: body.formIds ?? [],
        expiresAt: created.expiresAt ?? null,
      },
    });

    const row = await c.env.DB.prepare(`SELECT ${KEY_COLUMNS} FROM api_keys WHERE id = ?`)
      .bind(created.id)
      .first<KeyRow>();
    return c.json({ ...project(row!), key: created.key });
  },
);

/**
 * Rotate: mint a sibling, then put the old one on a clock.
 *
 * The overlap is the whole point — a deploy is not atomic, and "revoke then
 * create" means downtime between the two. The audit row is the *only* durable
 * record of a rotation, because an expired key's row is deleted outright by the
 * plugin on its first use after expiry.
 */
keysRouter.post(
  "/keys/:id/rotate",
  validator("json", z.object({ graceHours: z.number().int().min(0).max(168).default(24) }).optional()),
  describeRoute({
    tags: ["dashboard"],
    summary: "Rotate an API key, keeping the old one alive for a grace period",
    responses: {
      200: { description: "Rotated", content: { "application/json": { schema: resolver(KeyMeta.extend({ key: z.string(), replacedKeyId: z.string(), oldKeyExpiresAt: z.number().nullable() })) } } },
      404: { description: "Not found" },
    },
  }),
  async (c) => {
    const userId = c.get("userId")!;
    const orgId = c.get("orgId")!;
    const id = c.req.param("id");
    const graceHours = (await c.req.json().catch(() => ({})))?.graceHours ?? 24;

    const old = await c.env.DB.prepare(
      `SELECT ${KEY_COLUMNS} FROM api_keys WHERE id = ? AND organization_id = ?`,
    )
      .bind(id, orgId)
      .first<KeyRow>();
    if (!old) return c.json({ error: { code: "not_found", message: "Key not found" } }, 404);

    const keyType = keyTypeOf(old.prefix) ?? "sk_live";
    const meta = parseJson<Record<string, unknown>>(old.metadata, {});
    const auth = getAuth(c.env);

    const created = await auth.api.createApiKey({
      body: {
        configId: storedConfigId(keyType),
        name: `${old.name ?? "Key"} (rotated ${new Date().toISOString().slice(0, 10)})`,
        organizationId: orgId,
        userId,
        permissions: parseJson<Scopes>(old.permissions, {}),
        rateLimitEnabled: true,
        rateLimitMax: old.rate_limit_max ?? RATE_LIMIT_DEFAULTS[keyType],
        rateLimitTimeWindow: old.rate_limit_time_window ?? 60_000,
        metadata: { ...meta, createdBy: userId, rotatedFrom: id },
      },
    });
    await c.env.DB.prepare(
      `UPDATE api_keys SET organization_id = ?, environment = ?, created_by = ? WHERE id = ?`,
    )
      .bind(orgId, environmentOf(keyType), userId, created.id)
      .run();

    // graceHours 0 means "cut it now"; the plugin's expiresIn has a 1-second
    // floor, so disabling is the honest way to express zero.
    let oldExpiresAt: number | null = null;
    if (graceHours === 0) {
      await c.env.DB.prepare(`UPDATE api_keys SET enabled = 0, updated_at = ? WHERE id = ?`)
        .bind(Date.now(), id)
        .run();
    } else {
      oldExpiresAt = Date.now() + graceHours * 3_600_000;
      await c.env.DB.prepare(`UPDATE api_keys SET expires_at = ?, updated_at = ? WHERE id = ?`)
        .bind(oldExpiresAt, Date.now(), id)
        .run();
    }

    await audit(c.env, {
      orgId,
      actorType: "user",
      actorId: userId,
      action: "api_key.rotate",
      resourceType: "api_key",
      resourceId: created.id,
      meta: { replacedKeyId: id, newKeyId: created.id, graceHours },
    });

    const row = await c.env.DB.prepare(`SELECT ${KEY_COLUMNS} FROM api_keys WHERE id = ?`)
      .bind(created.id)
      .first<KeyRow>();
    return c.json({ ...project(row!), key: created.key, replacedKeyId: id, oldKeyExpiresAt: oldExpiresAt });
  },
);

/**
 * Revoke, not delete.
 *
 * A disabled row stays visible in the dashboard and keeps its audit trail
 * answerable — "when did this stop working, and who stopped it" is the question
 * asked after an outage, and a deleted row cannot answer it.
 */
keysRouter.delete(
  "/keys/:id",
  describeRoute({
    tags: ["dashboard"],
    summary: "Revoke an API key",
    responses: { 200: { description: "Revoked", content: { "application/json": { schema: resolver(z.object({ ok: z.boolean() })) } } } },
  }),
  async (c) => {
    const orgId = c.get("orgId")!;
    const id = c.req.param("id");
    const res = await c.env.DB.prepare(
      `UPDATE api_keys SET enabled = 0, updated_at = ? WHERE id = ? AND organization_id = ?`,
    )
      .bind(Date.now(), id, orgId)
      .run();
    if ((res.meta?.changes ?? 0) > 0) {
      await audit(c.env, {
        orgId,
        actorType: "user",
        actorId: c.get("userId") ?? null,
        action: "api_key.revoke",
        resourceType: "api_key",
        resourceId: id,
      });
    }
    return c.json({ ok: true });
  },
);

/** The scope vocabulary, so the dashboard never hardcodes a copy of it. */
keysRouter.get(
  "/keys/scopes",
  describeRoute({
    tags: ["dashboard"],
    summary: "Available API key scopes and key types",
    responses: { 200: { description: "Vocabulary" } },
  }),
  (c) => c.json({ scopes: SCOPES, keyTypes: KEY_TYPES, rateLimitDefaults: RATE_LIMIT_DEFAULTS }),
);
