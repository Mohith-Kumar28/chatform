import type { MiddlewareHandler } from "hono";
import { sha256Hex } from "@repo/form-schema";
import type { Bindings } from "../env.js";
import type { GuardVars } from "./guards.js";

/**
 * Replay-safe writes.
 *
 * A network timeout tells the caller nothing about whether the write landed, so
 * the only safe thing they can do is retry — and without this, retrying a
 * "create a response" call creates two. The `idempotency_keys` table has existed
 * since the first migration with no code behind it; this is that code.
 *
 * The claim is a single statement, so it is atomic: whoever wins the INSERT owns
 * the request and everyone else either replays its result or is told it is still
 * running.
 */

const TTL_MS = 24 * 60 * 60 * 1000;

export function idempotent(endpoint: string): MiddlewareHandler<{
  Bindings: Bindings;
  Variables: Partial<GuardVars & { requestId: string }>;
}> {
  return async (c, next) => {
    const key = c.req.header("idempotency-key");
    // Optional, and recommended rather than required: making it mandatory would
    // break every caller who has not read the docs yet, for a guarantee they may
    // not need.
    if (!key) return next();
    if (key.length > 255) {
      return c.json(
        { error: { code: "invalid_idempotency_key", message: "Idempotency-Key must be at most 255 characters" } },
        400,
      );
    }

    const orgId = c.get("orgId") ?? "";
    const body = await c.req.raw.clone().text();
    const bodyHash = sha256Hex(body);
    const now = Date.now();

    const claimed = await c.env.DB.prepare(
      `INSERT INTO idempotency_keys (id, organization_id, endpoint, request_hash, body_hash, expires_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (endpoint, request_hash, organization_id) DO NOTHING
       RETURNING id`,
    )
      .bind(`idm_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`, orgId, endpoint, key, bodyHash, now + TTL_MS, now)
      .first<{ id: string }>();

    if (!claimed) {
      const prior = await c.env.DB.prepare(
        `SELECT body_hash, response_status, response_body FROM idempotency_keys
          WHERE endpoint = ? AND request_hash = ? AND organization_id = ?`,
      )
        .bind(endpoint, key, orgId)
        .first<{ body_hash: string | null; response_status: number | null; response_body: string | null }>();

      if (prior && prior.body_hash !== bodyHash) {
        // Reusing a key for a different request is a bug in the caller, and
        // replaying the first response would hide it behind a plausible success.
        return c.json(
          {
            error: {
              code: "idempotency_key_reuse",
              message: "This Idempotency-Key was already used with a different request body.",
            },
          },
          422,
        );
      }
      if (!prior || prior.response_status == null) {
        c.header("retry-after", "1");
        return c.json(
          { error: { code: "idempotency_in_progress", message: "The original request is still running." } },
          409,
        );
      }
      return new Response(prior.response_body ?? "", {
        status: prior.response_status,
        headers: {
          "content-type": "application/json",
          "idempotency-replayed": "true",
          "x-request-id": c.get("requestId") ?? "",
        },
      });
    }

    await next();

    const res = c.res.clone();
    if (res.status >= 500) {
      /**
       * A 5xx is not an outcome. Releasing the claim is what makes a retry an
       * actual retry rather than a permanent replay of the failure.
       */
      await c.env.DB.prepare(
        `DELETE FROM idempotency_keys WHERE endpoint = ? AND request_hash = ? AND organization_id = ?`,
      )
        .bind(endpoint, key, orgId)
        .run();
      return;
    }

    await c.env.DB.prepare(
      `UPDATE idempotency_keys SET response_status = ?, response_body = ?
        WHERE endpoint = ? AND request_hash = ? AND organization_id = ?`,
    )
      .bind(res.status, await res.text(), endpoint, key, orgId)
      .run();
  };
}

/** Drop spent keys. Called from the existing cron sweep. */
export async function pruneIdempotencyKeys(env: Bindings): Promise<number> {
  const res = await env.DB.prepare(`DELETE FROM idempotency_keys WHERE expires_at IS NOT NULL AND expires_at < ?`)
    .bind(Date.now())
    .run();
  return res.meta?.changes ?? 0;
}
