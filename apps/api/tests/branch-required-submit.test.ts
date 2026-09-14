import { describe, it, expect, beforeAll } from "vitest";
import { env } from "cloudflare:test";
import { applySchema, seedTenant, seedKey, fetchApi, type Tenant } from "./helpers.js";

/**
 * A branching form, submitted from the branch the respondent actually took.
 *
 * The bug this pins, reported from a live registration form: the respondent
 * answered every question the conversation asked, reached the review card, and
 * pressed "Submit now" — into nothing. The countdown ran out, the button came
 * back, and the form could not be filed at all.
 *
 * `unansweredRequired` in the session object read "required" off `doc.blocks`
 * and narrowed it by `block.visibility` alone. Branching is not expressed as
 * visibility — a `goto` routes the flow *around* a question without touching
 * it — so every required question in every other arm counted as missing, and
 * `submit` refused, forever. A form with a required question in any branch was
 * unsubmittable by anyone who took a different branch.
 *
 * Shaped after the form it was found on: one question chooses an arm, each arm
 * holds a required question of its own, and the arms rejoin a shared trunk.
 * Driven over `/v1` in template mode, so no model is in the loop and every
 * transition is the state machine's own.
 */

let t: Tenant;
let key: string;

/** `requireSubmit` is ON — the review step is where the refusal happened. */
const DOC = {
  schemaVersion: 4,
  title: "Open mic registration",
  blocks: [
    {
      id: "blk_br_role01",
      ref: "q_role",
      type: "single_select",
      title: "Are you performing or watching?",
      required: true,
      options: [
        { id: "opt_music", label: "Music" },
        { id: "opt_comedy", label: "Comedy" },
      ],
    },
    // The arm taken. Required, and answered.
    { id: "blk_br_inst01", ref: "q_instrument", type: "short_text", title: "Which instrument?", required: true, minLength: 0, maxLength: 200 },
    // The arm NOT taken. Required, never asked — and the whole bug.
    { id: "blk_br_set001", ref: "q_set_format", type: "short_text", title: "What is the format of your set?", required: true, minLength: 0, maxLength: 200 },
    // Shared trunk, reached from either arm.
    { id: "blk_br_tech01", ref: "q_tech", type: "short_text", title: "What tech do you need?", required: true, minLength: 0, maxLength: 200 },
    { id: "blk_br_note01", ref: "q_notes", type: "long_text", title: "Anything else?", required: false, minLength: 0, maxLength: 500 },
  ],
  endings: [{ id: "end_br_ok001", ref: "end_thanks", title: "You're registered", bodyMd: "See you Friday." }],
  logic: [
    {
      id: "rl_br_music1",
      action_kind: "goto",
      from: "q_role",
      when: { op: "and", conditions: [{ left: { kind: "ref", ref: "q_role" }, op: "eq", value: "opt_music" }], groups: [] },
      target: "q_instrument",
      targetKind: "block",
    },
    {
      id: "rl_br_comedy",
      action_kind: "goto",
      from: "q_role",
      when: { op: "and", conditions: [{ left: { kind: "ref", ref: "q_role" }, op: "eq", value: "opt_comedy" }], groups: [] },
      target: "q_set_format",
      targetKind: "block",
    },
    // The music arm closes so it does not spill into the comedy arm.
    {
      id: "rl_br_join01",
      action_kind: "goto",
      from: "q_instrument",
      when: { op: "and", conditions: [], groups: [] },
      target: "q_tech",
      targetKind: "block",
    },
  ],
  endingRules: [],
  variables: [],
  hiddenFields: [],
  layout: {},
  settings: { agent: { mode: "template" }, onComplete: { requireSubmit: true } },
  theme: {},
};

/** `/v1` is a Pro feature, and this test drives the conversation over it. */
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
    .bind(`sub_br_${orgId}`, orgId, `dodo_br_${orgId}`, Date.now() - 1000, Date.now() + 86_400_000 * 20, Date.now(), Date.now())
    .run();
  await invalidateEntitlements(env as never, orgId);
}

