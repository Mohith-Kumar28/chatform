import { defaultKeyHasher } from "@better-auth/api-key";
import { sha256Hex } from "@repo/form-schema";
import type { Bindings } from "../env.js";
import { getAuth } from "./auth-instance.js";
import { keyTypeOf, environmentOf, type KeyType } from "./apikey-config.js";
import { LEGACY_SCOPES, type Scopes } from "./scopes.js";

/**
 * Presenting and verifying an API key.
 *
 * The key lifecycle itself — generation, hashing, expiry, the per-key rate
 * window, the quota counters — belongs to `@better-auth/api-key`. What lives
 * here is the part that is ours: how a key arrives on the request, what a
 * verification result means to the rest of the app, and the one-release bridge
 * for keys minted before the plugin existed.
 */

export interface KeyMeta {
  /** Who minted it. An org-owned key has no user of its own. */
  createdBy?: string;
  /** Publishable keys only: the exact origins allowed to present this key. */
  origins?: string[];
  /** Optional pin: this key may only touch these forms. */
  formIds?: string[];
  note?: string;
}

export interface VerifiedKey {
  id: string;
  orgId: string;
  type: KeyType;
  environment: "live" | "test";
  scopes: Scopes;
  meta: KeyMeta;
  rateLimitMax: number | null;
  rateLimitTimeWindow: number | null;
  requestCount: number;
}

export type KeyErrorCode =
  | "KEY_NOT_FOUND"
  | "INVALID_API_KEY"
  | "KEY_DISABLED"
  | "KEY_EXPIRED"
  | "RATE_LIMITED"
  | "USAGE_EXCEEDED";

export type VerifyResult =
  | { ok: true; key: VerifiedKey }
  | { ok: false; code: KeyErrorCode; retryAfterMs?: number };

/**
 * Where a key may arrive.
 *
 * `Authorization: Bearer` was the original transport and stays; `x-api-key` is
 * the plugin's default and what most integrators reach for first. Never a query
 * parameter: a secret key in a URL lands in access logs, proxy logs and
 * `Referer` headers, and unlike a respondent token it is org-wide and
 * long-lived.
 */
