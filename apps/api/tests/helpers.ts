import { env, applyD1Migrations } from "cloudflare:test";
import { inject } from "vitest";
import { createApp } from "../src/app.js";
import { SECRET_SCOPES, type Scopes } from "../src/lib/scopes.js";
import type { Bindings } from "../src/env.js";

let schemaReady = false;

/** Apply the real drizzle migrations so tests run against the shipped schema. */
export async function applySchema(): Promise<void> {
  if (schemaReady) return;
  await applyD1Migrations(env.DB, inject("migrations"));
  schemaReady = true;
}

export const app = createApp();

export function fetchApi(pathname: string, init?: RequestInit): Promise<Response> {
  return app.fetch(new Request(`http://localhost${pathname}`, init), env as unknown as Bindings);
}

export interface Tenant {
  userId: string;
  orgId: string;
  workspaceId: string;
  formId: string;
  apiKeyRaw: string;
  cookie: string;
}

/**
 * Seed a complete tenant directly into D1 — user, org, membership, workspace,
 * form, API key — plus a Better Auth session row whose token we can present as
 * a cookie. Avoids driving the whole signup flow in every test.
 */
export async function seedTenant(label: string): Promise<Tenant> {
  const now = Date.now();
  const orgId = `org_${label}`;
  const workspaceId = `ws_${label}`;
  const formId = `frm_${label}`;
  const apiKeyRaw = `sk_live_${label.padEnd(48, "0")}`;

  // The plugin's own hasher, so a seeded key verifies exactly as a minted one
  // does. Seeding with the old `sha256Hex` would make every /v1 test assert
  // against a key the running code cannot recognise.
  const { defaultKeyHasher } = await import("@better-auth/api-key");

  // Sign up through the real Better Auth endpoint so the session cookie is
  // produced and validated exactly as it is in production — guessing the
  // cookie format would make this test prove nothing.
  const signup = await fetchApi("/api/auth/sign-up/email", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: `${label}@example.com`, password: "supersecret123", name: label }),
  });
  if (!signup.ok) throw new Error(`sign-up failed for ${label}: ${signup.status} ${await signup.text()}`);
  const cookie = (signup.headers.get("set-cookie") ?? "").split(";")[0] ?? "";
  if (!cookie) throw new Error(`no session cookie returned for ${label}`);

  const userRow = await env.DB.prepare(`SELECT id FROM users WHERE email = ?`)
    .bind(`${label}@example.com`)
    .first<{ id: string }>();
  if (!userRow) throw new Error(`user row missing for ${label}`);
  const userId = userRow.id;

  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO organizations (id, name, slug, created_at) VALUES (?, ?, ?, ?)`,
    ).bind(orgId, label, label, now),
    env.DB.prepare(
      `INSERT INTO members (id, organization_id, user_id, role, created_at) VALUES (?, ?, ?, 'owner', ?)`,
    ).bind(`mem_${label}`, orgId, userId, now),
    env.DB.prepare(
      `INSERT INTO workspaces (id, organization_id, name, slug, created_by, created_at) VALUES (?, ?, 'Default', 'default', ?, ?)`,
    ).bind(workspaceId, orgId, userId, now),
    env.DB.prepare(
      `INSERT INTO forms (id, organization_id, workspace_id, created_by, title, slug, status, working_schema, fingerprint_salt, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'draft', ?, 'salt', ?, ?)`,
    ).bind(formId, orgId, workspaceId, userId, `${label} form`, `${label}-form`, JSON.stringify(minimalDoc(label)), now, now),
    env.DB.prepare(
      `INSERT INTO api_keys (id, config_id, reference_id, name, start, prefix, key, user_id, created_by,
                             organization_id, permissions, enabled, rate_limit_enabled, rate_limit_max,
                             rate_limit_time_window, request_count, environment, created_at, updated_at)
       VALUES (?, 'default', ?, 'test', ?, 'sk_live_', ?, ?, ?, ?, ?, 1, 1, 10000, 60000, 0, 'live', ?, ?)`,
    ).bind(
      `key_${label}`,
      orgId,
      apiKeyRaw.slice(0, 14),
      await defaultKeyHasher(apiKeyRaw),
      userId,
      userId,
      orgId,
      // A generous default so unrelated suites are not rewritten every time the
      // scope vocabulary grows; `seedKey` is how a test asks for a narrow one.
      JSON.stringify(SECRET_SCOPES),
      now,
      now,
    ),
  ]);

  return {
    userId,
    orgId,
    workspaceId,
    formId,
    apiKeyRaw,
    cookie,
  };
}

export function minimalDoc(label: string) {
  return {
    schemaVersion: 1,
    title: `${label} form`,
    blocks: [
      { id: `blk_${label}1`, ref: "welcome", type: "welcome", title: "Hi", required: false },
      { id: `blk_${label}2`, ref: "q_email", type: "email", title: "Email?", required: true },
    ],
    endings: [{ id: `end_${label}`, ref: "end_thanks", title: "Thanks!", bodyMd: "" }],
    logic: [],
    endingRules: [],
    variables: [],
    hiddenFields: [],
    layout: {},
    settings: {},
    theme: {},
  };
}

export interface SeedKeyOptions {
  type?: "sk_live" | "sk_test" | "pk_live" | "pk_test";
  scopes?: Scopes;
  origins?: string[];
  formIds?: string[];
  rateLimitMax?: number;
  rateLimitTimeWindow?: number;
  enabled?: boolean;
  expiresAt?: number | null;
}

/**
 * A key with exactly the shape a test needs.
 *
 * `seedTenant`'s key is deliberately generous so unrelated suites do not have to
 * be rewritten every time the scope vocabulary grows; this is how a test asks
 * for a narrow, expired, throttled or publishable one.
 */
export async function seedKey(
  tenant: Tenant,
  label: string,
  opts: SeedKeyOptions = {},
): Promise<{ raw: string; id: string }> {
  const { defaultKeyHasher } = await import("@better-auth/api-key");
  const type = opts.type ?? "sk_live";
  const raw = `${type}_${label.padEnd(48, "0")}`;
  const id = `key_${label}`;
  const now = Date.now();
  await env.DB.prepare(
    `INSERT INTO api_keys (id, config_id, reference_id, name, start, prefix, key, user_id, created_by,
                           organization_id, permissions, metadata, enabled, rate_limit_enabled,
                           rate_limit_max, rate_limit_time_window, request_count, expires_at,
                           environment, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, 0, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      type === "sk_live" ? "default" : type,
      tenant.orgId,
      label,
      raw.slice(0, 14),
      `${type}_`,
      await defaultKeyHasher(raw),
      tenant.userId,
      tenant.userId,
      tenant.orgId,
      JSON.stringify(opts.scopes ?? SECRET_SCOPES),
      JSON.stringify({
        createdBy: tenant.userId,
        origins: opts.origins ?? [],
        formIds: opts.formIds ?? [],
      }),
      opts.enabled === false ? 0 : 1,
      opts.rateLimitMax ?? 10_000,
      opts.rateLimitTimeWindow ?? 60_000,
      opts.expiresAt ?? null,
      type.endsWith("_test") ? "test" : "live",
      now,
      now,
    )
    .run();
  return { raw, id };
}

