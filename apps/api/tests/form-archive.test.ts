import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import { env } from "cloudflare:test";
import { PLANS } from "@repo/entitlements";
import { applySchema, fetchApi, seedKey, seedTenant, type Tenant } from "./helpers.js";
import { invalidateEntitlements } from "../src/lib/entitlements.js";
import type { Bindings } from "../src/env.js";
import { ARCHIVE_RETENTION_MS, purgeDueForms, sweepPurgeNotices } from "../src/lib/form-archive.js";
import { formPurgeNoticeEmail } from "../src/lib/mail-templates.js";

/**
 * Deleting a form archives it: restorable for thirty days, warned about three days and
 * one day out, then deleted for good with everything it collected.
 */

const E = () => env as unknown as Bindings;
const DAY = 24 * 60 * 60 * 1000;
/** Inside the hour the warnings go out in. */
const NOTICE_HOUR = Date.UTC(2026, 9, 2, 3, 10);
let t: Tenant;
let jobs: { kind: string; [k: string]: unknown }[];

const as = (path: string, init: RequestInit = {}) =>
  fetchApi(path, { ...init, headers: { ...(init.headers ?? {}), cookie: t.cookie } });
const formRow = () =>
  E().DB.prepare(`SELECT status, deleted_at, purge_at, deleted_by, purge_notice FROM forms WHERE id = ?`)
    .bind(t.formId)
    .first<{ status: string; deleted_at: number | null; purge_at: number | null; deleted_by: string | null; purge_notice: string | null }>();

beforeAll(async () => {
  await applySchema();
  t = await seedTenant("archive");
});

beforeEach(async () => {
  await E().DB.prepare(
    `UPDATE forms SET deleted_at = NULL, purge_at = NULL, deleted_by = NULL, purge_notice = NULL, status = 'published' WHERE id = ?`,
  ).bind(t.formId).run();
  jobs = [];
  vi.spyOn(E().Q_EMAIL, "send").mockImplementation(async (j: unknown) => {
    jobs.push(j as { kind: string });
  });
});

afterEach(() => vi.restoreAllMocks());

describe("the Archive", () => {
  it("takes a deleted form, and lists it with when it goes for good", async () => {
    const before = Date.now();
    expect((await as(`/api/forms/${t.formId}`, { method: "DELETE" })).status).toBe(200);

    const row = await formRow();
    expect(row!.status).toBe("archived");
    expect(row!.deleted_by).toBe(t.userId);
    expect(row!.purge_at! - row!.deleted_at!).toBe(ARCHIVE_RETENTION_MS);
    expect(row!.deleted_at!).toBeGreaterThanOrEqual(before);

    const live = (await (await as(`/api/forms?ws=all`)).json()) as { id: string }[];
    expect(live.map((f) => f.id)).not.toContain(t.formId);
    const archived = (await (await as(`/api/archive/forms?ws=all`)).json()) as { id: string; purgeAt: number; archivedBy: string | null }[];
    expect(archived).toEqual([expect.objectContaining({ id: t.formId, purgeAt: row!.purge_at, archivedBy: "archive" })]);
  });

  it("restores it as a draft, never straight back to live", async () => {
    await as(`/api/forms/${t.formId}`, { method: "DELETE" });
    expect((await as(`/api/archive/forms/${t.formId}/restore`, { method: "POST" })).status).toBe(200);
    expect(await formRow()).toMatchObject({ status: "draft", deleted_at: null, purge_at: null, deleted_by: null });
    // Already restored: nothing left to restore.
    expect((await as(`/api/archive/forms/${t.formId}/restore`, { method: "POST" })).status).toBe(404);
  });

  it("will not restore a live form, or one another organization archived", async () => {
    expect((await as(`/api/archive/forms/${t.formId}/restore`, { method: "POST" })).status).toBe(404);
    const other = await seedTenant("archiveother");
    await fetchApi(`/api/forms/${other.formId}`, { method: "DELETE", headers: { cookie: other.cookie } });
    expect((await as(`/api/archive/forms/${other.formId}/restore`, { method: "POST" })).status).toBe(404);
    expect((await as(`/api/archive/forms/${other.formId}`, { method: "DELETE" })).status).toBe(404);
  });

  it("works the same over the API", async () => {
    // The API is a paid feature.
    await E().DB.batch([
      E().DB.prepare(
        `INSERT INTO plans (id, slug, name, price_monthly_cents, price_yearly_cents, currency, features_json, limits_json, is_active, sort_order)
         VALUES ('pro', 'pro', 'Pro', ?, ?, 'USD', ?, ?, 1, 1) ON CONFLICT (id) DO NOTHING`,
      ).bind(PLANS.pro.priceMonthlyCents, PLANS.pro.priceYearlyCents, JSON.stringify(PLANS.pro.features), JSON.stringify(PLANS.pro.limits)),
      E().DB.prepare(
        `INSERT INTO subscriptions (id, organization_id, plan_id, dodo_subscription_id, cycle, status,
                                    current_period_start, current_period_end, seats, created_at, updated_at)
         VALUES ('sub_archive', ?, 'pro', 'dodo_archive', 'monthly', 'active', ?, ?, 1, ?, ?) ON CONFLICT (dodo_subscription_id) DO NOTHING`,
      ).bind(t.orgId, Date.now() - 1000, Date.now() + 20 * DAY, Date.now(), Date.now()),
    ]);
    await invalidateEntitlements(E(), t.orgId);
    const key = (await seedKey(t, "archivekey", { scopes: { form: ["read", "write"] } })).raw;
    const auth = { "x-api-key": key };
    expect((await fetchApi(`/v1/forms/${t.formId}`, { method: "DELETE", headers: auth })).status).toBe(200);
    const listed = (await (await fetchApi(`/v1/archive/forms`, { headers: auth })).json()) as { data: { id: string }[] };
    expect(listed.data.map((f) => f.id)).toContain(t.formId);
    expect((await fetchApi(`/v1/archive/forms/${t.formId}/restore`, { method: "POST", headers: auth })).status).toBe(200);
    expect((await formRow())!.status).toBe("draft");
  });
});

