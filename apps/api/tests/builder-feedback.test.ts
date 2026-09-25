import { env } from "cloudflare:test";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { applySchema, fetchApi, seedTenant, type Tenant } from "./helpers.js";
import { BUILDER_FEEDBACK_DAILY_CAP } from "../src/lib/builder-feedback.js";
import { BUILDER_POOL, RESPONDENT_POOL, assignIssue, type Decider, type Embedder } from "../src/lib/feedback-issues.js";
import { runMailJob } from "../src/lib/mail-jobs.js";
import type { Bindings } from "../src/env.js";

/**
 * The "?" button: a signed-in builder telling us about a bug, asking for a
 * feature or leaving feedback, with screenshots.
 *
 * What has to hold: only a signed-in person can file one, the plan and role come
 * from the database and not the page, the images land in R2 and nowhere a
 * customer can reach, every admin is mailed with Reply-To the sender, and the
 * console, not the customer, can read it back.
 */

const DB = () => env as unknown as Bindings;
const setAllowlist = (value: string | undefined) => {
  (env as unknown as Record<string, string | undefined>).PLATFORM_ADMIN_EMAILS = value;
};

let t: Tenant;
let other: Tenant;
let admin: Tenant;

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

function file(): FormData {
  return new FormData();
}

function send(
  tenant: Tenant | null,
  payload: Record<string, unknown>,
  images: { type: string; bytes?: Uint8Array; name?: string }[] = [],
): Promise<Response> {
  const form = file();
  form.set("payload", JSON.stringify(payload));
  for (const [i, img] of images.entries()) {
    form.append("images", new File([img.bytes ?? PNG], img.name ?? `shot-${i}.png`, { type: img.type }));
  }
  return fetchApi("/api/feedback", {
    method: "POST",
    headers: { ...(tenant ? { cookie: tenant.cookie } : {}), "user-agent": "Mozilla/5.0 (Builder test)" },
    body: form,
  });
}

beforeAll(async () => {
  await applySchema();
  t = await seedTenant("bfb-owner");
  other = await seedTenant("bfb-other");
  admin = await seedTenant("bfb-founder");
});

beforeEach(() => setAllowlist("bfb-founder@example.com"));

describe("filing a report", () => {
  it("refuses anyone not signed in", async () => {
    const res = await send(null, { kind: "bug", message: "Broken" });
    expect(res.status).toBe(401);
  });

  it("stores a bug with its fields, images and who sent it", async () => {
    const res = await send(
      t,
      {
        kind: "bug",
        area: "results",
        severity: "blocking",
        message: "  CSV export spins forever  ",
        steps: "1. Open results\n2. Export",
        expected: "A file",
        why: "ignored for a bug",
        url: "https://chatform.in/forms/x/results",
        formId: t.formId,
        workspaceId: t.workspaceId,
        autoScreenshot: 0,
        context: { viewport: "1440x900", errors: ["TypeError: x is undefined"] },
      },
      [{ type: "image/png" }, { type: "image/webp" }],
    );
    expect(res.status).toBe(200);
    const { id } = (await res.json()) as { id: string };
    expect(id).toMatch(/^bfb_/);

    const row = await env.DB.prepare(`SELECT * FROM builder_feedback WHERE id = ?`).bind(id).first<Record<string, unknown>>();
    expect(row).toMatchObject({
      kind: "bug",
      area: "results",
      severity: "blocking",
      message: "CSV export spins forever",
      steps: "1. Open results\n2. Export",
      expected: "A file",
      why: null,
      user_id: t.userId,
      user_email: "bfb-owner@example.com",
      organization_id: t.orgId,
      form_id: t.formId,
      workspace_id: t.workspaceId,
      role: "owner",
      plan_id: "free",
      user_agent: "Mozilla/5.0 (Builder test)",
      status: "new",
    });

    const attachments = JSON.parse(String(row!.attachments_json)) as { key: string; auto: boolean; type: string }[];
    expect(attachments).toHaveLength(2);
    expect(attachments[0]).toMatchObject({ auto: true, type: "image/png" });
    expect(attachments[1]).toMatchObject({ auto: false, type: "image/webp" });
    expect(attachments[0]!.key).toBe(`builder-feedback/${t.orgId}/${id}/0.png`);
    expect(await env.R2.get(attachments[0]!.key)).not.toBeNull();
  });

  it("drops a form or workspace id from another organization", async () => {
    const res = await send(t, { kind: "feature", message: "Excel export", formId: other.formId, workspaceId: other.workspaceId });
    const { id } = (await res.json()) as { id: string };
    const row = await env.DB.prepare(`SELECT form_id, workspace_id FROM builder_feedback WHERE id = ?`)
      .bind(id)
      .first<{ form_id: string | null; workspace_id: string | null }>();
    expect(row).toEqual({ form_id: null, workspace_id: null });
  });

  it("requires a face for feedback, and a severity that fits the kind", async () => {
    expect((await send(t, { kind: "feedback", message: "Nice" })).status).toBe(400);
    expect((await send(t, { kind: "bug", message: "x", severity: "critical" })).status).toBe(400);
    expect((await send(t, { kind: "feature", message: "x", severity: "critical" })).status).toBe(200);
  });

  it("refuses an empty message, a non-image and too many images", async () => {
    expect((await send(t, { kind: "bug", message: "   " })).status).toBe(400);
    expect((await send(t, { kind: "bug", message: "x" }, [{ type: "text/html", name: "x.html" }])).status).toBe(400);
    const six = Array.from({ length: 6 }, () => ({ type: "image/png" }));
    expect((await send(t, { kind: "bug", message: "x" }, six)).status).toBe(400);
  });

  it("caps a person at ten a day", async () => {
    const tenant = await seedTenant("bfb-capped");
    for (let i = 0; i < BUILDER_FEEDBACK_DAILY_CAP; i++) {
      expect((await send(tenant, { kind: "feature", message: `Idea ${i}` })).status).toBe(200);
    }
    const res = await send(tenant, { kind: "feature", message: "One more" });
    expect(res.status).toBe(429);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe("feedback_capped");
  });
});