const api = (path: string, init: RequestInit = {}) =>
  fetchApi(path, {
    ...init,
    headers: { "x-api-key": key, "content-type": "application/json", ...(init.headers as Record<string, string>) },
  });

interface Progress {
  answered: number;
  totalEstimate: number;
  pct: number;
}

interface TurnResult {
  accepted: boolean;
  complete: boolean;
  awaitingSubmit: boolean;
  question: { ref: string } | null;
  ending: { ref: string; kind?: string; title: string } | null;
  events: { type: string; data?: { block?: { ref: string }; progress?: Progress } }[];
  validation: { ref: string; code: string } | null;
}

/** The progress the runtime put on the `question` event this turn ended on. */
const progressOn = (turn: TurnResult): Progress | undefined =>
  turn.events.filter((e) => e.type === "question").at(-1)?.data?.progress;

const open = async (): Promise<string> => {
  const res = await api(`/v1/forms/${t.formId}/sessions`, { method: "POST", body: "{}" });
  return ((await res.json()) as { sessionId: string }).sessionId;
};

const answer = (sessionId: string, ref: string, value: unknown): Promise<TurnResult> =>
  api(`/v1/sessions/${sessionId}/messages`, {
    method: "POST",
    body: JSON.stringify({ type: "structured", ref, value }),
  }).then((r) => r.json() as Promise<TurnResult>);

const act = (sessionId: string, action: string, ref?: string): Promise<TurnResult> =>
  api(`/v1/sessions/${sessionId}/actions`, {
    method: "POST",
    body: JSON.stringify(ref ? { action, ref } : { action }),
  }).then((r) => r.json() as Promise<TurnResult>);

const rowFor = (sessionId: string) =>
  env.DB.prepare(`SELECT status, completed_at FROM submissions WHERE session_id = ?`)
    .bind(sessionId)
    .first<{ status: string; completed_at: number | null }>();

/** Walk the music arm to the review step, leaving the comedy arm untouched. */
async function throughTheMusicArm(): Promise<string> {
  const s = await open();
  await answer(s, "q_role", "opt_music");
  await answer(s, "q_instrument", "a classical guitar");
  await answer(s, "q_tech", "a vocal mic and a music stand");
  await act(s, "skip"); // q_notes is optional
  return s;
}

