import type { Context, MiddlewareHandler, Next } from "hono";
import { sha256Hex } from "@repo/form-schema";
import type { Bindings } from "../env.js";
import { getAuth } from "./auth-instance.js";
import {
  readPresentedKey,
  verifyKey,
  originAllowed,
  rateLimitHeaders,
  type KeyMeta,
  type VerifyResult,
} from "./apikeys.js";
import type { KeyType } from "./apikey-config.js";
import { LEGACY_SCOPES, type Scopes } from "./scopes.js";
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
  /** `sk_live` | `sk_test` | `pk_live` | `pk_test`, from the presented key. */
  keyType: KeyType;
  environment: "live" | "test";
  /** What this key may do. Never empty: a legacy key falls back to LEGACY_SCOPES. */
  scopes: Scopes;
  keyMeta: KeyMeta;
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

/** Re-exported: this module was `getAuth`'s home before `apikeys.ts` needed it too. */
export { getAuth };

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

/**
 * How a failed verification reaches the caller.
 *
 * The code distinguishes the cases so an integrator can act on them, but the
 * message never confirms that a guessed key once existed — "disabled" and
 * "not found" are both a 401 with the same shape.
 */
function keyErrorResponse(c: GuardCtx, result: Extract<VerifyResult, { ok: false }>) {
  if (result.code === "RATE_LIMITED" || result.code === "USAGE_EXCEEDED") {
    const seconds = Math.max(1, Math.ceil((result.retryAfterMs ?? 60_000) / 1000));
    c.header("retry-after", String(seconds));
    c.header("ratelimit-remaining", "0");
    c.header("ratelimit-reset", String(seconds));
    return c.json(
      { error: { code: "rate_limited", message: "Too many requests for this API key", scope: "key" } },
      429,
    );
  }
  const code =
    result.code === "KEY_DISABLED"
      ? "api_key_disabled"
      : result.code === "KEY_EXPIRED"
        ? "api_key_expired"
        : "invalid_api_key";
  c.header("www-authenticate", 'Bearer realm="chatform", error="invalid_token"');
  return c.json({ error: { code, message: "Invalid or expired API key" } }, 401);
}

/**
 * The `/v1` guard.
 *
 * Verification, key-type policy and rate-limit headers. What it deliberately
 * does not do is decide what the key may *reach* — that is `requireScope`,
 * applied per route, so the two questions stay separable.
 */
export const requireApiKey: MiddlewareHandler<{ Bindings: Bindings; Variables: Partial<GuardVars> }> = async (c, next) => {
  const presented = readPresentedKey(c);
  if (!presented) {
    c.header("www-authenticate", 'Bearer realm="chatform"');
    return c.json(
      {
        error: {
          code: "unauthorized",
          message: "Missing API key. Send Authorization: Bearer sk_… or x-api-key: sk_…",
        },
      },
      401,
    );
  }

  const verified = await verifyKey(c.env, presented);
  if (!verified.ok) return keyErrorResponse(c, verified);
  const key = verified.key;

  const origin = c.req.header("origin");
  if (key.type.startsWith("pk_")) {
    /**
     * A publishable key is only publishable because it is pinned to origins.
     * Without one it is just a secret key in a script tag.
     */
    if (!origin || !originAllowed(origin, key.meta.origins ?? [])) {
      return c.json(
        {
          error: {
            code: "origin_not_allowed",
            message: "This publishable key is not allowed from this origin",
          },
        },
        403,
      );
    }
  } else if (origin) {
    /**
     * A secret key arriving with an `Origin` header came from a browser, which
     * means it is already readable by every visitor of that page. Refusing
     * loudly turns the most common integrator mistake into a self-explaining
     * error instead of a silent org-wide leak.
     */
    return c.json(
      {
        error: {
          code: "secret_key_in_browser",
          message:
            "Secret keys must never be used from a browser — this one is now exposed to every visitor of that page. Rotate it and use a publishable pk_ key instead.",
        },
      },
      403,
    );
  }

  c.set("keyId", key.id);
  c.set("orgId", key.orgId);
  c.set("keyType", key.type);
  c.set("environment", key.environment);
  c.set("scopes", key.scopes ?? LEGACY_SCOPES);
  c.set("keyMeta", key.meta);
  /**
   * Compatibility only. An org-owned key has no user of its own, so this is the
   * person who minted it — enough for audit rows and workspace helpers.
   * Anything authorizing by tenant must read `orgId`.
   */
  if (key.meta.createdBy) c.set("userId", key.meta.createdBy);

  for (const [name, value] of Object.entries(rateLimitHeaders(key))) c.header(name, value);
  await next();
};

/**
 * A key pinned to specific forms may not touch any other.
 *
 * 404 rather than 403, matching the cross-tenant convention: a pinned key must
 * not be able to enumerate which form ids exist.
 */
export function keyOwnsForm(c: GuardCtx, formId: string): boolean {
  const pinned = c.get("keyMeta")?.formIds;
  return !pinned || pinned.length === 0 || pinned.includes(formId);
}

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