describe("the mail", () => {
  function captureBinding() {
    const sent: { to: string; subject: string; html: string; text: string; replyTo?: string }[] = [];
    const binding = {
      send: async (msg: unknown) => {
        sent.push(msg as (typeof sent)[number]);
        return { messageId: `msg_${sent.length}` } as unknown as EmailSendResult;
      },
    } as unknown as SendEmail;
    return { sent, binding };
  }

  it("goes to every admin, replying to the person who sent it", async () => {
    const res = await send(t, { kind: "bug", area: "results", severity: "blocking", message: "Export hangs on big forms" }, [
      { type: "image/png" },
    ]);
    const { id } = (await res.json()) as { id: string };
    await env.DB.prepare(`UPDATE builder_feedback SET title = 'CSV export hangs on large forms' WHERE id = ?`).bind(id).run();

    const { sent, binding } = captureBinding();
    const out = await runMailJob(
      { ...DB(), EMAIL: binding, PLATFORM_ADMIN_EMAILS: "one@example.com, two@example.com" },
      { kind: "builder_feedback", feedbackId: id },
    );
    expect(out.messages).toBe(2);
    expect(sent.map((m) => m.to).sort()).toEqual(["one@example.com", "two@example.com"]);
    expect(sent[0]!.replyTo).toBe("bfb-owner@example.com");
    expect(sent[0]!.subject).toContain("chatform feedback: Bug · Blocking my work: CSV export hangs on large forms");
    expect(sent[0]!.text).toContain("Export hangs on big forms");
    expect(sent[0]!.text).toContain("Area: Results");
    expect(sent[0]!.text).toContain("1 image");
    expect(sent[0]!.text).toContain(`report=${id}`);
  });
});

