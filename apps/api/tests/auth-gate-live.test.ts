import { describe, it, expect, beforeAll } from "vitest";
import { env } from "cloudflare:test";
import { applySchema, seedTenant, seedKey, fetchApi, type Tenant } from "./helpers.js";
import type { SessionDO } from "../src/do/session-do.js";
import { PLANS } from "@repo/entitlements";
import { invalidateEntitlements } from "../src/lib/entitlements.js";

/**
 * A sign-in gate switched on over the top of a conversation already running.
 *
 * The document a session answers against is snapshotted at `init` and stored
 * with the session, which is right for the questions — nobody should have the
 * form rewritten under them mid-answer — and wrong for the gate, which is the
 * author's rule about who may answer at all.
 *
 * The case that made it wrong: somebody leaves a form half-finished while it is
 * open to anyone, the author turns sign-in on, and the respondent comes back.
 * The browser reconnects to the session it saved rather than opening a new one
 * (`use-chat.ts` probes the saved id and streams it when it is still active),
 * so the only gate that session could see was the one that existed the day it
 * opened. They carried on answering, ungated, forever.
 */

let t: Tenant;
let key: string;

const blocks = [
  { id: "blk_agl00001", ref: "q_one", type: "short_text", title: "One?", required: true, minLength: 0, maxLength: 80 },
  { id: "blk_agl00002", ref: "q_two", type: "short_text", title: "Two?", required: true, minLength: 0, maxLength: 80 },
  { id: "blk_agl00003", ref: "q_three", type: "short_text", title: "Three?", required: true, minLength: 0, maxLength: 80 },
];

const docWith = (gate: boolean) => ({
  schemaVersion: 6,
  title: "Live gate",
  blocks,
  endings: [{ id: "end_agl00001", ref: "end_thanks", title: "Done", bodyMd: "Thanks." }],
  logic: [],
  endingRules: [],
  variables: [],
  hiddenFields: [],
  layout: {},
  // Template mode: no model call, so the events under test are the flow's own.
  settings: {
    agent: { mode: "template" },
    onComplete: { requireSubmit: false },
    requireAuth: { enabled: gate, method: "google", afterBlocks: 0 },
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
}

/**
 * Republished onto the *same* version row, which is the point: the session
 * holds `ver_agl` as its own version too, so nothing but the settings differ
 * between what it snapshotted and what the form now serves.
 */
async function publish(gate: boolean): Promise<void> {
  const doc = JSON.stringify(docWith(gate));
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO form_versions (id, form_id, version, schema_json, checksum, published_at, created_by, created_at)
       VALUES ('ver_agl', ?1, 1, ?2, 'ck', ?3, ?4, ?3)
       ON CONFLICT (id) DO UPDATE SET schema_json = excluded.schema_json`,
    ).bind(t.formId, doc, now, t.userId),
    env.DB.prepare(
      `UPDATE forms SET status = 'published', working_schema = ?1, active_version_id = 'ver_agl' WHERE id = ?2`,
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
 * What a returning browser does: reconnect the saved session's stream.
 *
 * Drained to the readiness signal and then released, the same way the other
 * stream tests do it — the events under test are read back from durable
 * storage, so this only has to let the connect path run to completion.
 */
async function reconnect(sid: string): Promise<void> {
  const res = await stubFor(sid).stream();
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  try {
    for (let i = 0; i < 50; i++) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      if (buf.includes("event: session_ready")) break;
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
}

const typesSince0 = async (sid: string): Promise<string[]> =>
  (await stubFor(sid).eventsSince(0)).events.map((e) => e.type);

const cardCount = async (sid: string): Promise<number> =>
  (await typesSince0(sid)).filter((ty) => ty === "auth_required").length;

/**
 * Whatever the connect path raises is written after it has handed back its
 * response — it cannot be pushed into a stream nobody is draining yet — so the
 * durable events settle just behind the reconnect. Polled rather than slept on.
 */
async function waitForEvent(sid: string, type: string): Promise<void> {
  for (let i = 0; i < 100; i++) {
    if ((await typesSince0(sid)).includes(type)) return;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error(`no ${type} event arrived`);
}

/** The same settling delay, for an assertion that something did *not* happen. */
const settle = () => new Promise((r) => setTimeout(r, 250));

const signIn = (sid: string) =>
  stubFor(sid).attachIdentity({
    provider: "google",
    subject: "google-sub-live",
    email: "maya@northwind.example",
    phone: null,
    name: "Maya",
    pictureUrl: null,
    verifiedAt: Date.now(),
  });

beforeAll(async () => {
  await applySchema();
  t = await seedTenant("livegate");
  // `requireAuth` is plan-gated, and a gate `clampForRuntime` had switched off
  // would make every one of these pass for no reason.
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
    .bind(`sub_agl_${t.orgId}`, t.orgId, `dodo_agl_${t.orgId}`, Date.now() - 1000, Date.now() + 86_400_000 * 20, Date.now())
    .run();
  await invalidateEntitlements(env as never, t.orgId);
  key = (await seedKey(t, "livegatekey")).raw;
});

describe("a gate switched on mid-conversation", () => {
  it("meets the returning respondent on reconnect", async () => {
    await publish(false);
    const sid = await open();
    const first = await answer(sid, "q_one", "alpha");
    expect(first.question?.ref).toBe("q_two");
    expect(await typesSince0(sid)).not.toContain("auth_required");

    // The author turns sign-in on while the respondent is away.
    await publish(true);
    await reconnect(sid);
    await waitForEvent(sid, "auth_required");
  });

  it("refuses the next answer until they sign in", async () => {
    await publish(false);
    const sid = await open();
    await answer(sid, "q_one", "alpha");
    await publish(true);

    // No reconnect at all: the tab was never closed. The rule takes effect on
    // the next thing they send.
    const res = await api(`/v1/sessions/${sid}/messages`, {
      method: "POST",
      body: JSON.stringify({ type: "structured", ref: "q_two", value: "beta" }),
    });
    expect(res.status).toBe(400);
  });

  it("carries on at the question it interrupted, keeping what they said", async () => {
    await publish(false);
    const sid = await open();
    await answer(sid, "q_one", "alpha");
    await publish(true);
    await reconnect(sid);
    await waitForEvent(sid, "auth_required");

    expect((await signIn(sid)).accepted).toBe(true);

    const status = await stubFor(sid).getStatus();
    // Not rewound to question one, and not stranded in front of nothing: the
    // cursor the gate closed on is where they resume.
    expect(status?.currentRef).toBe("q_two");
    expect(status?.answers).toMatchObject({ q_one: "alpha" });

    const last = await answer(sid, "q_two", "beta");
    expect(last.question?.ref).toBe("q_three");
  });

  it("does not stack a second card on a second reconnect", async () => {
    await publish(false);
    const sid = await open();
    await answer(sid, "q_one", "alpha");
    await publish(true);

    await reconnect(sid);
    await waitForEvent(sid, "auth_required");
    await reconnect(sid);
    await settle();

    expect(await cardCount(sid)).toBe(1);
  });
});

describe("and switched off again", () => {
  it("lets a gated session carry on without signing in", async () => {
    await publish(true);
    const sid = await open();
    expect(await typesSince0(sid)).toContain("auth_required");

    // The author changes their mind. The rule that let nobody in must stop
    // applying just as promptly as the one that shut them out.
    await publish(false);
    await reconnect(sid);
    // The interview `init` never started, now that the gate is out of the way.
    await waitForEvent(sid, "question");

    const turn = await answer(sid, "q_one", "alpha");
    expect(turn.accepted).toBe(true);
    expect(turn.question?.ref).toBe("q_two");
  });
});
