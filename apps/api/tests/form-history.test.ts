import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { applySchema, seedTenant, fetchApi, minimalDoc, type Tenant } from "./helpers.js";
import type { Bindings } from "../src/env.js";
import { invalidateEntitlements } from "../src/lib/entitlements.js";
import { PLANS } from "@repo/entitlements";

/**
 * The history feature end to end: a save produces a described change, a burst of saves
 * produces one entry rather than a dozen, a publish claims the entries it shipped, and
 * a restore puts a version back into the draft without putting it live.
 */

const DB = () => env as unknown as Bindings;
const auth = (t: Tenant) => ({ cookie: t.cookie, "content-type": "application/json" });

let org: Tenant;
let other: Tenant;

interface HistoryEntry {
  id: string;
  kind: string;
  summary: string;
  changes: { op: string; label: string; from?: string; to?: string }[];
  changeCount: number;
  actorLabel: string | null;
  source: string;
  createdAt: number;
}
interface HistoryGroup {
  version: number | null;
  versionId: string | null;
  isActive: boolean;
  note: string | null;
  entries: HistoryEntry[];
}

async function seedPlans(): Promise<void> {
  for (const plan of Object.values(PLANS)) {
    await DB()
      .DB.prepare(
        `INSERT INTO plans (id, slug, name, price_monthly_cents, price_yearly_cents, seat_price_cents,
                            currency, features_json, limits_json, is_active, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, 'USD', ?, ?, 1, ?)
         ON CONFLICT (id) DO UPDATE SET features_json = excluded.features_json`,
      )
      .bind(plan.id, plan.id, plan.name, plan.priceMonthlyCents, plan.priceYearlyCents, plan.seatPriceCents,
            JSON.stringify(plan.features), JSON.stringify(plan.limits), plan.sortOrder)
      .run();
  }
}

const doc = (t: Tenant) => structuredClone(minimalDoc(t.formId.replace("frm_", ""))) as ReturnType<typeof minimalDoc>;

async function save(t: Tenant, mutate: (d: ReturnType<typeof minimalDoc>) => void): Promise<Response> {
  const d = doc(t);
  mutate(d);
  return fetchApi(`/api/forms/${t.formId}/doc`, { method: "PUT", headers: auth(t), body: JSON.stringify({ doc: d }) });
}

async function history(t: Tenant): Promise<HistoryGroup[]> {
  const res = await fetchApi(`/api/forms/${t.formId}/history`, { headers: auth(t) });
  expect(res.status).toBe(200);
  return (await res.json<{ groups: HistoryGroup[] }>()).groups;
}

const publish = (t: Tenant, note?: string) =>
  fetchApi(`/api/forms/${t.formId}/publish`, {
    method: "POST",
    headers: auth(t),
    ...(note ? { body: JSON.stringify({ note }) } : {}),
  });

beforeAll(async () => {
  await applySchema();
  await seedPlans();
  org = await seedTenant("hist");
  other = await seedTenant("histb");
  await invalidateEntitlements(DB(), org.orgId);
});

beforeEach(async () => {
  await DB().DB.prepare(`DELETE FROM form_activity WHERE form_id = ?`).bind(org.formId).run();
  await DB().DB.prepare(`DELETE FROM form_versions WHERE form_id = ?`).bind(org.formId).run();
  await DB()
    .DB.prepare(`UPDATE forms SET working_schema = ?, status = 'draft', active_version_id = NULL WHERE id = ?`)
    .bind(JSON.stringify(minimalDoc("hist")), org.formId)
    .run();
});

