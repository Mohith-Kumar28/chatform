import { describe, it, expect, beforeAll } from "vitest";
import { env } from "cloudflare:test";
import { applySchema, seedTenant, seedKey, fetchApi, type Tenant } from "./helpers.js";
import type { SessionDO } from "../src/do/session-do.js";
import { PLANS } from "@repo/entitlements";
import { invalidateEntitlements } from "../src/lib/entitlements.js";

/**
 * A sign-in gate that waits a few questions.
 *
 * `requireAuth` has always closed before the first question, and for most forms
 * that is right: an anonymous application is waste, so there is no point taking
 * one. It is wrong for a form whose job is to be experienced — a demo, a survey
 * on a marketing page — where a sign-in card at interaction zero is met by
 * someone who has not yet been asked anything and has no reason to pay it.
 *
 * `afterBlocks` moves when the gate closes, not what it means. The two things
 * worth pinning are that it does not disturb the old behaviour at 0, and that
 * the answers given before it are still there afterwards: a gate that lost them
 * would be the bad ordering `emitAuthRequired` was written to avoid, wearing a
 * different hat.
 */

let t: Tenant;
let key: string;

const blocks = [
  { id: "blk_dag00001", ref: "q_one", type: "short_text", title: "One?", required: true, minLength: 0, maxLength: 80 },
  { id: "blk_dag00002", ref: "q_two", type: "short_text", title: "Two?", required: true, minLength: 0, maxLength: 80 },
  { id: "blk_dag00003", ref: "q_three", type: "short_text", title: "Three?", required: true, minLength: 0, maxLength: 80 },
];

const docWith = (afterBlocks: number) => ({
  schemaVersion: 6,
  title: "Deferred gate",
  blocks,
  endings: [{ id: "end_dag00001", ref: "end_thanks", title: "Done", bodyMd: "Thanks." }],
  logic: [],
  endingRules: [],
  variables: [],
  hiddenFields: [],
  layout: {},
  // Template mode: no model call, so the turns are deterministic and the events
  // under test are the flow's own rather than a phrasing attempt's.
  settings: {
    agent: { mode: "template" },
    onComplete: { requireSubmit: false },
    requireAuth: { enabled: true, method: "google", afterBlocks },
  },
  theme: {},
});

const api = (path: string, init: RequestInit = {}) =>
  fetchApi(path, {
    ...init,
    headers: { "x-api-key": key, "content-type": "application/json", ...(init.headers as Record<string, string>) },
  });

interface TurnBody {
  accepted: boolean;
  question: { ref: string } | null;
  events: { type: string; data: Record<string, unknown> }[];
  answers: Record<string, unknown>;
}

const types = (b: TurnBody) => b.events.map((e) => e.type);