describe("the warnings", () => {
  async function archiveWithPurgeIn(ms: number) {
    await E().DB.prepare(`UPDATE forms SET deleted_at = ?, purge_at = ?, deleted_by = ?, status = 'archived' WHERE id = ?`)
      .bind(NOTICE_HOUR - DAY, NOTICE_HOUR + ms, t.userId, t.formId)
      .run();
  }
  const notices = () => jobs.filter((j) => j.kind === "form_purge_notice");

  it("sends the three-day warning once, then the one-day warning once", async () => {
    await archiveWithPurgeIn(3 * DAY - 60_000);
    await sweepPurgeNotices(E(), NOTICE_HOUR);
    await sweepPurgeNotices(E(), NOTICE_HOUR + 5 * 60_000);
    expect(notices()).toEqual([expect.objectContaining({ stage: "3d", userId: t.userId, formIds: [t.formId] })]);

    await sweepPurgeNotices(E(), NOTICE_HOUR + 2 * DAY);
    await sweepPurgeNotices(E(), NOTICE_HOUR + 2 * DAY + 5 * 60_000);
    expect(notices().map((j) => j.stage)).toEqual(["3d", "1d"]);
  });

  it("says nothing outside the morning hour, or while the purge is further off", async () => {
    await archiveWithPurgeIn(3 * DAY - 60_000);
    await sweepPurgeNotices(E(), NOTICE_HOUR + 2 * 60 * 60_000);
    expect(notices()).toHaveLength(0);
    await archiveWithPurgeIn(10 * DAY);
    await sweepPurgeNotices(E(), NOTICE_HOUR);
    expect(notices()).toHaveLength(0);
  });

  it("names the form, what it holds and the date", () => {
    const purgeAt = Date.UTC(2026, 9, 5);
    const msg = formPurgeNoticeEmail({
      organizationName: "Acme",
      recipientName: "Ada Lovelace",
      stage: "3d",
      forms: [{ title: "Hiring form", responses: 212, partials: 9, conversations: 300, uploads: 4, archivedAt: purgeAt - 27 * DAY, purgeAt }],
      archiveUrl: "https://chatform.in/dashboard?view=archive",
    });
    expect(msg.subject).toBe("“Hiring form” will be deleted on 5 Oct 2026");
    expect(msg.text).toContain("212 responses");
    expect(msg.html).toContain("Restore form");
    expect(msg.html + msg.text).not.toContain("—");
  });
});

describe("the purge", () => {
  it("deletes a due form with its responses and uploads, and leaves a restorable one alone", async () => {
    const now = Date.now();
    await E().DB.batch([
      E().DB.prepare(
        `INSERT INTO submissions (id, form_id, organization_id, status, source, is_test, started_at, completed_at)
         VALUES ('sub_archive', ?, ?, 'completed', 'chat', 0, ?, ?)`,
      ).bind(t.formId, t.orgId, now, now),
      E().DB.prepare(
        `INSERT INTO files (id, organization_id, form_id, r2_key, filename, mime, size_bytes, status, created_at)
         VALUES ('fil_archive', ?, ?, 'uploads/archive.png', 'f.png', 'image/png', 3, 'confirmed', ?)`,
      ).bind(t.orgId, t.formId, now),
    ]);
    await E().R2.put("uploads/archive.png", "png");

    await as(`/api/forms/${t.formId}`, { method: "DELETE" });
    expect(await purgeDueForms(E(), now)).toBe(0);
    expect(await formRow()).not.toBeNull();

    expect((await as(`/api/archive/forms/${t.formId}`, { method: "DELETE" })).status).toBe(200);
    const archived = (await (await as(`/api/archive/forms?ws=all`)).json()) as { id: string }[];
    expect(archived.map((f) => f.id)).not.toContain(t.formId);

    expect(await purgeDueForms(E(), Date.now() + 1)).toBe(1);
    expect(await formRow()).toBeNull();
    expect(await E().DB.prepare(`SELECT COUNT(*) n FROM submissions WHERE form_id = ?`).bind(t.formId).first("n")).toBe(0);
    expect(await E().DB.prepare(`SELECT COUNT(*) n FROM files WHERE form_id = ?`).bind(t.formId).first("n")).toBe(0);
    expect(await E().R2.get("uploads/archive.png")).toBeNull();
  });
});