export function readPresentedKey(c: { req: { header(name: string): string | undefined } }): string | null {
  const auth = c.req.header("authorization") ?? "";
  if (auth.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim() || null;
  return c.req.header("x-api-key")?.trim() || null;
}

/** Both encodings of the same 32 digest bytes. Lossless in this direction. */
export function hexToBase64Url(hex: string): string {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * Keys minted before the plugin, and how they keep working.
 *
 * The old implementation stored SHA-256 as lowercase hex; the plugin stores the
 * same 32 bytes as unpadded base64url. `tooling/backfill-apikey-hashes.mjs`
 * converts them in bulk, but a bulk script only helps the environments someone
 * remembered to run it against — so a key that still looks legacy is repaired
 * on first use here, and the customer never notices.
 *
 * Delete this and its constant one release after the backfill has run
 * everywhere.
 */
const LEGACY_KEY_RE = /^sk_live_[0-9a-f]{48}$/;

function isLegacyCandidate(presented: string): boolean {
  return LEGACY_KEY_RE.test(presented);
}

async function healLegacyKey(env: Bindings, presented: string): Promise<boolean> {
  const legacyHash = sha256Hex(presented);
  const row = await env.DB.prepare(
    `SELECT id, organization_id, user_id, reference_id FROM api_keys WHERE key = ? LIMIT 1`,
  )
    .bind(legacyHash)
    .first<{ id: string; organization_id: string | null; user_id: string | null; reference_id: string | null }>();
  if (!row) return false;

  const orgId =
    row.reference_id ||
    row.organization_id ||
    (row.user_id
      ? (
          await env.DB.prepare(
            `SELECT organization_id FROM members WHERE user_id = ? ORDER BY created_at ASC LIMIT 1`,
          )
            .bind(row.user_id)
            .first<{ organization_id: string }>()
        )?.organization_id ?? ""
      : "");
  if (!orgId) return false;

  await env.DB.prepare(
    `UPDATE api_keys
        SET key = ?, prefix = COALESCE(prefix, 'sk_live_'), reference_id = ?, organization_id = COALESCE(organization_id, ?),
            config_id = COALESCE(NULLIF(config_id, ''), 'default'), created_by = COALESCE(created_by, user_id)
      WHERE id = ?`,
  )
    .bind(hexToBase64Url(legacyHash), orgId, orgId, row.id)
    .run();

  await env.DB.prepare(
    `INSERT INTO audit_logs (id, organization_id, actor_type, actor_id, action, resource_type, resource_id, created_at)
     VALUES (?, ?, 'system', NULL, 'api_key.legacy_migrated', 'api_key', ?, ?)`,
  )
    .bind(`aud_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`, orgId, row.id, Date.now())
    .run();
  return true;
}

/** The digest the plugin stores, exported so seeds and migrations agree with it. */
export async function hashApiKey(raw: string): Promise<string> {
  return defaultKeyHasher(raw);
}

export async function verifyKey(env: Bindings, presented: string): Promise<VerifyResult> {
  const auth = getAuth(env);
  let res = await auth.api.verifyApiKey({ body: { key: presented } });

  if (!res.valid && isLegacyCandidate(presented) && (await healLegacyKey(env, presented))) {
    res = await auth.api.verifyApiKey({ body: { key: presented } });
  }

  if (!res.valid || !res.key) {
    const err = res.error as { code?: string; details?: { tryAgainIn?: number } } | null;
    return {
      ok: false,
      code: (err?.code as KeyErrorCode) ?? "INVALID_API_KEY",
      retryAfterMs: err?.details?.tryAgainIn,
    };
  }

  const k = res.key as {
    id: string;
    referenceId: string;
    prefix: string | null;
    permissions: unknown;
    metadata: unknown;
    rateLimitMax: number | null;
    rateLimitTimeWindow: number | null;
    requestCount: number;
  };
  const type = keyTypeOf(k.prefix) ?? "sk_live";
  return {
    ok: true,
    key: {
      id: k.id,
      orgId: k.referenceId,
      type,
      environment: environmentOf(type),
      // A key whose permissions never got written is a pre-plugin key: it keeps
      // exactly what it could always do, and nothing more.
      scopes: (k.permissions as Scopes | null) ?? LEGACY_SCOPES,
      meta: (k.metadata as KeyMeta | null) ?? {},
      rateLimitMax: k.rateLimitMax,
      rateLimitTimeWindow: k.rateLimitTimeWindow,
      requestCount: k.requestCount ?? 0,
    },
  };
}

/**
 * Does this origin match the key's allowlist?
 *
 * Exact origins, plus a single leading-wildcard form (`https://*.example.com`)
 * because customers deploy per-branch preview URLs and would otherwise paste
 * fifty entries. Matching is on the origin's host, not a substring of the whole
 * string — `https://evil-example.com` must not satisfy `*.example.com`.
 */
export function originAllowed(origin: string, allowed: string[]): boolean {
  if (allowed.length === 0) return false;
  let host: string;
  let scheme: string;
  try {
    const u = new URL(origin);
    host = u.host;
    scheme = u.protocol;
  } catch {
    return false;
  }
  return allowed.some((entry) => {
    const trimmed = entry.trim();
    if (!trimmed) return false;
    if (trimmed === origin) return true;
    const star = trimmed.indexOf("://*.");
    if (star === -1) return false;
    const entryScheme = `${trimmed.slice(0, star)}:`;
    const suffix = trimmed.slice(star + 4); // ".example.com"
    return scheme === entryScheme && (host.endsWith(suffix) || host === suffix.slice(1));
  });
}

/** Standard rate-limit headers from a verified key's own window. */
export function rateLimitHeaders(key: VerifiedKey): Record<string, string> {
  if (key.rateLimitMax == null || key.rateLimitTimeWindow == null) return {};
  const remaining = Math.max(0, key.rateLimitMax - key.requestCount);
  return {
    "ratelimit-limit": String(key.rateLimitMax),
    "ratelimit-remaining": String(remaining),
    "ratelimit-reset": String(Math.ceil(key.rateLimitTimeWindow / 1000)),
    "ratelimit-policy": `${key.rateLimitMax};w=${Math.ceil(key.rateLimitTimeWindow / 1000)}`,
  };
}
