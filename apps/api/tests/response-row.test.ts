import { describe, it, beforeAll, expect } from "vitest";
import { env } from "cloudflare:test";
import { applySchema, seedTenant, seedKey, fetchApi, type Tenant } from "./helpers.js";
let t: Tenant;
let key: string;

/** As plain as a form gets: one question, no branching, no explicit submit. */
const DOC = {
  schemaVersion: 4, title: "Plain",
  blocks: [{ id: "blk_pl_em001", ref: "q_email", type: "email", title: "Email?", required: true }],
  endings: [{ id: "end_pl00001", ref: "end_thanks", title: "Thanks" }],
  logic: [], endingRules: [], variables: [], hiddenFields: [], layout: {},
  settings: { agent: { mode: "template" }, onComplete: { requireSubmit: false } }, theme: {},
};
async function subscribePro(orgId: string) {
  const { PLANS } = await import("@repo/entitlements");
  const { invalidateEntitlements } = await import("../src/lib/entitlements.js");
  await env.DB.prepare(`INSERT INTO plans (id, slug, name, price_monthly_cents, price_yearly_cents, currency, features_json, limits_json, is_active, sort_order) VALUES ('pro','pro','Pro',?,?,'USD',?,?,1,1) ON CONFLICT (id) DO NOTHING`).bind(PLANS.pro.priceMonthlyCents, PLANS.pro.priceYearlyCents, JSON.stringify(PLANS.pro.features), JSON.stringify(PLANS.pro.limits)).run();
  await env.DB.prepare(`INSERT INTO subscriptions (id, organization_id, plan_id, dodo_subscription_id, cycle, status, current_period_start, current_period_end, seats, created_at, updated_at) VALUES (?,?,'pro',?,'monthly','active',?,?,1,?,?) ON CONFLICT (dodo_subscription_id) DO NOTHING`).bind(`sub_p_${orgId}`, orgId, `dodo_p_${orgId}`, Date.now()-1000, Date.now()+8e8, Date.now(), Date.now()).run();
  await invalidateEntitlements(env as never, orgId);
}
const api = (p: string, i: RequestInit = {}) => fetchApi(p, { ...i, headers: { "x-api-key": key, "content-type": "application/json" } });
beforeAll(async () => {
  await applySchema(); t = await seedTenant("dbgplain"); await subscribePro(t.orgId); key = (await seedKey(t, "dbgplainkey")).raw;
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO form_versions (id, form_id, version, schema_json, checksum, published_at, created_by, created_at) VALUES (?1,?2,1,?3,'ck',?4,?5,?4)`).bind("ver_dbgplain", t.formId, JSON.stringify(DOC), now, t.userId),
    env.DB.prepare(`UPDATE forms SET status='published', working_schema=?1, active_version_id=?2 WHERE id=?3`).bind(JSON.stringify(DOC), "ver_dbgplain", t.formId),
  ]);
});
describe("one response, one row", () => {
  /**
   * A turn that answers the last question also finishes the form, so the
   * answer projection (`ctx.waitUntil`) and `finalize` both reach
   * `ensureSubmissionRow` at once. Both used to miss the `submission_id`
   * storage key and both used to insert: one response became an `in_progress`
   * row holding every answer plus a `completed` row holding none — which is
   * what the results table then showed, on every single-question form and on
   * the last answer of every longer one.
   */
  it("does not open a second row when the answer and the completion race", async () => {
    const s = ((await (await api(`/v1/forms/${t.formId}/sessions`, { method: "POST", body: "{}" })).json()) as { sessionId: string }).sessionId;
    await api(`/v1/sessions/${s}/messages`, { method: "POST", body: JSON.stringify({ type: "structured", ref: "q_email", value: "a@b.co" }) });
    const rows = await env.DB.prepare(`SELECT id, status FROM submissions WHERE session_id=?`).bind(s).all<{ id: string; status: string }>();
    expect(rows.results).toHaveLength(1);
    expect(rows.results![0]!.status).toBe("completed");

    // And the answers are on the row that is actually served.
    const answers = await env.DB.prepare(
      `SELECT block_ref FROM submission_answers WHERE submission_id = ?`,
    )
      .bind(rows.results![0]!.id)
      .all<{ block_ref: string }>();
    expect(answers.results!.map((a) => a.block_ref)).toEqual(["q_email"]);
  });
});