describe("recording changes", () => {
  it("describes what a save did, not that a save happened", async () => {
    expect((await save(org, (d) => { d.blocks[1]!.title = "What's your work email?"; })).status).toBe(200);

    const groups = await history(org);
    const draft = groups[0]!;
    expect(draft.version).toBeNull();
    expect(draft.entries).toHaveLength(1);
    expect(draft.entries[0]!.summary).toContain("Reworded");
    expect(draft.entries[0]!.changes[0]).toMatchObject({ op: "question.renamed", to: "What's your work email?" });
  });

  it("attributes the change to the person who made it", async () => {
    await save(org, (d) => { d.title = "Renamed form"; });
    const entry = (await history(org))[0]!.entries[0]!;
    expect(entry.actorLabel).toBe("hist");
    expect(entry.source).toBe("builder");
  });

  it("records nothing for a save that changed nothing", async () => {
    expect((await save(org, () => {})).status).toBe(200);
    expect((await history(org))[0]!.entries).toHaveLength(0);
  });

  /** The whole reason this is not one row per request: autosave fires constantly. */
  it("folds a burst of autosaves into one entry", async () => {
    await save(org, (d) => { d.blocks[1]!.title = "A"; });
    await save(org, (d) => { d.blocks[1]!.title = "AB"; });
    await save(org, (d) => { d.blocks[1]!.title = "ABC"; d.blocks[0]!.title = "Hello there"; });

    const entries = (await history(org))[0]!.entries;
    expect(entries).toHaveLength(1);
    expect(entries[0]!.changeCount).toBe(2);
    // The endpoints of the walk, not each step of it.
    expect(entries[0]!.changes.find((c) => c.op === "question.renamed")).toMatchObject({ from: "Email?", to: "ABC" });
  });

  it("forgets a question that was added and deleted again in the same sitting", async () => {
    await save(org, (d) => {
      d.blocks.push({ id: "blk_temp01", ref: "q_temp", type: "short_text", title: "Temporary", required: false } as never);
    });
    expect((await history(org))[0]!.entries).toHaveLength(1);

    await save(org, () => {});
    expect((await history(org))[0]!.entries).toHaveLength(0);
  });
});

describe("grouping by publish", () => {
  it("claims the open entries for the version that shipped them", async () => {
    await save(org, (d) => { d.blocks[1]!.title = "Your email address"; });

    const res = await publish(org, "First real version");
    expect(res.status).toBe(200);
    expect(await res.json<{ version: number }>()).toMatchObject({ version: 1 });

    const groups = await history(org);
    expect(groups[0]!.version).toBeNull();
    expect(groups[0]!.entries).toHaveLength(0);

    const v1 = groups[1]!;
    expect(v1.version).toBe(1);
    expect(v1.isActive).toBe(true);
    expect(v1.note).toBe("First real version");
    // The edit, plus the publish event itself.
    expect(v1.entries.some((e) => e.kind === "edited")).toBe(true);
    expect(v1.entries.some((e) => e.kind === "published")).toBe(true);
  });

  it("puts work done after a publish back into the unpublished group", async () => {
    await save(org, (d) => { d.blocks[1]!.title = "One"; });
    await publish(org);
    await save(org, (d) => { d.blocks[1]!.title = "Two"; });

    const groups = await history(org);
    expect(groups[0]!.version).toBeNull();
    expect(groups[0]!.entries).toHaveLength(1);
    expect(groups[0]!.entries[0]!.changes[0]).toMatchObject({ from: "One", to: "Two" });
    expect(groups[1]!.version).toBe(1);
  });

  /**
   * The regression: stamping only filtered on edits, so a restore stayed in the
   * unpublished group after the publish that shipped it — permanently, since nothing
   * else would ever claim it.
   */
  it("claims a restore for the version that shipped it", async () => {
    await publish(org);
    await save(org, (d) => { d.blocks[1]!.title = "A regrettable edit"; });
    await publish(org);
    await fetchApi(`/api/forms/${org.formId}/versions/1/restore`, { method: "POST", headers: auth(org) });
    expect((await history(org))[0]!.entries.some((e) => e.kind === "restored")).toBe(true);

    await publish(org);
    const groups = await history(org);
    expect(groups[0]!.entries).toHaveLength(0);
    expect(groups[1]!.entries.some((e) => e.kind === "restored")).toBe(true);
  });

  it("publishing with nothing in the body is still a publish", async () => {
    expect((await publish(org)).status).toBe(200);
    expect((await history(org))[1]!.note).toBeNull();
  });
});