/** Republished per test, because `afterBlocks` is the variable under test. */
async function publish(afterBlocks: number): Promise<void> {
  const doc = JSON.stringify(docWith(afterBlocks));
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO form_versions (id, form_id, version, schema_json, checksum, published_at, created_by, created_at)
       VALUES ('ver_dag', ?1, 1, ?2, 'ck', ?3, ?4, ?3)
       ON CONFLICT (id) DO UPDATE SET schema_json = excluded.schema_json`,
    ).bind(t.formId, doc, now, t.userId),
    env.DB.prepare(
      `UPDATE forms SET status = 'published', working_schema = ?1, active_version_id = 'ver_dag' WHERE id = ?2`,
    ).bind(doc, t.formId),
  ]);
}

const open = async (): Promise<string> =>
  ((await (await api(`/v1/forms/${t.formId}/sessions`, { method: "POST", body: "{}" })).json()) as {
    sessionId: string;
  }).sessionId;

const answer = async (sessionId: string, ref: string, value: unknown): Promise<TurnBody> =>
  (await (
    await api(`/v1/sessions/${sessionId}/messages`, {
      method: "POST",
      body: JSON.stringify({ type: "structured", ref, value }),
    })
  ).json()) as TurnBody;

const stubFor = (sid: string) =>
  env.SESSION_DO.get(env.SESSION_DO.idFromName(sid)) as unknown as DurableObjectStub<SessionDO>;

/**
 * Attached directly rather than through a minted Google credential: the token
 * verification is `respondent-auth.test.ts`'s subject, and what is under test
 * here is only what the conversation does once an identity exists.
 */
const signIn = (sid: string) =>
  stubFor(sid).attachIdentity({
    provider: "google",
    subject: "google-sub-deferred",
    email: "maya@northwind.example",
    phone: null,
    name: "Maya",
    pictureUrl: null,
    verifiedAt: Date.now(),
  });

beforeAll(async () => {
  await applySchema();
  t = await seedTenant("defergate");
  // A paid plan: `requireAuth` is plan-gated, and a gate `clampForRuntime` had
  // switched off would make every one of these pass for no reason.
  await env.DB.prepare(
    `INSERT INTO plans (id, slug, name, price_monthly_cents, price_yearly_cents, currency, features_json, limits_json, is_active, sort_order)
     VALUES ('business', 'business', 'Business', ?1, ?2, 'USD', ?3, ?4, 1, 2) ON CONFLICT (id) DO NOTHING`,
  )
    .bind(
      PLANS.business.priceMonthlyCents,
      PLANS.business.priceYearlyCents,
      JSON.stringify(PLANS.business.features),
      JSON.stringify(PLANS.business.limits),
    )
    .run();
  await env.DB.prepare(
    `INSERT INTO subscriptions (id, organization_id, plan_id, dodo_subscription_id, cycle, status,
                                current_period_start, current_period_end, seats, created_at, updated_at)
     VALUES (?1, ?2, 'business', ?3, 'monthly', 'active', ?4, ?5, 1, ?6, ?6)`,
  )
    .bind(`sub_dag_${t.orgId}`, t.orgId, `dodo_dag_${t.orgId}`, Date.now() - 1000, Date.now() + 86_400_000 * 20, Date.now())
    .run();
  await invalidateEntitlements(env as never, t.orgId);
  key = (await seedKey(t, "defergatekey")).raw;
});

describe("a gate that waits", () => {
  it("asks the first questions without asking who they are", async () => {
    await publish(2);
    const sid = await open();

    const status = await stubFor(sid).getStatus();
    expect(status?.currentRef).toBe("q_one");

    const first = await answer(sid, "q_one", "alpha");
    expect(types(first)).not.toContain("auth_required");
    expect(first.question?.ref).toBe("q_two");
  });

  it("closes before the question that would take them past the count", async () => {
    await publish(2);
    const sid = await open();
    await answer(sid, "q_one", "alpha");

    const second = await answer(sid, "q_two", "beta");
    // The gate is the last thing in the transcript, and q_three was never put
    // to them — asking it and then refusing the answer is the ordering this
    // whole feature exists to avoid.
    expect(types(second)).toContain("auth_required");
    expect(second.question).toBeNull();
  });

  it("keeps what they already said", async () => {
    await publish(2);
    const sid = await open();
    await answer(sid, "q_one", "alpha");
    await answer(sid, "q_two", "beta");

    const status = await stubFor(sid).getStatus();
    expect(status?.answers).toMatchObject({ q_one: "alpha", q_two: "beta" });
    expect(status?.collected).toBe(2);
  });

  it("carries on at the interrupted question once they sign in", async () => {
    await publish(2);
    const sid = await open();
    await answer(sid, "q_one", "alpha");
    await answer(sid, "q_two", "beta");

    expect((await signIn(sid)).accepted).toBe(true);

    const status = await stubFor(sid).getStatus();
    expect(status?.currentRef).toBe("q_three");
    // Not rewound: the two answers survived the round trip through sign-in.
    expect(status?.answers).toMatchObject({ q_one: "alpha", q_two: "beta" });

    const { events } = await stubFor(sid).eventsSince(0);
    expect(events.filter((e) => e.type === "question").at(-1)?.data).toMatchObject({
      block: { ref: "q_three" },
    });
  });

  it("finishes the form after the gate has been cleared", async () => {
    await publish(2);
    const sid = await open();
    await answer(sid, "q_one", "alpha");
    await answer(sid, "q_two", "beta");
    await signIn(sid);

    const last = await answer(sid, "q_three", "gamma");
    expect(types(last)).toContain("ending");
    expect(last.answers).toMatchObject({ q_one: "alpha", q_two: "beta", q_three: "gamma" });
  });

  it("still refuses a turn sent past a gate the client ignored", async () => {
    await publish(2);
    const sid = await open();
    await answer(sid, "q_one", "alpha");
    await answer(sid, "q_two", "beta");

    // The four older `authGateBlocks` call sites are the belt to the advance
    // path's braces: a client that never rendered the card gets nowhere.
    const res = await api(`/v1/sessions/${sid}/messages`, {
      method: "POST",
      body: JSON.stringify({ type: "structured", ref: "q_three", value: "gamma" }),
    });
    expect(res.status).toBe(400);
  });
});

describe("zero is the behaviour it always had", () => {
  it("closes the gate before the first question", async () => {
    await publish(0);
    const sid = await open();

    const status = await stubFor(sid).getStatus();
    // Nothing asked yet: the gate outranks the flow, so there is no cursor.
    expect(status?.currentRef).toBeNull();
    expect(status?.collected).toBe(0);

    const { events } = await stubFor(sid).eventsSince(0);
    expect(events.map((e) => e.type)).toContain("auth_required");
    expect(events.map((e) => e.type)).not.toContain("question");
  });

  it("starts at the first question once they sign in", async () => {
    await publish(0);
    const sid = await open();
    expect((await signIn(sid)).accepted).toBe(true);

    const status = await stubFor(sid).getStatus();
    expect(status?.currentRef).toBe("q_one");
  });
});