describe("the console", () => {
  it("is invisible to a customer", async () => {
    const res = await fetchApi("/api/admin/feedback/builder/reports", { headers: { cookie: t.cookie } });
    expect(res.status).toBe(404);
  });

  it("lists, filters, triages and serves the images", async () => {
    const res = await send(other, { kind: "feature", area: "integrate", severity: "important", message: "HubSpot sync" }, [
      { type: "image/png" },
    ]);
    const { id } = (await res.json()) as { id: string };

    const list = await fetchApi("/api/admin/feedback/builder/reports?kind=feature&area=integrate", {
      headers: { cookie: admin.cookie },
    });
    expect(list.status).toBe(200);
    const body = (await list.json()) as {
      reports: { id: string; kind: string; organizationId: string; attachments: { n: number; auto: boolean }[] }[];
      kindCounts: { kind: string; count: number }[];
    };
    const mine = body.reports.find((r) => r.id === id);
    expect(mine).toMatchObject({ kind: "feature", organizationId: other.orgId });
    expect(mine!.attachments).toEqual([{ n: 0, type: "image/png", bytes: PNG.byteLength, auto: false }]);
    // Each menu counts under the other filters: nobody filed a bug under Integrations.
    expect(body.kindCounts.map((k) => k.kind)).toEqual(["feature"]);

    const image = await fetchApi(`/api/admin/feedback/builder/reports/${id}/attachments/0`, { headers: { cookie: admin.cookie } });
    expect(image.status).toBe(200);
    expect(image.headers.get("content-type")).toBe("image/png");
    expect(new Uint8Array(await image.arrayBuffer())).toEqual(PNG);
    const denied = await fetchApi(`/api/admin/feedback/builder/reports/${id}/attachments/0`, { headers: { cookie: other.cookie } });
    expect(denied.status).toBe(404);

    const patch = await fetchApi(`/api/admin/feedback/builder/reports/${id}`, {
      method: "PATCH",
      headers: { cookie: admin.cookie, "content-type": "application/json" },
      body: JSON.stringify({ status: "resolved", internalNote: "Shipped in v2" }),
    });
    expect(patch.status).toBe(200);
    const row = await env.DB.prepare(`SELECT status, status_by, internal_note FROM builder_feedback WHERE id = ?`)
      .bind(id)
      .first();
    expect(row).toEqual({ status: "resolved", status_by: "bfb-founder@example.com", internal_note: "Shipped in v2" });

    const del = await fetchApi(`/api/admin/feedback/builder/reports/${id}`, {
      method: "DELETE",
      headers: { cookie: admin.cookie },
    });
    expect(del.status).toBe(200);
    expect(await env.R2.get(`builder-feedback/${other.orgId}/${id}/0.png`)).toBeNull();
  });
});

describe("issue pools", () => {
  const embed: Embedder = async () => [1, 0, 0, 0];
  const decide: Decider = async ({ candidates }) => ({ match: candidates[0]?.id ?? null, title: "Same thing" });

  it("never matches a builder report to a respondent issue, or a request to a bug", async () => {
    const now = Date.now();
    await env.DB.prepare(
      `INSERT INTO respondent_feedback (id, rating, message, source, status, created_at) VALUES ('fbk_pool_1', 2, 'Picker broken', 'chat', 'new', ?1)`,
    )
      .bind(now)
      .run();
    const respondent = await assignIssue(DB(), "fbk_pool_1", { embed, decide }, RESPONDENT_POOL);
    expect(respondent?.created).toBe(true);

    const insert = (id: string, kind: string) =>
      env.DB.prepare(
        `INSERT INTO builder_feedback (id, kind, message, status, organization_id, created_at) VALUES (?1, ?2, 'Picker', 'new', ?3, ?4)`,
      )
        .bind(id, kind, t.orgId, now)
        .run();
    await insert("bfb_pool_bug", "bug");
    await insert("bfb_pool_bug2", "bug");
    await insert("bfb_pool_feat", "feature");

    const bug = await assignIssue(DB(), "bfb_pool_bug", { embed, decide }, BUILDER_POOL);
    expect(bug?.created).toBe(true);
    expect(bug?.issueId).not.toBe(respondent?.issueId);

    const bug2 = await assignIssue(DB(), "bfb_pool_bug2", { embed, decide }, BUILDER_POOL);
    expect(bug2).toMatchObject({ created: false, issueId: bug?.issueId });

    const feat = await assignIssue(DB(), "bfb_pool_feat", { embed, decide }, BUILDER_POOL);
    expect(feat?.created).toBe(true);

    const pools = await env.DB.prepare(`SELECT id, pool FROM feedback_issues WHERE id IN (?1, ?2)`)
      .bind(respondent!.issueId, bug!.issueId)
      .all<{ id: string; pool: string }>();
    expect(Object.fromEntries((pools.results ?? []).map((r) => [r.id, r.pool]))).toEqual({
      [respondent!.issueId]: "respondent",
      [bug!.issueId]: "builder",
    });
  });
});
