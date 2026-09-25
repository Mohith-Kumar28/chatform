import { Hono } from "hono";
import { describeRoute, resolver } from "hono-openapi";
import { z } from "zod";
import { BUILDER_FEEDBACK_AREA_KEYS, BUILDER_FEEDBACK_KIND_KEYS, FEEDBACK_NOTE_MAX } from "@repo/form-schema";
import type { Bindings } from "../../env.js";
import type { PlatformAdminVars } from "../../lib/platform-admin.js";
import { validator } from "../../lib/validator.js";
import { audit, DAY_MS, RANGES, RangeQuery, dayKeys, rows, type RangeKey } from "./shared.js";
import { BUILDER_POOL, mergeIssues, moveReport, nearestIssuesFor } from "../../lib/feedback-issues.js";
import { deleteBuilderReports, parseAttachments } from "../../lib/builder-feedback.js";
import type { BuilderFeedbackTriageMessage } from "../../lib/feedback-triage.js";

/**
 * The console's "Admin feedback" tab: what the people who build forms sent from
 * the "?" button. The respondent half lives in `./feedback.ts`; this mirrors it
 * over `builder_feedback` and the `builder` issue pool.
 *
 * Guarded by `requirePlatformAdmin` at the mount in `./index.ts`, not here.
 */
export const builderFeedbackAdminRouter = new Hono<{ Bindings: Bindings; Variables: Partial<PlatformAdminVars> }>();

const STATUSES = ["new", "resolved"] as const;
const LIVE = `status != 'spam'`;

/** Their pick, or the tagger's guess when they picked "Something else". */
const AREA = `CASE WHEN fb.area IS NULL OR fb.area = 'other' THEN COALESCE(fb.topic, fb.area) ELSE fb.area END`;

// ───────────────────────────────── the inbox ─────────────────────────────────

