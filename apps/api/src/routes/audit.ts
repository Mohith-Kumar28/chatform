import { Hono } from "hono";
import { describeRoute, resolver, validator } from "hono-openapi";
import { z } from "zod";
import type { Bindings } from "../env.js";
import { requireSession, requireOrg, type GuardVars } from "../lib/guards.js";
import { requirePermission, requireFeature, type AuthzVars } from "../lib/authorize.js";

/**
 * The activity log — Youform's Business-tier "Activity log (CSV export)".
 *
 * Reads `audit_logs`, which is written by the gate layer, the webhook handler and every
 * privileged action. Building it therefore costs almost nothing extra: the table had to
 * exist anyway for billing to be accountable, and the same rows are what a customer wants
 * to see.
 */

export const auditRouter = new Hono<{ Bindings: Bindings; Variables: Partial<AuthzVars & GuardVars> }>();

auditRouter.use("/audit-logs", requireSession, requireOrg);
auditRouter.use("/audit-logs/*", requireSession, requireOrg);
auditRouter.use("/audit-logs", requirePermission("audit", "read"), requireFeature("activity_log", { surface: "audit" }));
auditRouter.use("/audit-logs/export", requirePermission("audit", "read"), requireFeature("activity_log", { surface: "audit.export" }));

const AuditRow = z.object({
  id: z.string(),
  action: z.string(),
  actorType: z.string(),
  actorLabel: z.string().nullable(),
  resourceType: z.string().nullable(),
  resourceId: z.string().nullable(),
  meta: z.unknown().nullable(),
  createdAt: z.number(),
});

interface Row {
  id: string;
  action: string;
  actor_type: string;
  actor_id: string | null;
  actor_label: string | null;
  resource_type: string | null;
  resource_id: string | null;
  meta: string | null;
  created_at: number;
}

/**
 * Resolve actor names in one query rather than per row.
 *
 * The N+1 alternative is easy to write and shows up immediately on a busy org's log.
 */
async function withActorNames(env: Bindings, rows: Row[]): Promise<Row[]> {
  const ids = [...new Set(rows.map((r) => r.actor_id).filter((v): v is string => Boolean(v) && !rows.find((r) => r.actor_id === v)?.actor_label))];
  if (ids.length === 0) return rows;
  const placeholders = ids.map(() => "?").join(",");
  const users = await env.DB.prepare(`SELECT id, name, email FROM users WHERE id IN (${placeholders})`)
    .bind(...ids)
    .all<{ id: string; name: string; email: string }>();
  const byId = new Map((users.results ?? []).map((u) => [u.id, u.name || u.email]));
  return rows.map((r) => (r.actor_label || !r.actor_id ? r : { ...r, actor_label: byId.get(r.actor_id) ?? null }));
}

auditRouter.get(
  "/audit-logs",
  validator(
    "query",
    z.object({
      limit: z.coerce.number().int().min(1).max(200).default(50),
      before: z.coerce.number().int().optional(),
      action: z.string().max(80).optional(),
    }),
  ),
  describeRoute({
    tags: ["dashboard"],
    summary: "Activity log for the organization",
    responses: {
      200: {
        description: "Entries",
        content: {
          "application/json": {
            schema: resolver(z.object({ entries: z.array(AuditRow), nextBefore: z.number().nullable() })),
          },
        },
      },
      402: { description: "Activity log is a Business feature" },
    },
  }),
  async (c) => {
    const orgId = c.get("orgId")!;
    const { limit, before, action } = c.req.valid("query");
    // Keyset pagination on `created_at`, which the org index already covers. OFFSET would
    // degrade on exactly the accounts most likely to read this.
    const res = await c.env.DB.prepare(
      `SELECT id, action, actor_type, actor_id, actor_label, resource_type, resource_id, meta, created_at
         FROM audit_logs
        WHERE organization_id = ?1
          AND (?2 IS NULL OR created_at < ?2)
          AND (?3 IS NULL OR action = ?3)
        ORDER BY created_at DESC
        LIMIT ?4`,
    )
      .bind(orgId, before ?? null, action ?? null, limit)
      .all<Row>();

    const rows = await withActorNames(c.env, res.results ?? []);
    const last = rows.at(-1);
    return c.json({
      entries: rows.map((r) => ({
        id: r.id,
        action: r.action,
        actorType: r.actor_type,
        actorLabel: r.actor_label,
        resourceType: r.resource_type,
        resourceId: r.resource_id,
        meta: r.meta ? safeParse(r.meta) : null,
        createdAt: r.created_at,
      })),
      nextBefore: rows.length === limit && last ? last.created_at : null,
    });
  },
);

auditRouter.get(
  "/audit-logs/export",
  describeRoute({
    tags: ["dashboard"],
    summary: "Export the activity log as CSV",
    responses: { 200: { description: "CSV" }, 402: { description: "Activity log is a Business feature" } },
  }),
  async (c) => {
    const orgId = c.get("orgId")!;
    const res = await c.env.DB.prepare(
      `SELECT id, action, actor_type, actor_id, actor_label, resource_type, resource_id, meta, created_at
         FROM audit_logs WHERE organization_id = ? ORDER BY created_at DESC LIMIT 50000`,
    )
      .bind(orgId)
      .all<Row>();
    const rows = await withActorNames(c.env, res.results ?? []);

    const esc = (v: string) => `"${v.replaceAll('"', '""')}"`;
    const lines = [["timestamp", "action", "actor_type", "actor", "resource_type", "resource_id", "detail"].map(esc).join(",")];
    for (const r of rows) {
      lines.push(
        [
          new Date(r.created_at).toISOString(),
          r.action,
          r.actor_type,
          r.actor_label ?? r.actor_id ?? "",
          r.resource_type ?? "",
          r.resource_id ?? "",
          r.meta ?? "",
        ]
          .map(esc)
          .join(","),
      );
    }

    return new Response(lines.join("\n"), {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="activity-log-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  },
);

function safeParse(json: string): unknown {
  try {
    return JSON.parse(json);
  } catch {
    return json;
  }
}
