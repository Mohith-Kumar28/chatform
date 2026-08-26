import { env, applyD1Migrations } from "cloudflare:test";
import { inject } from "vitest";
import { createApp } from "../src/app.js";
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

  const { sha256Hex } = await import("@repo/form-schema");

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
      `INSERT INTO api_keys (id, name, start, key, user_id, organization_id, scopes, enabled, environment, created_at, updated_at)
       VALUES (?, 'test', ?, ?, ?, ?, ?, 1, 'live', ?, ?)`,
    ).bind(
      `key_${label}`,
      apiKeyRaw.slice(0, 12),
      sha256Hex(apiKeyRaw),
      userId,
      orgId,
      JSON.stringify(["forms:read", "submissions:read", "sessions:write"]),
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
