import type { Context, MiddlewareHandler, Next } from "hono";
import { sha256Hex } from "@repo/form-schema";
import type { Bindings } from "../env.js";
import { createAuth, type Auth } from "./auth.js";
import { verifyApiKey } from "./apikeys.js";
import { respondentToken } from "../routes/helpers.js";

/**
 * Authorization guards — the single source of truth for who may touch what.
 *
 * Before this module every router re-implemented its own session middleware and
 * NONE of them scoped by organization, so any signed-in user could read, edit or
 * delete any other tenant's form by guessing an id. Every guarded route now runs
 * through `requireFormAccess` (or an equivalent org-scoped lookup) instead.
 */

/** Context variables the guards populate. */
export type GuardVars = {
  userId: string;
  orgId: string;
  form: FormRow;
  keyId: string;
};

export interface FormRow {
  id: string;
  organization_id: string;
  workspace_id: string | null;
  slug: string;
  status: string;
  title: string;
  active_version_id: string | null;
}

type GuardCtx = Context<{ Bindings: Bindings; Variables: Partial<GuardVars> }>;

/**
 * Better Auth construction is not free (it builds a Drizzle adapter and the
 * organization plugin). It used to run on every request in six routers; memoize
 * it per-env so a single isolate reuses one instance.
 */
const authCache = new WeakMap<Bindings, Auth>();

export function getAuth(env: Bindings): Auth {
  let auth = authCache.get(env);
  if (!auth) {
    auth = createAuth(env);
    authCache.set(env, auth);
  }
  return auth;
}

function unauthorized(c: GuardCtx) {
  return c.json({ error: { code: "unauthorized", message: "Sign in required" } }, 401);
}

/** 404 rather than 403 on cross-tenant access: never confirm the id exists. */
function notFound(c: GuardCtx, what = "Not found") {
  return c.json({ error: { code: "not_found", message: what } }, 404);
}

/** Resolves the Better Auth session and sets `userId`. */
export const requireSession: MiddlewareHandler<{ Bindings: Bindings; Variables: Partial<GuardVars> }> = async (c, next) => {
  const session = await getAuth(c.env).api.getSession({ headers: c.req.raw.headers });
  if (!session) return unauthorized(c);
  c.set("userId", session.user.id);
  await next();
};

/**
 * Resolves the caller's organization from `members` and sets `orgId`.
 * Runs after `requireSession`. Reads D1 directly rather than calling
 * `auth.api.listOrganizations` so it costs one indexed query.
 */
export const requireOrg: MiddlewareHandler<{ Bindings: Bindings; Variables: Partial<GuardVars> }> = async (c, next) => {
  const userId = c.get("userId");
  if (!userId) return unauthorized(c);
  const orgId = await resolveOrgId(c.env, userId);
  if (!orgId) return c.json({ error: { code: "no_organization", message: "No organization for this user" } }, 403);
  c.set("orgId", orgId);
  await next();
};

/**
 * The caller's organization id, or null. Prefers the session's active org.
 *
 * It used to claim that and not do it: the query took the oldest membership by
 * `created_at` and ignored `sessions.active_organization_id` entirely, so a user who
 * belonged to two organizations read, wrote, metered and billed against whichever one
 * they had joined first — regardless of which one they had switched to in the UI. Now the
 * active org wins, and only when it is one the user is actually a member of; the oldest
 * membership remains the fallback for a session that never set one.
 */
export async function resolveOrgId(env: Bindings, userId: string): Promise<string | null> {
  const row = await env.DB.prepare(
    `SELECT m.organization_id AS org
       FROM members m
      WHERE m.user_id = ?1
      ORDER BY (m.organization_id = (
                  SELECT s.active_organization_id FROM sessions s
                   WHERE s.user_id = ?1 AND s.active_organization_id IS NOT NULL
                   ORDER BY s.updated_at DESC LIMIT 1
                )) DESC,
               m.created_at ASC
      LIMIT 1`,
  )
    .bind(userId)
    .first<{ org: string }>();
  return row?.org ?? null;
}