describe("versions", () => {
  it("lists versions with their author and response count", async () => {
    await save(org, (d) => { d.blocks[1]!.title = "v1 question"; });
    await publish(org, "one");
    await save(org, (d) => { d.blocks[1]!.title = "v2 question"; });
    await publish(org, "two");

    const list = await (await fetchApi(`/api/forms/${org.formId}/versions`, { headers: auth(org) })).json<
      { version: number; note: string | null; authorLabel: string | null; isActive: boolean; responses: number }[]
    >();
    expect(list.map((v) => v.version)).toEqual([2, 1]);
    expect(list[0]).toMatchObject({ note: "two", authorLabel: "hist", isActive: true, responses: 0 });
    expect(list[1]!.isActive).toBe(false);
  });

  it("diffs one version against another on request", async () => {
    await save(org, (d) => { d.blocks[1]!.title = "Before"; });
    await publish(org);
    await save(org, (d) => { d.blocks[1]!.title = "After"; });
    await publish(org);

    const res = await fetchApi(`/api/forms/${org.formId}/versions/2?compare=1`, { headers: auth(org) });
    const body = await res.json<{ comparedTo: number | null; changes: { op: string; from?: string; to?: string }[] }>();
    expect(body.comparedTo).toBe(1);
    expect(body.changes).toContainEqual(expect.objectContaining({ op: "question.renamed", from: "Before", to: "After" }));
  });

  it("returns the document alone when no comparison is asked for", async () => {
    await publish(org);
    const body = await (await fetchApi(`/api/forms/${org.formId}/versions/1`, { headers: auth(org) })).json<{
      doc: { blocks: unknown[] };
      changes: unknown[];
      comparedTo: number | null;
    }>();
    expect(body.doc.blocks).toHaveLength(2);
    expect(body.changes).toEqual([]);
    expect(body.comparedTo).toBeNull();
  });

  it("404s for a version that does not exist", async () => {
    expect((await fetchApi(`/api/forms/${org.formId}/versions/99`, { headers: auth(org) })).status).toBe(404);
  });
});

describe("restore", () => {
  it("puts a published version back into the draft without putting it live", async () => {
    await save(org, (d) => { d.blocks[1]!.title = "The original"; });
    await publish(org);
    await save(org, (d) => { d.blocks[1]!.title = "A regrettable edit"; });
    await publish(org);

    const before = await (await fetchApi(`/api/forms/${org.formId}`, { headers: auth(org) })).json<{ activeVersion: number }>();
    expect(before.activeVersion).toBe(2);

    const res = await fetchApi(`/api/forms/${org.formId}/versions/1/restore`, { method: "POST", headers: auth(org) });
    expect(res.status).toBe(200);
    expect((await res.json<{ summary: string }>()).summary).toContain("Restored version 1");

    const after = await (await fetchApi(`/api/forms/${org.formId}`, { headers: auth(org) })).json<{
      activeVersion: number;
      workingSchema: { blocks: { title: string }[] };
    }>();
    // The draft went back; what respondents are answering did not move.
    expect(after.workingSchema.blocks[1]!.title).toBe("The original");
    expect(after.activeVersion).toBe(2);
  });

  it("leaves a restore in the history as its own kind of event", async () => {
    await publish(org);
    await save(org, (d) => { d.blocks[1]!.title = "Changed"; });
    await fetchApi(`/api/forms/${org.formId}/versions/1/restore`, { method: "POST", headers: auth(org) });

    const draft = (await history(org))[0]!;
    expect(draft.entries.some((e) => e.kind === "restored")).toBe(true);
  });

  it("writes the restore to the organization's audit log too", async () => {
    await publish(org);
    await fetchApi(`/api/forms/${org.formId}/versions/1/restore`, { method: "POST", headers: auth(org) });
    const row = await DB()
      .DB.prepare(`SELECT action, resource_id FROM audit_logs WHERE organization_id = ? AND action = 'form.restored'`)
      .bind(org.orgId)
      .first<{ action: string; resource_id: string }>();
    expect(row?.resource_id).toBe(org.formId);
  });
});

describe("tenancy", () => {
  it("does not show one organization another's history", async () => {
    await save(org, (d) => { d.blocks[1]!.title = "Private"; });
    for (const path of [`/api/forms/${org.formId}/history`, `/api/forms/${org.formId}/versions`]) {
      expect((await fetchApi(path, { headers: auth(other) })).status).toBe(404);
    }
    expect(
      (await fetchApi(`/api/forms/${org.formId}/versions/1/restore`, { method: "POST", headers: auth(other) })).status,
    ).toBe(404);
  });

  it("refuses an anonymous reader", async () => {
    expect((await fetchApi(`/api/forms/${org.formId}/history`)).status).toBe(401);
  });
});
