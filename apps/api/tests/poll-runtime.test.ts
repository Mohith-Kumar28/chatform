import { describe, it, expect, beforeAll } from "vitest";
import { env } from "cloudflare:test";
import { applySchema, seedTenant, seedKey, fetchApi, type Tenant } from "./helpers.js";
import { readPollTally } from "../src/lib/poll-tallies.js";

/**
 * A poll answered the way a respondent answers one.
 *
 * The arithmetic has its own file; this is about the half that only exists
 * once a session is running: that answering a poll counts the vote, that the
 * split comes back on the same turn rather than a beat later, that changing an
 * answer moves the bar instead of adding to it, and that the reveal floor
 * actually holds the numbers back.
 *
 * Driven over `/v1` in template mode, so there is no model in the loop.
 */

let t: Tenant;
let key: string;

const poll = (ref: string, extra: Record<string, unknown> = {}) => ({
  id: `blk_${ref.slice(0, 9)}`,
  ref,
  type: "poll",
  title: "Which do you reach for?",
  required: true,
  options: [
    { id: "opt_react0001", label: "React", image_key: null },
    { id: "opt_svelte001", label: "Svelte", image_key: null },
    { id: "opt_vue000001", label: "Vue", image_key: null },
  ],
  showResults: true,
  minResponsesToReveal: 1,
  ...extra,
});

const DOC = {
  schemaVersion: 4,
  title: "Poll runtime",
  blocks: [
    poll("q_stack"),
    // The same block with the floor raised, so one document covers both the
    // revealed and the held-back case without a second form.
    poll("q_secret", { minResponsesToReveal: 50 }),
    // And one that collects the answer and shows nobody, which is what
    // `showResults: false` is for.
    poll("q_quiet", { showResults: false }),
  ],
  endings: [{ id: "end_poll0001", ref: "end_thanks", title: "Done", bodyMd: "" }],
  logic: [],
  endingRules: [],
  variables: [],
  hiddenFields: [],
  layout: {},
  settings: { agent: { mode: "template" }, onComplete: { requireSubmit: true } },
  theme: {},
};

/** `/v1` sessions are a paid capability, so the tenant needs a plan before it can drive one. */
async function subscribePro(orgId: string): Promise<void> {
  const { PLANS } = await import("@repo/entitlements");
  const { invalidateEntitlements } = await import("../src/lib/entitlements.js");
  await env.DB.prepare(
    `INSERT INTO plans (id, slug, name, price_monthly_cents, price_yearly_cents, currency, features_json, limits_json, is_active, sort_order)
     VALUES ('pro', 'pro', 'Pro', ?, ?, 'USD', ?, ?, 1, 1) ON CONFLICT (id) DO NOTHING`,
  )
    .bind(PLANS.pro.priceMonthlyCents, PLANS.pro.priceYearlyCents, JSON.stringify(PLANS.pro.features), JSON.stringify(PLANS.pro.limits))
    .run();
  await env.DB.prepare(
    `INSERT INTO subscriptions (id, organization_id, plan_id, dodo_subscription_id, cycle, status,
                                current_period_start, current_period_end, seats, created_at, updated_at)
     VALUES (?, ?, 'pro', ?, 'monthly', 'active', ?, ?, 1, ?, ?) ON CONFLICT (dodo_subscription_id) DO NOTHING`,
  )
    .bind(`sub_pollrt_${orgId}`, orgId, `dodo_pollrt_${orgId}`, Date.now() - 1000, Date.now() + 86_400_000 * 20, Date.now(), Date.now())
    .run();
  await invalidateEntitlements(env as never, orgId);
}

const api = (path: string, init: RequestInit = {}) =>
  fetchApi(path, {
    ...init,
    headers: { "x-api-key": key, "content-type": "application/json", ...(init.headers as Record<string, string>) },
  });

interface TurnResult {
  accepted: boolean;
  events: { type: string; data?: Record<string, unknown> }[];
}

const open = async (): Promise<string> => {
  const res = await api(`/v1/forms/${t.formId}/sessions`, { method: "POST", body: "{}" });
  return ((await res.json()) as { sessionId: string }).sessionId;
};

const answer = async (sessionId: string, ref: string, value: unknown): Promise<TurnResult> => {
  const res = await api(`/v1/sessions/${sessionId}/messages`, {
    method: "POST",
    body: JSON.stringify({ type: "structured", ref, value }),
  });
  return (await res.json()) as TurnResult;
};

const act = async (sessionId: string, action: string, ref?: string): Promise<TurnResult> => {
  const res = await api(`/v1/sessions/${sessionId}/actions`, {
    method: "POST",
    body: JSON.stringify(ref ? { action, ref } : { action }),
  });
  return (await res.json()) as TurnResult;
};