/** Load a form and assert it belongs to `orgId`. Returns null when it does not. */
export async function loadFormForOrg(env: Bindings, formId: string, orgId: string): Promise<FormRow | null> {
  const row = await env.DB.prepare(
    `SELECT id, organization_id, workspace_id, slug, status, title, active_version_id
       FROM forms
      WHERE id = ? AND organization_id = ? AND deleted_at IS NULL`,
  )
    .bind(formId, orgId)
    .first<FormRow>();
  return row ?? null;
}

/**
 * Session + org + form-ownership in one middleware. Reads the form id from the
 * `:id` route param and stashes the row so the handler need not re-query.
 */
export const requireFormAccess: MiddlewareHandler<{ Bindings: Bindings; Variables: Partial<GuardVars> }> = async (c, next) => {
  const userId = c.get("userId");
  if (!userId) return unauthorized(c);
  const orgId = c.get("orgId") ?? (await resolveOrgId(c.env, userId));
  if (!orgId) return notFound(c, "Form not found");
  const formId = c.req.param("id");
  if (!formId) return notFound(c, "Form not found");
  const form = await loadFormForOrg(c.env, formId, orgId);
  if (!form) return notFound(c, "Form not found");
  c.set("orgId", orgId);
  c.set("form", form);
  await next();
};

/** Same check for a form id that arrives in the body rather than the path. */
export async function assertFormAccess(c: GuardCtx, formId: string): Promise<FormRow | null> {
  const userId = c.get("userId");
  if (!userId) return null;
  const orgId = c.get("orgId") ?? (await resolveOrgId(c.env, userId));
  if (!orgId) return null;
  const form = await loadFormForOrg(c.env, formId, orgId);
  if (form) c.set("orgId", orgId);
  return form;
}

/** `/v1` guard — Bearer API key. Sets `keyId`, `userId` and `orgId`. */
export const requireApiKey: MiddlewareHandler<{ Bindings: Bindings; Variables: Partial<GuardVars> }> = async (c, next) => {
  const header = c.req.header("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) {
    return c.json({ error: { code: "unauthorized", message: "Missing API key. Send Authorization: Bearer sk_..." } }, 401);
  }
  const keyRow = await verifyApiKey(c.env, token);
  if (!keyRow) {
    return c.json({ error: { code: "unauthorized", message: "Invalid or expired API key" } }, 401);
  }
  c.set("keyId", keyRow.id);
  c.set("userId", keyRow.userId);
  const orgId = keyRow.organizationId ?? (await resolveOrgId(c.env, keyRow.userId));
  if (orgId) c.set("orgId", orgId);
  await next();
};

/**
 * Respondent guard: the `:id` chat session must match the presented token.
 * Token arrives via `x-respondent-token` or `?t=` (EventSource cannot set headers).
 */
export async function requireSessionOwner(c: {
  req: { param: (k: string) => string | undefined; url: string; header: (k: string) => string | undefined };
  env: Bindings;
}): Promise<string | null> {
  const sessionId = c.req.param("id");
  const token = respondentToken(c);
  if (!token || !sessionId) return null;
  const row = await c.env.DB.prepare(`SELECT respondent_token_hash FROM chat_sessions WHERE id = ?`)
    .bind(sessionId)
    .first<{ respondent_token_hash: string }>();
  if (!row || row.respondent_token_hash !== sha256Hex(token)) return null;
  return sessionId;
}

/** Assert an API key's org owns the chat session it is trying to drive. */
export async function assertChatSessionAccess(env: Bindings, sessionId: string, orgId: string): Promise<boolean> {
  const row = await env.DB.prepare(
    `SELECT cs.id FROM chat_sessions cs
      JOIN forms f ON f.id = cs.form_id
      WHERE cs.id = ? AND f.organization_id = ?`,
  )
    .bind(sessionId, orgId)
    .first<{ id: string }>();
  return Boolean(row);
}

export { notFound as guardNotFound, unauthorized as guardUnauthorized };
export type { Next };