/**
 * A key exactly as the pre-plugin code wrote it: hex digest, no `reference_id`,
 * no `permissions`, and the hardcoded legacy scope array nothing ever read.
 *
 * The migration converts rows like this in bulk, but the bulk script only
 * reaches the environments someone ran it against — so verification repairs one
 * on first use, and this is what proves it.
 */
export async function seedLegacyKey(tenant: Tenant, label: string): Promise<{ raw: string; id: string }> {
  const { sha256Hex } = await import("@repo/form-schema");
  const raw = `sk_live_${label.replace(/[^0-9a-f]/g, "a").padEnd(48, "0").slice(0, 48)}`;
  const id = `key_legacy_${label}`;
  const now = Date.now();
  await env.DB.prepare(
    `INSERT INTO api_keys (id, config_id, reference_id, name, start, key, user_id,
                           organization_id, scopes, enabled, request_count, environment, created_at, updated_at)
     VALUES (?, '', '', 'legacy', ?, ?, ?, ?, ?, 1, 0, 'live', ?, ?)`,
  )
    .bind(
      id,
      raw.slice(0, 12),
      sha256Hex(raw),
      tenant.userId,
      tenant.orgId,
      JSON.stringify(["forms:read", "submissions:read", "sessions:write"]),
      now,
      now,
    )
    .run();
  return { raw, id };
}