const pollEvent = (turn: TurnResult) => turn.events.find((e) => e.type === "poll_result")?.data;

beforeAll(async () => {
  await applySchema();
  t = await seedTenant("pollrt");
  await subscribePro(t.orgId);
  key = (
    await seedKey(t, "pollrtkey", {
      scopes: { form: ["read"], response: ["read", "write"], session: ["create", "write", "read"] },
    })
  ).raw;
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO form_versions (id, form_id, version, schema_json, checksum, published_at, created_by, created_at)
       VALUES (?1, ?2, 1, ?3, 'ck', ?4, ?5, ?4) ON CONFLICT (id) DO NOTHING`,
    ).bind("ver_pollrt", t.formId, JSON.stringify(DOC), now, t.userId),
    env.DB.prepare(
      `UPDATE forms SET status = 'published', working_schema = ?1, active_version_id = ?2 WHERE id = ?3`,
    ).bind(JSON.stringify(DOC), "ver_pollrt", t.formId),
  ]);
});

describe("answering a poll", () => {
  it("counts the vote and hands back the split on the same turn", async () => {
    // The whole point of the block, and the reason the tally write is awaited
    // rather than backgrounded: a respondent who has just been promised a
    // number must not be shown a total that excludes their own answer.
    const s = await open();
    const turn = await answer(s, "q_stack", "opt_react0001");
    expect(turn.accepted).toBe(true);

    const data = pollEvent(turn);
    expect(data, "no poll_result on the turn that answered the poll").toBeDefined();
    expect(data!.picked).toBe("opt_react0001");
    expect(data!.total).toBe(1);

    const options = data!.options as { id: string; label: string; count: number }[];
    // Every option comes back, including the ones nobody picked: a bar chart
    // missing its empty bars reads as a different question.
    expect(options.map((o) => o.id)).toEqual(["opt_react0001", "opt_svelte001", "opt_vue000001"]);
    expect(options.find((o) => o.id === "opt_react0001")!.count).toBe(1);
    expect(options.find((o) => o.id === "opt_vue000001")!.count).toBe(0);
  });

  it("adds up across respondents", async () => {
    const before = (await readPollTally(env, t.formId, "q_stack")).total;
    const a = await open();
    await answer(a, "q_stack", "opt_svelte001");
    const b = await open();
    const turn = await answer(b, "q_stack", "opt_svelte001");
    expect(pollEvent(turn)!.total).toBe(before + 2);
    const tally = await readPollTally(env, t.formId, "q_stack");
    expect(tally.counts.opt_svelte001).toBeGreaterThanOrEqual(2);
  });

  it("moves the bar when somebody changes their mind", async () => {
    // Re-answering is the path that double-counted before the move became one
    // operation: the old option has to give the vote up. Driven through the
    // `edit` action because that is the pencil the respondent actually taps.
    const s = await open();
    await answer(s, "q_stack", "opt_vue000001");
    const before = await readPollTally(env, t.formId, "q_stack");
    await act(s, "edit", "q_stack");
    const turn = await answer(s, "q_stack", "opt_react0001");
    const after = await readPollTally(env, t.formId, "q_stack");

    expect(after.total).toBe(before.total);
    expect(after.counts.opt_vue000001 ?? 0).toBe((before.counts.opt_vue000001 ?? 0) - 1);
    expect(after.counts.opt_react0001 ?? 0).toBe((before.counts.opt_react0001 ?? 0) + 1);
    expect(pollEvent(turn)!.picked).toBe("opt_react0001");
  });

  it("holds the split back until the floor is reached", async () => {
    // The respondent is still told how many are ahead of them. Going quiet
    // here is what made an early poll look broken rather than private.
    // The questions are answered in order, so the session has to walk to it.
    const s = await open();
    await answer(s, "q_stack", "opt_react0001");
    const turn = await answer(s, "q_secret", "opt_react0001");
    const data = pollEvent(turn);
    expect(data).toBeDefined();
    expect(data!.total).toBeGreaterThanOrEqual(1);
    expect(data!.options, "the split leaked below its reveal floor").toBeUndefined();
  });

  it("says nothing at all when the author turned results off", async () => {
    const s = await open();
    await answer(s, "q_stack", "opt_react0001");
    await answer(s, "q_secret", "opt_react0001");
    const turn = await answer(s, "q_quiet", "opt_react0001");
    expect(pollEvent(turn), "a poll with showResults off still reported a split").toBeUndefined();
    // The vote is still counted: the author gets the answer in their results,
    // the respondent simply is not shown the room.
    expect((await readPollTally(env, t.formId, "q_quiet")).total).toBeGreaterThanOrEqual(1);
  });
});