const ReportsQuery = z.object({
  status: z.enum(["new", "resolved", "all"]).default("new"),
  kind: z.enum(BUILDER_FEEDBACK_KIND_KEYS).optional(),
  area: z.enum(BUILDER_FEEDBACK_AREA_KEYS).optional(),
  plan: z.string().max(20).optional(),
  orgId: z.string().max(64).optional(),
  userId: z.string().max(64).optional(),
  issue: z.string().max(64).optional(),
  /** Their words, the summary, their name or address, or the account. */
  q: z.string().max(120).optional(),
  sort: z.enum(["newest", "oldest"]).default("newest"),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

const Attachment = z.object({ n: z.number(), type: z.string(), bytes: z.number(), auto: z.boolean() });

const BuilderReport = z.object({
  id: z.string(),
  kind: z.string(),
  /** Effective: their pick, or the tagger's when they picked "Something else". */
  area: z.string().nullable(),
  areaPicked: z.string().nullable(),
  rating: z.number().nullable(),
  severity: z.string().nullable(),
  title: z.string().nullable(),
  message: z.string(),
  steps: z.string().nullable(),
  expected: z.string().nullable(),
  why: z.string().nullable(),
  url: z.string().nullable(),
  formId: z.string().nullable(),
  formTitle: z.string().nullable(),
  userId: z.string().nullable(),
  userEmail: z.string().nullable(),
  userName: z.string().nullable(),
  /** Reports this person has sent, ever. */
  userReportCount: z.number(),
  role: z.string().nullable(),
  planId: z.string().nullable(),
  organizationId: z.string().nullable(),
  organizationName: z.string().nullable(),
  workspaceName: z.string().nullable(),
  impersonatorEmail: z.string().nullable(),
  context: z.record(z.string(), z.unknown()).nullable(),
  userAgent: z.string().nullable(),
  attachments: z.array(Attachment),
  status: z.string(),
  statusAt: z.number().nullable(),
  statusBy: z.string().nullable(),
  internalNote: z.string().nullable(),
  tags: z.array(z.string()),
  sentiment: z.number().nullable(),
  issueId: z.string().nullable(),
  issueTitle: z.string().nullable(),
  createdAt: z.number(),
});

const ReportsResponse = z.object({
  reports: z.array(BuilderReport),
  total: z.number(),
  limit: z.number(),
  offset: z.number(),
  /** Unfiltered, so the badges do not move as the list narrows. */
  counts: z.object({ new: z.number(), resolved: z.number() }),
  /** Under every filter except kind. */
  kindCounts: z.array(z.object({ kind: z.string(), count: z.number() })),
  /** Under every filter except area, largest first. */
  areaCounts: z.array(z.object({ area: z.string(), count: z.number() })),
});

const COLUMNS = `fb.*, ${AREA} AS effective_area, o.name AS org_name, f.title AS form_title, w.name AS workspace_name,
       iss.title AS issue_title,
       (SELECT COUNT(*) FROM builder_feedback x WHERE x.user_id = fb.user_id) AS user_reports`;

const JOINS = `FROM builder_feedback fb
       LEFT JOIN organizations o ON o.id = fb.organization_id
       LEFT JOIN forms f ON f.id = fb.form_id
       LEFT JOIN workspaces w ON w.id = fb.workspace_id
       LEFT JOIN feedback_issues iss ON iss.id = fb.issue_id`;

interface Row {
  id: string;
  kind: string;
  area: string | null;
  effective_area: string | null;
  rating: number | null;
  severity: string | null;
  title: string | null;
  message: string;
  steps: string | null;
  expected: string | null;
  why: string | null;
  url: string | null;
  form_id: string | null;
  form_title: string | null;
  user_id: string | null;
  user_email: string | null;
  user_name: string | null;
  user_reports: number;
  role: string | null;
  plan_id: string | null;
  organization_id: string | null;
  org_name: string | null;
  workspace_name: string | null;
  impersonator_email: string | null;
  context_json: string | null;
  user_agent: string | null;
  attachments_json: string | null;
  status: string;
  status_at: number | null;
  status_by: string | null;
  internal_note: string | null;
  tags: string | null;
  sentiment: number | null;
  issue_id: string | null;
  issue_title: string | null;
  created_at: number;
}

function parseJson<T>(raw: string | null, fallback: T): T {
  try {
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

const toReport = (r: Row) => ({
  id: r.id,
  kind: r.kind,
  area: r.effective_area,
  areaPicked: r.area,
  rating: r.rating === null ? null : Number(r.rating),
  severity: r.severity,
  title: r.title,
  message: r.message,
  steps: r.steps,
  expected: r.expected,
  why: r.why,
  url: r.url,
  formId: r.form_id,
  formTitle: r.form_title,
  userId: r.user_id,
  userEmail: r.user_email,
  userName: r.user_name,
  userReportCount: Number(r.user_reports ?? 1),
  role: r.role,
  planId: r.plan_id,
  organizationId: r.organization_id,
  organizationName: r.org_name,
  workspaceName: r.workspace_name,
  impersonatorEmail: r.impersonator_email,
  context: parseJson<Record<string, unknown> | null>(r.context_json, null),
  userAgent: r.user_agent,
  // Positions, not keys: the console fetches `/attachments/:n` and never learns the bucket layout.
  attachments: parseAttachments(r.attachments_json).map((a, n) => ({ n, type: a.type, bytes: a.bytes, auto: a.auto })),
  status: r.status,
  statusAt: r.status_at === null ? null : Number(r.status_at),
  statusBy: r.status_by,
  internalNote: r.internal_note,
  tags: parseJson<string[]>(r.tags, []).filter((t) => typeof t === "string"),
  sentiment: r.sentiment === null ? null : Number(r.sentiment),
  issueId: r.issue_id,
  issueTitle: r.issue_title,
  createdAt: Number(r.created_at),
});

builderFeedbackAdminRouter.get(
  "/admin/feedback/builder/reports",
  validator("query", ReportsQuery),
  describeRoute({
    tags: ["admin"],
    summary: "Bugs, feature requests and feedback from form builders, filtered and paged",
    responses: {
      200: { description: "Reports", content: { "application/json": { schema: resolver(ReportsResponse) } } },
      404: { description: "Not an admin" },
    },
  }),
  async (c) => {
    const q = c.req.valid("query");
    // Built with one filter optionally left out, so each menu counts under the others.
    const build = (skip?: "kind" | "area") => {
      const where: string[] = [];
      const binds: unknown[] = [];
      if (q.status === "all") where.push(`fb.${LIVE}`);
      else where.push("fb.status = ?"), binds.push(q.status);
      if (q.kind && skip !== "kind") where.push("fb.kind = ?"), binds.push(q.kind);
      if (q.area && skip !== "area") where.push(`${AREA} = ?`), binds.push(q.area);
      if (q.plan) where.push("fb.plan_id = ?"), binds.push(q.plan);
      if (q.orgId) where.push("fb.organization_id = ?"), binds.push(q.orgId);
      if (q.userId) where.push("fb.user_id = ?"), binds.push(q.userId);
      if (q.issue) where.push("fb.issue_id = ?"), binds.push(q.issue);
      if (q.q) {
        const like = `%${q.q}%`;
        where.push(
          "(fb.message LIKE ? OR fb.title LIKE ? OR fb.user_email LIKE ? OR fb.user_name LIKE ? OR o.name LIKE ?)",
        );
        binds.push(like, like, like, like, like);
      }
      return { clause: where.join(" AND "), binds };
    };
    const { clause, binds } = build();
    const byKind = build("kind");
    const byArea = build("area");

    const [reports, totalRow, counted, kindRows, areaRows] = await Promise.all([
      rows<Row>(
        c.env.DB.prepare(
          `SELECT ${COLUMNS} ${JOINS} WHERE ${clause}
            ORDER BY fb.created_at ${q.sort === "oldest" ? "ASC" : "DESC"} LIMIT ? OFFSET ?`,
        ).bind(...binds, q.limit, q.offset),
      ),
      c.env.DB.prepare(`SELECT COUNT(*) AS n ${JOINS} WHERE ${clause}`)
        .bind(...binds)
        .first<{ n: number }>(),
      rows<{ status: string; n: number }>(
        c.env.DB.prepare(`SELECT status, COUNT(*) AS n FROM builder_feedback GROUP BY status`),
      ),
      rows<{ kind: string; n: number }>(
        c.env.DB.prepare(`SELECT fb.kind, COUNT(*) AS n ${JOINS} WHERE ${byKind.clause} GROUP BY fb.kind`).bind(
          ...byKind.binds,
        ),
      ),
      rows<{ area: string | null; n: number }>(
        c.env.DB.prepare(`SELECT ${AREA} AS area, COUNT(*) AS n ${JOINS} WHERE ${byArea.clause} GROUP BY 1`).bind(
          ...byArea.binds,
        ),
      ),
    ]);

    const byStatus = new Map(counted.map((r) => [r.status, Number(r.n)]));
    return c.json({
      reports: reports.map(toReport),
      total: Number(totalRow?.n ?? 0),
      limit: q.limit,
      offset: q.offset,
      counts: { new: byStatus.get("new") ?? 0, resolved: byStatus.get("resolved") ?? 0 },
      kindCounts: kindRows.map((r) => ({ kind: r.kind, count: Number(r.n) })),
      areaCounts: areaRows
        .filter((r) => r.area)
        .map((r) => ({ area: r.area as string, count: Number(r.n) }))
        .sort((x, y) => y.count - x.count),
    });
  },
);

builderFeedbackAdminRouter.get(
  "/admin/feedback/builder/reports/:id",
  describeRoute({
    tags: ["admin"],
    summary: "One report from a form builder, with its account and context",
    responses: {
      200: { description: "Report", content: { "application/json": { schema: resolver(BuilderReport) } } },
      404: { description: "Not an admin, or no such report" },
    },
  }),
  async (c) => {
    const row = await c.env.DB.prepare(`SELECT ${COLUMNS} ${JOINS} WHERE fb.id = ?1`)
      .bind(c.req.param("id"))
      .first<Row>();
    if (!row) return c.json({ error: { code: "not_found", message: "No such report" } }, 404);
    return c.json(toReport(row));
  },
);

const TriageBody = z
  .object({
    status: z.enum(STATUSES).optional(),
    internalNote: z.string().max(FEEDBACK_NOTE_MAX).nullable().optional(),
  })
  .refine((v) => v.status !== undefined || v.internalNote !== undefined, { message: "Nothing to change" });

builderFeedbackAdminRouter.patch(
  "/admin/feedback/builder/reports/:id",
  validator("json", TriageBody),
  describeRoute({
    tags: ["admin"],
    summary: "Resolve or reopen a builder's report, or attach an internal note",
    responses: {
      200: { description: "Updated", content: { "application/json": { schema: resolver(z.object({ ok: z.boolean() })) } } },
      404: { description: "Not an admin, or no such report" },
    },
  }),
  async (c) => {
    const id = c.req.param("id");
    const body = c.req.valid("json");
    const sets: string[] = [];
    const binds: unknown[] = [];
    if (body.status !== undefined) {
      sets.push("status = ?", "status_at = ?", "status_by = ?");
      binds.push(body.status, Date.now(), c.get("platformAdminEmail") ?? null);
    }
    if (body.internalNote !== undefined) {
      sets.push("internal_note = ?");
      binds.push(body.internalNote === null || body.internalNote.trim() === "" ? null : body.internalNote.trim());
    }
    const result = await c.env.DB.prepare(`UPDATE builder_feedback SET ${sets.join(", ")} WHERE id = ?`)
      .bind(...binds, id)
      .run();
    if ((result.meta.changes ?? 0) === 0) return c.json({ error: { code: "not_found", message: "No such report" } }, 404);
    await audit(c, "_platform", "admin.builder_feedback.triaged", {
      resourceType: "builder_feedback",
      resourceId: id,
      status: body.status ?? null,
      noted: body.internalNote !== undefined,
    });
    return c.json({ ok: true });
  },
);

builderFeedbackAdminRouter.delete(
  "/admin/feedback/builder/reports/:id",
  describeRoute({
    tags: ["admin"],
    summary: "Delete a builder's report, its images and its vector",
    responses: {
      200: { description: "Deleted", content: { "application/json": { schema: resolver(z.object({ ok: z.boolean() })) } } },
      404: { description: "Not an admin, or no such report" },
    },
  }),
  async (c) => {
    const id = c.req.param("id");
    if ((await deleteBuilderReports(c.env, [id])) === 0) {
      return c.json({ error: { code: "not_found", message: "No such report" } }, 404);
    }
    await audit(c, "_platform", "admin.builder_feedback.deleted", { resourceType: "builder_feedback", resourceId: id });
    return c.json({ ok: true });
  },
);

/**
 * One attached image, streamed from R2.
 *
 * By position rather than key, so the bucket layout never reaches a browser, and
 * served as an attachment-safe image: the type is one of four checked at upload,
 * and `nosniff` keeps a browser from deciding otherwise.
 */
builderFeedbackAdminRouter.get(
  "/admin/feedback/builder/reports/:id/attachments/:n",
  describeRoute({
    tags: ["admin"],
    summary: "One image attached to a builder's report",
    responses: {
      200: { description: "The image" },
      404: { description: "Not an admin, no such report, or no such image" },
    },
  }),
  async (c) => {
    const row = await c.env.DB.prepare(`SELECT attachments_json FROM builder_feedback WHERE id = ?1`)
      .bind(c.req.param("id"))
      .first<{ attachments_json: string | null }>();
    const attachment = parseAttachments(row?.attachments_json ?? null)[Number(c.req.param("n"))];
    if (!attachment) return c.json({ error: { code: "not_found", message: "No such image" } }, 404);
    const object = await c.env.R2.get(attachment.key);
    if (!object) return c.json({ error: { code: "not_found", message: "Image has gone" } }, 404);
    return new Response(object.body, {
      headers: {
        "content-type": attachment.type,
        "x-content-type-options": "nosniff",
        "cache-control": "private, max-age=3600",
      },
    });
  },
);

// ─────────────────────────────── issues ───────────────────────────────

const IssuesQuery = z.object({
  status: z.enum(["new", "resolved", "all"]).default("new"),
  kind: z.enum(BUILDER_FEEDBACK_KIND_KEYS).optional(),
  sort: z.enum(["priority", "recent", "reports"]).default("priority"),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

const BuilderIssue = z.object({
  id: z.string(),
  title: z.string(),
  /** The kind most of its reports are. The matcher keeps kinds apart, so usually all of them. */
  kind: z.string(),
  area: z.string().nullable(),
  reports: z.number(),
  people: z.number(),
  accounts: z.number(),
  /** Reports from accounts on a paid plan. */
  paid: z.number(),
  lastSeenAt: z.number(),
  status: z.enum(["new", "resolved"]),
  reopened: z.boolean(),
});

const IssuesResponse = z.object({
  issues: z.array(BuilderIssue),
  total: z.number(),
  limit: z.number(),
  offset: z.number(),
  counts: z.object({ new: z.number(), resolved: z.number() }),
  ungrouped: z.number(),
});

const ISSUE_ROLLUP = `SELECT i.id, i.title, i.topic,
         MAX(fb.kind) AS kind,
         COUNT(fb.id) AS reports,
         COUNT(DISTINCT fb.user_id) AS people,
         COUNT(DISTINCT fb.organization_id) AS accounts,
         SUM(CASE WHEN fb.plan_id IS NOT NULL AND fb.plan_id != 'free' THEN 1 ELSE 0 END) AS paid,
         MAX(fb.created_at) AS last_seen_at,
         SUM(CASE WHEN fb.status = 'new' THEN 1 ELSE 0 END) AS unresolved,
         MAX(CASE WHEN fb.status = 'resolved' THEN fb.status_at END) AS last_resolved_at,
         MAX(CASE WHEN fb.status = 'new' THEN fb.created_at END) AS last_new_at
    FROM feedback_issues i
    JOIN builder_feedback fb ON fb.issue_id = i.id AND fb.${LIVE}
   WHERE i.merged_into IS NULL AND i.pool = 'builder'`;

interface IssueRow {
  id: string;
  title: string;
  topic: string | null;
  kind: string;
  reports: number;
  people: number;
  accounts: number;
  paid: number;
  last_seen_at: number;
  unresolved: number;
  last_resolved_at: number | null;
  last_new_at: number | null;
}

const toIssue = (r: IssueRow) => {
  const unresolved = Number(r.unresolved) > 0;
  return {
    id: r.id,
    title: r.title,
    kind: r.kind,
    area: r.topic,
    reports: Number(r.reports),
    people: Number(r.people),
    accounts: Number(r.accounts),
    paid: Number(r.paid),
    lastSeenAt: Number(r.last_seen_at),
    status: (unresolved ? "new" : "resolved") as "new" | "resolved",
    reopened:
      unresolved && r.last_resolved_at !== null && r.last_new_at !== null && Number(r.last_new_at) > Number(r.last_resolved_at),
  };
};

builderFeedbackAdminRouter.get(
  "/admin/feedback/builder/issues",
  validator("query", IssuesQuery),
  describeRoute({
    tags: ["admin"],
    summary: "Builders' reports grouped into issues",
    responses: {
      200: { description: "Issues", content: { "application/json": { schema: resolver(IssuesResponse) } } },
      404: { description: "Not an admin" },
    },
  }),
  async (c) => {
    const q = c.req.valid("query");
    const where: string[] = [];
    const binds: unknown[] = [];
    if (q.kind) {
      where.push(`EXISTS (SELECT 1 FROM builder_feedback x WHERE x.issue_id = i.id AND x.kind = ? AND x.${LIVE})`);
      binds.push(q.kind);
    }
    const filtered = `${ISSUE_ROLLUP}${where.length ? ` AND ${where.join(" AND ")}` : ""} GROUP BY i.id`;
    const having = q.status === "new" ? " HAVING unresolved > 0" : q.status === "resolved" ? " HAVING unresolved = 0" : "";
    /*
      Priority: how many accounts asked, paid ones counting double, halved by
      every quiet week. Ten free trials asking once each is a signal; three paying
      customers asking this week is louder.
    */
    const order =
      q.sort === "reports"
        ? "reports DESC, last_seen_at DESC"
        : q.sort === "recent"
          ? "last_seen_at DESC"
          : `(accounts + paid) / (1 + (${Date.now()} - last_seen_at) / ${7 * DAY_MS}.0) DESC, last_seen_at DESC`;

    const [issues, totalRow, countRow, ungroupedRow] = await Promise.all([
      rows<IssueRow>(
        c.env.DB.prepare(`${filtered}${having} ORDER BY ${order} LIMIT ? OFFSET ?`).bind(...binds, q.limit, q.offset),
      ),
      c.env.DB.prepare(`SELECT COUNT(*) AS n FROM (${filtered}${having})`)
        .bind(...binds)
        .first<{ n: number }>(),
      c.env.DB.prepare(
        `SELECT SUM(CASE WHEN unresolved > 0 THEN 1 ELSE 0 END) AS open, SUM(CASE WHEN unresolved = 0 THEN 1 ELSE 0 END) AS done
           FROM (${ISSUE_ROLLUP} GROUP BY i.id)`,
      ).first<{ open: number | null; done: number | null }>(),
      c.env.DB.prepare(`SELECT COUNT(*) AS n FROM builder_feedback WHERE issue_id IS NULL AND ${LIVE}`).first<{
        n: number;
      }>(),
    ]);

    return c.json({
      issues: issues.map(toIssue),
      total: Number(totalRow?.n ?? 0),
      limit: q.limit,
      offset: q.offset,
      counts: { new: Number(countRow?.open ?? 0), resolved: Number(countRow?.done ?? 0) },
      ungrouped: Number(ungroupedRow?.n ?? 0),
    });
  },
);

builderFeedbackAdminRouter.get(
  "/admin/feedback/builder/issues/:id",
  describeRoute({
    tags: ["admin"],
    summary: "One builder issue, with counts derived from its reports",
    responses: {
      200: { description: "Issue", content: { "application/json": { schema: resolver(BuilderIssue) } } },
      404: { description: "Not an admin, or no such issue" },
    },
  }),
  async (c) => {
    // A merged-away issue answers with its survivor, so an old link still lands somewhere.
    let id = c.req.param("id");
    const merged = await c.env.DB.prepare(`SELECT merged_into FROM feedback_issues WHERE id = ?1 AND pool = 'builder'`)
      .bind(id)
      .first<{ merged_into: string | null }>();
    if (merged?.merged_into) id = merged.merged_into;
    const row = await c.env.DB.prepare(`${ISSUE_ROLLUP} AND i.id = ? GROUP BY i.id`).bind(id).first<IssueRow>();
    if (!row) return c.json({ error: { code: "not_found", message: "No such issue" } }, 404);
    return c.json(toIssue(row));
  },
);

builderFeedbackAdminRouter.patch(
  "/admin/feedback/builder/issues/:id",
  validator(
    "json",
    z
      .object({
        status: z.enum(STATUSES).optional(),
        title: z.string().trim().min(1).max(120).optional(),
      })
      .refine((v) => v.status !== undefined || v.title !== undefined, { message: "Nothing to change" }),
  ),
  describeRoute({
    tags: ["admin"],
    summary: "Resolve, reopen or rename a builder issue",
    responses: {
      200: { description: "Updated", content: { "application/json": { schema: resolver(z.object({ ok: z.boolean() })) } } },
      404: { description: "Not an admin, or no such issue" },
    },
  }),
  async (c) => {
    const id = c.req.param("id");
    const body = c.req.valid("json");
    const exists = await c.env.DB.prepare(
      `SELECT id FROM feedback_issues WHERE id = ?1 AND merged_into IS NULL AND pool = 'builder'`,
    )
      .bind(id)
      .first<{ id: string }>();
    if (!exists) return c.json({ error: { code: "not_found", message: "No such issue" } }, 404);

    const writes: D1PreparedStatement[] = [];
    if (body.status !== undefined) {
      writes.push(
        c.env.DB.prepare(
          `UPDATE builder_feedback SET status = ?1, status_at = ?2, status_by = ?3
            WHERE issue_id = ?4 AND ${LIVE} AND status != ?1`,
        ).bind(body.status, Date.now(), c.get("platformAdminEmail") ?? null, id),
      );
    }
    if (body.title !== undefined) {
      writes.push(c.env.DB.prepare(`UPDATE feedback_issues SET title = ?1, title_edited = 1 WHERE id = ?2`).bind(body.title, id));
    }
    await c.env.DB.batch(writes);
    await audit(c, "_platform", "admin.builder_feedback.issue_triaged", {
      resourceType: "feedback_issue",
      resourceId: id,
      status: body.status ?? null,
      renamed: body.title !== undefined,
    });
    return c.json({ ok: true });
  },
);

builderFeedbackAdminRouter.post(
  "/admin/feedback/builder/issues/:id/merge",
  validator("json", z.object({ into: z.string().max(64) })),
  describeRoute({
    tags: ["admin"],
    summary: "Merge a builder issue into another",
    responses: {
      200: { description: "Merged", content: { "application/json": { schema: resolver(z.object({ ok: z.boolean() })) } } },
      404: { description: "Not an admin, or either issue is missing or already merged" },
    },
  }),
  async (c) => {
    const id = c.req.param("id");
    const { into } = c.req.valid("json");
    if (!(await mergeIssues(c.env, id, into, BUILDER_POOL))) {
      return c.json({ error: { code: "not_found", message: "Cannot merge those two" } }, 404);
    }
    await audit(c, "_platform", "admin.builder_feedback.issue_merged", { resourceType: "feedback_issue", resourceId: id, into });
    return c.json({ ok: true });
  },
);

builderFeedbackAdminRouter.get(
  "/admin/feedback/builder/reports/:id/nearest",
  describeRoute({
    tags: ["admin"],
    summary: "The builder issues a report could be moved to, nearest first",
    responses: {
      200: {
        description: "Nearest issues",
        content: {
          "application/json": {
            schema: resolver(z.object({ issues: z.array(z.object({ id: z.string(), title: z.string(), score: z.number() })) })),
          },
        },
      },
      404: { description: "Not an admin" },
    },
  }),
  async (c) => c.json({ issues: await nearestIssuesFor(c.env, c.req.param("id"), 5, BUILDER_POOL) }),
);

builderFeedbackAdminRouter.post(
  "/admin/feedback/builder/reports/:id/move",
  validator("json", z.object({ issueId: z.string().max(64) })),
  describeRoute({
    tags: ["admin"],
    summary: 'Move a builder report to another issue, or to a new one of its own (`issueId: "new"`)',
    responses: {
      200: { description: "Moved", content: { "application/json": { schema: resolver(z.object({ issueId: z.string() })) } } },
      404: { description: "Not an admin, no such report, or no such issue" },
    },
  }),
  async (c) => {
    const id = c.req.param("id");
    const moved = await moveReport(c.env, id, c.req.valid("json").issueId, BUILDER_POOL);
    if (!moved) return c.json({ error: { code: "not_found", message: "Cannot move that report there" } }, 404);
    await audit(c, "_platform", "admin.builder_feedback.moved", { resourceType: "builder_feedback", resourceId: id, issueId: moved });
    return c.json({ issueId: moved });
  },
);

/** Drop this pool's issues and re-match every report through the serial queue. Nobody is mailed. */
builderFeedbackAdminRouter.post(
  "/admin/feedback/builder/issues/rebuild",
  describeRoute({
    tags: ["admin"],
    summary: "Discard all builder issues and re-match every builder report",
    responses: {
      200: { description: "Queued", content: { "application/json": { schema: resolver(z.object({ queued: z.number() })) } } },
      404: { description: "Not an admin" },
    },
  }),
  async (c) => {
    const reports = await rows<{ id: string }>(
      c.env.DB.prepare(`SELECT id FROM builder_feedback ORDER BY created_at ASC`),
    );
    await c.env.DB.batch([
      c.env.DB.prepare(`UPDATE builder_feedback SET issue_id = NULL, issue_similarity = NULL WHERE issue_id IS NOT NULL`),
      c.env.DB.prepare(`DELETE FROM feedback_issues WHERE pool = 'builder'`),
    ]);
    for (let i = 0; i < reports.length; i += 100) {
      await c.env.Q_FEEDBACK.sendBatch(
        reports.slice(i, i + 100).map((r) => ({
          body: { kind: "builder_feedback_triage", feedbackId: r.id, mail: false } satisfies BuilderFeedbackTriageMessage,
        })),
      );
    }
    await audit(c, "_platform", "admin.builder_feedback.issues_rebuilt", { resourceType: "feedback_issue", queued: reports.length });
    return c.json({ queued: reports.length });
  },
);

// ───────────────────────────── the page's numbers ─────────────────────────────

const Keyed = z.array(z.object({ key: z.string(), label: z.string().nullable(), value: z.number() }));

const BuilderStats = z.object({
  range: z.string(),
  days: z.array(z.string()),
  total: z.number(),
  previousTotal: z.number(),
  bugs: z.number(),
  previousBugs: z.number(),
  features: z.number(),
  previousFeatures: z.number(),
  accounts: z.number(),
  previousAccounts: z.number(),
  /** The faces on "Feedback" reports. Null under five of them. */
  average: z.number().nullable(),
  previousAverage: z.number().nullable(),
  /** Still `new`, over all time. */
  unresolved: z.number(),
  series: z.object({
    byKind: z.array(z.object({ kind: z.string(), counts: z.array(z.number()) })),
  }),
  distribution: z.array(z.object({ rating: z.number(), count: z.number() })),
  byArea: Keyed,
  byPlan: Keyed,
  topAccounts: Keyed,
});

async function windowTotals(env: Bindings, from: number, to: number) {
  const row = await env.DB.prepare(
    `SELECT COUNT(*) AS n,
            SUM(CASE WHEN kind = 'bug' THEN 1 ELSE 0 END) AS bugs,
            SUM(CASE WHEN kind = 'feature' THEN 1 ELSE 0 END) AS features,
            COUNT(DISTINCT organization_id) AS accounts,
            SUM(rating) AS pts,
            SUM(CASE WHEN rating IS NOT NULL THEN 1 ELSE 0 END) AS rated
       FROM builder_feedback
      WHERE created_at >= ?1 AND created_at < ?2 AND ${LIVE}`,
  )
    .bind(from, to)
    .first<{ n: number; bugs: number | null; features: number | null; accounts: number; pts: number | null; rated: number | null }>();
  const rated = Number(row?.rated ?? 0);
  return {
    total: Number(row?.n ?? 0),
    bugs: Number(row?.bugs ?? 0),
    features: Number(row?.features ?? 0),
    accounts: Number(row?.accounts ?? 0),
    average: rated >= 5 ? Math.round((Number(row?.pts ?? 0) / rated) * 10) / 10 : null,
  };
}

builderFeedbackAdminRouter.get(
  "/admin/feedback/builder/stats",
  validator("query", RangeQuery),
  describeRoute({
    tags: ["admin"],
    summary: "Volume of builders' bugs, requests and feedback over a period",
    responses: {
      200: { description: "Statistics", content: { "application/json": { schema: resolver(BuilderStats) } } },
      404: { description: "Not an admin" },
    },
  }),
  async (c) => {
    const range = c.req.valid("query").range as RangeKey;
    const days = RANGES[range];
    const now = Date.now();
    const since = now - days * DAY_MS;

    const [grid, current, previous, unresolvedRow, ratings, areas, plans, accounts] = await Promise.all([
      rows<{ d: string; kind: string; n: number }>(
        c.env.DB.prepare(
          `SELECT strftime('%Y-%m-%d', created_at / 1000, 'unixepoch') AS d, kind, COUNT(*) AS n
             FROM builder_feedback WHERE created_at >= ?1 AND ${LIVE} GROUP BY d, kind`,
        ).bind(since),
      ),
      windowTotals(c.env, since, now),
      windowTotals(c.env, since - days * DAY_MS, since),
      c.env.DB.prepare(`SELECT COUNT(*) AS n FROM builder_feedback WHERE status = 'new'`).first<{ n: number }>(),
      rows<{ rating: number; n: number }>(
        c.env.DB.prepare(
          `SELECT rating, COUNT(*) AS n FROM builder_feedback
            WHERE created_at >= ?1 AND ${LIVE} AND rating IS NOT NULL GROUP BY rating`,
        ).bind(since),
      ),
      rows<{ key: string; n: number }>(
        c.env.DB.prepare(
          `SELECT ${AREA} AS key, COUNT(*) AS n FROM builder_feedback fb
            WHERE fb.created_at >= ?1 AND fb.${LIVE} AND ${AREA} IS NOT NULL GROUP BY 1 ORDER BY n DESC LIMIT 10`,
        ).bind(since),
      ),
      rows<{ key: string; n: number }>(
        c.env.DB.prepare(
          `SELECT COALESCE(plan_id, 'free') AS key, COUNT(*) AS n FROM builder_feedback
            WHERE created_at >= ?1 AND ${LIVE} GROUP BY 1 ORDER BY n DESC`,
        ).bind(since),
      ),
      rows<{ key: string; label: string | null; n: number }>(
        c.env.DB.prepare(
          `SELECT fb.organization_id AS key, o.name AS label, COUNT(*) AS n FROM builder_feedback fb
             LEFT JOIN organizations o ON o.id = fb.organization_id
            WHERE fb.created_at >= ?1 AND fb.${LIVE} AND fb.organization_id IS NOT NULL
            GROUP BY fb.organization_id ORDER BY n DESC LIMIT 8`,
        ).bind(since),
      ),
    ]);

    const dayList = dayKeys(days);
    const index = new Map(dayList.map((d, i) => [d, i]));
    const byKind = BUILDER_FEEDBACK_KIND_KEYS.map((kind) => ({ kind, counts: new Array<number>(dayList.length).fill(0) }));
    for (const row of grid) {
      const i = index.get(row.d);
      const band = byKind.find((b) => b.kind === row.kind);
      if (i === undefined || !band) continue;
      band.counts[i] = (band.counts[i] ?? 0) + Number(row.n);
    }

    return c.json({
      range,
      days: dayList,
      total: current.total,
      previousTotal: previous.total,
      bugs: current.bugs,
      previousBugs: previous.bugs,
      features: current.features,
      previousFeatures: previous.features,
      accounts: current.accounts,
      previousAccounts: previous.accounts,
      average: current.average,
      previousAverage: previous.average,
      unresolved: Number(unresolvedRow?.n ?? 0),
      series: { byKind },
      distribution: [1, 2, 3, 4, 5].map((rating) => ({
        rating,
        count: Number(ratings.find((r) => Number(r.rating) === rating)?.n ?? 0),
      })),
      byArea: areas.map((a) => ({ key: a.key, label: null, value: Number(a.n) })),
      byPlan: plans.map((p) => ({ key: p.key, label: null, value: Number(p.n) })),
      topAccounts: accounts.map((a) => ({ key: a.key, label: a.label, value: Number(a.n) })),
    });
  },
);
