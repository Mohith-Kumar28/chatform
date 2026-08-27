/**
 * Logging what the gates decide — three sinks, chosen by volume and by who reads them.
 *
 *   Analytics Engine  every evaluation, allow and deny. High volume, sampled, free, and
 *                     the only thing that can answer "which lock precedes an upgrade".
 *   feature_access_log  one row per (org, feature): first hit, hit count, whether they
 *                     then bought. This is the conversion funnel in a form you can join.
 *   audit_logs        the events a human needs to account for — plan changes, overrides
 *                     granted, exports. Doubles as the Business-tier activity log.
 *
 * All three are best-effort. A telemetry failure must never turn a 402 into a 500, so
 * every caller either awaits inside a `.catch()` or hands this to `waitUntil`.
 */

import type { GateError } from "@repo/entitlements";
import type { Bindings } from "../env.js";

/**
 * Record a denial.
 *
 * Only denials go to `feature_access_log` — an allow is not a funnel event, and writing
 * one per allowed request would turn a read-mostly table into a write-mostly one.
 */
export async function recordGate(
  env: Bindings,
  orgId: string,
  error: GateError,
  surface?: string,
): Promise<void> {
  const where = surface ?? (error.context.surface as string | undefined) ?? "unknown";

  env.ANALYTICS?.writeDataPoint({
    blobs: [orgId, error.plan, error.feature ?? error.metric ?? "unknown", error.code, where],
    doubles: [error.used ?? 0, error.limit ?? 0],
    indexes: [orgId],
  });

  // Role denials are not a funnel event: upgrading would not fix them, so counting them
  // as "hit a paywall" would poison the conversion numbers.
  if (error.code === "forbidden" || !error.feature) return;

  const now = Date.now();
  await env.DB.prepare(
    `INSERT INTO feature_access_log (id, organization_id, feature, surface, first_denied_at, last_denied_at, denial_count)
     VALUES (?1, ?2, ?3, ?4, ?5, ?5, 1)
     ON CONFLICT (organization_id, feature) DO UPDATE SET
       last_denied_at = excluded.last_denied_at,
       denial_count = denial_count + 1,
       surface = COALESCE(feature_access_log.surface, excluded.surface)`,
  )
    .bind(`fal_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`, orgId, error.feature, where, now)
    .run();
}

/**
 * Mark every lock this org had hit as converted, on the webhook that activates a
 * subscription. Nothing else can attribute the sale to the gate that caused it.
 */
export async function markConverted(env: Bindings, orgId: string): Promise<void> {
  await env.DB.prepare(
    `UPDATE feature_access_log SET converted_at = ?
      WHERE organization_id = ? AND converted_at IS NULL`,
  )
    .bind(Date.now(), orgId)
    .run();
}

export interface AuditEntry {
  orgId: string;
  action: string;
  actorType?: "user" | "system" | "api_key" | "webhook";
  actorId?: string | null;
  actorLabel?: string | null;
  resourceType?: string | null;
  resourceId?: string | null;
  meta?: Record<string, unknown>;
}

/** Append to the audit trail. Also the read source for the Business activity log. */
export async function audit(env: Bindings, entry: AuditEntry): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO audit_logs (id, organization_id, actor_type, actor_id, actor_label, action, resource_type, resource_id, meta, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      `aud_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`,
      entry.orgId,
      entry.actorType ?? "system",
      entry.actorId ?? null,
      entry.actorLabel ?? null,
      entry.action,
      entry.resourceType ?? null,
      entry.resourceId ?? null,
      entry.meta ? JSON.stringify(entry.meta) : null,
      Date.now(),
    )
    .run();
}

/** Keep `feature_access_log` bounded. Called from the existing 5-minute cron. */
export async function pruneGateLog(env: Bindings, olderThanDays = 90): Promise<number> {
  const cutoff = Date.now() - olderThanDays * 86_400_000;
  const res = await env.DB.prepare(
    `DELETE FROM feature_access_log WHERE converted_at IS NULL AND last_denied_at < ?`,
  )
    .bind(cutoff)
    .run();
  return res.meta?.changes ?? 0;
}
