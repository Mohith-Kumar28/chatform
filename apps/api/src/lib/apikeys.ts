import { sha256Hex } from "@repo/form-schema";
import type { Bindings } from "../env.js";

/**
 * API key management (the Better Auth apiKey plugin doesn't exist in 1.7.1).
 * Keys: `sk_live_<32 hex>` — stored SHA-256 hashed, prefix kept for display.
 */

export interface ApiKeyRow {
  id: string;
  name: string | null;
  start: string | null;
  userId: string;
  organizationId: string | null;
  scopes: string | null;
  enabled: number;
  expiresAt: number | null;
  lastUsedAt: number | null;
  createdAt: number;
}

export function generateApiKey(): { raw: string; hash: string; start: string } {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  const raw = `sk_live_${hex}`;
  return { raw, hash: sha256Hex(raw), start: raw.slice(0, 12) };
}

export async function verifyApiKey(env: Bindings, raw: string): Promise<ApiKeyRow | null> {
  const hash = sha256Hex(raw);
  const row = await env.DB.prepare(
    `SELECT id, name, start, user_id, organization_id, scopes, enabled, expires_at, last_used_at, created_at
     FROM api_keys WHERE key = ? LIMIT 1`,
  )
    .bind(hash)
    .first<{ id: string; name: string | null; start: string | null; user_id: string; organization_id: string | null; scopes: string | null; enabled: number; expires_at: number | null; last_used_at: number | null; created_at: number }>();
  if (!row) return null;
  if (!row.enabled) return null;
  if (row.expires_at && row.expires_at < Date.now()) return null;
  await env.DB.prepare(`UPDATE api_keys SET last_used_at = ? WHERE id = ?`).bind(Date.now(), row.id).run();
  return {
    id: row.id,
    name: row.name,
    start: row.start,
    userId: row.user_id,
    organizationId: row.organization_id,
    scopes: row.scopes,
    enabled: row.enabled,
    expiresAt: row.expires_at,
    lastUsedAt: row.last_used_at,
    createdAt: row.created_at,
  };
}