beforeAll(async () => {
  await applySchema();
  t = await seedTenant("branchreq");
  await subscribePro(t.orgId);
  key = (
    await seedKey(t, "branchreqkey", {
      scopes: { form: ["read"], response: ["read", "write"], session: ["create", "write", "read"] },
    })
  ).raw;
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO form_versions (id, form_id, version, schema_json, checksum, published_at, created_by, created_at)
       VALUES (?1, ?2, 1, ?3, 'ck', ?4, ?5, ?4) ON CONFLICT (id) DO NOTHING`,
    ).bind("ver_branchreq", t.formId, JSON.stringify(DOC), now, t.userId),
    env.DB.prepare(
      `UPDATE forms SET status = 'published', working_schema = ?1, active_version_id = ?2 WHERE id = ?3`,
    ).bind(JSON.stringify(DOC), "ver_branchreq", t.formId),
  ]);
});

describe("a respondent who took one arm of a branch", () => {
  it("is never asked the other arm's question", async () => {
    const s = await open();
    await answer(s, "q_role", "opt_music");
    const turn = await answer(s, "q_instrument", "a classical guitar");
    expect(turn.question?.ref).toBe("q_tech");
  });

  it("reaches the review step with the other arm still blank", async () => {
    const s = await throughTheMusicArm();
    const state = (await (await api(`/v1/sessions/${s}`)).json()) as TurnResult;
    expect(state.awaitingSubmit).toBe(true);
  });

  it("submits", async () => {
    // The whole bug in one assertion: this used to come back parked on
    // `q_set_format` — a question from the comedy arm that was never asked —
    // and pressing submit again did exactly the same thing.
    const s = await throughTheMusicArm();
    const turn = await act(s, "submit");

    expect(turn.accepted).toBe(true);
    expect(turn.complete).toBe(true);
    expect(turn.ending?.ref).toBe("end_thanks");
    expect(turn.question).toBeNull();
  });

  it("is recorded as a completion, not left in progress", async () => {
    const s = await throughTheMusicArm();
    await act(s, "submit");

    const row = await rowFor(s);
    expect(row?.status).toBe("completed");
    expect(row?.completed_at).toBeTruthy();
  });
});

/**
 * The check narrows to the live path; it does not go away.
 *
 * Asserted against the rule itself rather than through a session, because
 * there is no legitimate way to drive a conversation to the review step with a
 * required question on its own path still blank — `skip` refuses one, and the
 * flow cannot walk past one. That is what makes the check a floor rather than
 * a step, and it is why it has to be tested from underneath.
 */
describe("a required question on the path the respondent is actually on", () => {
  it("is still reported as missing", async () => {
    const { readFormDoc, unsatisfiedRequired } = await import("@repo/form-schema");
    const doc = readFormDoc(DOC);

    // The music arm, one trunk answer short.
    expect(unsatisfiedRequired(doc, { q_role: "opt_music", q_instrument: "guitar" } as never).map((m) => m.ref)).toEqual([
      "q_tech",
    ]);

    // And the same arm, complete: the comedy arm's required question is blank
    // in both, and is nobody's missing answer in either.
    expect(
      unsatisfiedRequired(doc, { q_role: "opt_music", q_instrument: "guitar", q_tech: "a mic" } as never),
    ).toEqual([]);
  });
});

/**
 * The bar the respondent watches while they answer.
 *
 * Same root cause as the submit refusal, same fix: the denominator was every
 * answerable block in the document, and a `goto` routes the respondent around
 * most of them. This form has five questions and a four-question path down
 * either arm, so the old numbers read "Question 2 of 5" where the respondent
 * was on question 2 of 4 — and on the live form it was 8 of 14, a bar stuck at
 * 50% with nothing left to answer.
 */
describe("progress, on the path the respondent is on", () => {
  it("counts the arm they took, not the whole form", async () => {
    const s = await open();
    await answer(s, "q_role", "opt_music");
    const turn = await answer(s, "q_instrument", "a classical guitar");

    // q_role, q_instrument, q_tech, q_notes — never q_set_format.
    expect(progressOn(turn)).toEqual({ answered: 2, totalEstimate: 4, pct: 50 });
  });

  it("has nothing left to ask by the time the review card is up", async () => {
    const s = await throughTheMusicArm();
    const state = (await (await api(`/v1/sessions/${s}`)).json()) as { answers: Record<string, unknown> };
    // Three answers and a skip, against a four-question path: the last question
    // was reached, so there is nothing ahead of them.
    const { progressOf, readFormDoc } = await import("@repo/form-schema");
    const p = progressOf(readFormDoc(DOC), state.answers as never);
    expect(p.totalEstimate).toBe(4);
    expect(p.answered).toBe(3);
  });

  it("agrees with what the engine reports for the same answers", async () => {
    // The runtime and `/v1` used to compute this two different ways. They now
    // call one function, and this is the assertion that keeps them together.
    const { progressOf, readFormDoc } = await import("@repo/form-schema");
    const s = await open();
    await answer(s, "q_role", "opt_comedy");
    const turn = await answer(s, "q_set_format", "ten minutes of crowd work");

    expect(progressOn(turn)).toEqual(
      progressOf(readFormDoc(DOC), { q_role: "opt_comedy", q_set_format: "ten minutes of crowd work" } as never),
    );
  });
});

describe("the other arm, taken", () => {
  it("submits too, with the first arm's required question blank", async () => {
    const s = await open();
    await answer(s, "q_role", "opt_comedy");
    await answer(s, "q_set_format", "ten minutes of crowd work");
    await answer(s, "q_tech", "one mic");
    await act(s, "skip");
    const turn = await act(s, "submit");

    expect(turn.complete).toBe(true);
    expect(turn.ending?.ref).toBe("end_thanks");
  });
});
