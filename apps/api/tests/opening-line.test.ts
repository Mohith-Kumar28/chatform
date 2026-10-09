import { describe, it, expect, beforeAll } from "vitest";
import { env } from "cloudflare:test";
import { applySchema, seedTenant, seedKey, fetchApi, type Tenant } from "./helpers.js";
import type { SessionDO } from "../src/do/session-do.js";
import { PLANS } from "@repo/entitlements";
import { invalidateEntitlements } from "../src/lib/entitlements.js";
import { sessionObjectId } from "../src/lib/session-location.js";

/**
 * How a conversation opens, counted in the record rather than in the stream.
 *
 * A welcome block is the greeting. The flow says it — `beginInterview` walks to
 * it and `advanceTo` emits it — and `init` used to write the same paragraph
 * into the transcript first. Nothing showed it to the respondent, because
 * `appendMessage` stores without emitting, so both copies only ever met in the
 * places that read the stored record back: the response drawer, which is where
 * it was found, and the transcript the model is given as context.
 *
 * A sign-in gate is what made it obvious rather than what caused it — the gate
 * stops the flow between the two copies, so they arrive either side of a
 * "Respondent verified" line instead of back to back. Both orders are pinned
 * here for that reason.
 */

let t: Tenant;
let key: string;

const welcomeBlock = {
  id: "blk_opn00001",
  ref: "b_welcome",
  type: "welcome",
  title: "Campus Catalyst",
  description: "Read the instructions before proceeding.",
  buttonLabel: "Start",
};

const question = {
  id: "blk_opn00002",
  ref: "q_team",
  type: "short_text",
  title: "Team name?",
  required: true,
  minLength: 0,
  maxLength: 80,
};

const docWith = (opts: { welcome: boolean; gate: boolean }) => ({
  schemaVersion: 6,
  title: "Opening line",
  blocks: opts.welcome ? [welcomeBlock, question] : [question],
  endings: [{ id: "end_opn00001", ref: "end_thanks", title: "Done", bodyMd: "Thanks." }],
  logic: [],
  endingRules: [],
  variables: [],
  hiddenFields: [],
  layout: {},
  // Template mode: the phrasing under test is the flow's own, not a model's.
  settings: {
    agent: { mode: "template" },
    onComplete: { requireSubmit: false },
    requireAuth: { enabled: opts.gate, method: "google", afterBlocks: 0 },
  },
  theme: {},
});

const api = (path: string, init: RequestInit = {}) =>
  fetchApi(path, {
    ...init,
    headers: { "x-api-key": key, "content-type": "application/json", ...(init.headers as Record<string, string>) },
  });

async function publish(opts: { welcome: boolean; gate: boolean }): Promise<void> {
  const doc = JSON.stringify(docWith(opts));
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO form_versions (id, form_id, version, schema_json, checksum, published_at, created_by, created_at)
       VALUES ('ver_opn', ?1, 1, ?2, 'ck', ?3, ?4, ?3)
       ON CONFLICT (id) DO UPDATE SET schema_json = excluded.schema_json`,
    ).bind(t.formId, doc, now, t.userId),
    env.DB.prepare(
      `UPDATE forms SET status = 'published', working_schema = ?1, active_version_id = 'ver_opn' WHERE id = ?2`,
    ).bind(doc, t.formId),
  ]);
}

const open = async (): Promise<string> =>
  ((await (await api(`/v1/forms/${t.formId}/sessions`, { method: "POST", body: "{}" })).json()) as {
    sessionId: string;
  }).sessionId;

const stubFor = (sid: string) =>
  env.SESSION_DO.get(sessionObjectId(env.SESSION_DO, sid)) as unknown as DurableObjectStub<SessionDO>;

const signIn = (sid: string) =>
  stubFor(sid).attachIdentity({
    provider: "google",
    subject: "google-sub-opening",
    email: "maya@northwind.example",
    phone: null,
    name: "Maya",
    pictureUrl: null,
    verifiedAt: Date.now(),
  });

/** How many stored assistant messages carry the welcome block's title. */
const said = async (sid: string): Promise<string[]> =>
  (await stubFor(sid).getTranscript()).map((m) => m.content);

const countOf = (lines: string[], needle: string) =>
  lines.filter((line) => line.includes(needle)).length;

beforeAll(async () => {
  await applySchema();
  t = await seedTenant("openingline");
  // `requireAuth` is plan-gated; without a paid plan `clampForRuntime` turns the
  // gate off and the gated case below would silently become the ungated one.
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
    .bind(`sub_opn_${t.orgId}`, t.orgId, `dodo_opn_${t.orgId}`, Date.now() - 1000, Date.now() + 86_400_000 * 20, Date.now())
    .run();
  await invalidateEntitlements(env as never, t.orgId);
  key = (await seedKey(t, "openinglinekey")).raw;
});

describe("a form that opens with a welcome block", () => {
  it("says it once", async () => {
    await publish({ welcome: true, gate: false });
    const sid = await open();

    const lines = await said(sid);
    expect(countOf(lines, "Campus Catalyst")).toBe(1);
    // And not alongside the stand-in for a document with no opening of its own.
    expect(countOf(lines, "I'll walk you through")).toBe(0);
  });

  it("still says it once when a sign-in gate splits the opening", async () => {
    await publish({ welcome: true, gate: true });
    const sid = await open();

    // The gate closes before the first question, so the flow has not reached
    // the welcome block yet — this is the half of the transcript `init` writes.
    expect(countOf(await said(sid), "Campus Catalyst")).toBe(0);

    await signIn(sid);

    // Verification releases the flow, which now says it for the first time.
    // Two copies here is the bug this test exists for: the drawer showed the
    // paragraph above the sign-in card and again below it.
    const lines = await said(sid);
    expect(countOf(lines, "Campus Catalyst")).toBe(1);
    expect(countOf(lines, "Read the instructions before proceeding.")).toBe(1);
  });
});

describe("a form with no welcome block", () => {
  it("still gets an opening line of its own", async () => {
    await publish({ welcome: false, gate: false });
    const sid = await open();

    const lines = await said(sid);
    expect(countOf(lines, `I'll walk you through "Opening line"`)).toBe(1);
  });
});

/**
 * The opening rides back on the request that opened the session.
 *
 * It used to be stored and nothing else: the respondent's browser then made a
 * second request, the stream, to read back a question that was ready when the
 * first one returned. Opening a session on the public route now answers with
 * the events themselves, the same ones the stream replays.
 */
describe("the response to opening a session", () => {
  it("carries the greeting and the first question", async () => {
    await publish({ welcome: true, gate: false });
    const slug = (await env.DB.prepare(`SELECT slug FROM forms WHERE id = ?1`).bind(t.formId).first<{ slug: string }>())!.slug;
    const res = await fetchApi(`/p/forms/${slug}/sessions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { events: { seq: number; type: string; data: { ref?: string; text?: string } }[] };

    const types = body.events.map((e) => e.type);
    expect(types).toContain("message_start");
    expect(types[types.length - 1]).toBe("question");
    expect(JSON.stringify(body.events.at(-1)!.data)).toContain("q_team");
    // The welcome's own words, whole, on the frame that closes its bubble.
    expect(body.events.some((e) => e.type === "message_end" && e.data.text?.includes("Campus Catalyst"))).toBe(true);
    // In order and from the start, so the stream's replay of them is a repeat the client drops.
    expect(body.events.map((e) => e.seq)).toEqual(body.events.map((_, i) => i + 1));
  });
});

/**
 * A session object can be started before the session that will use it.
 *
 * Starting one is most of a second in production, and it was spent between a
 * respondent's click and their first question. `POST /p/reserve` starts one
 * and names it; opening a session with that name uses it.
 */
describe("a reserved session", () => {
  const slugOf = async () =>
    (await env.DB.prepare(`SELECT slug FROM forms WHERE id = ?1`).bind(t.formId).first<{ slug: string }>())!.slug;
  // As the browser sends it: plain text, so no preflight goes ahead of it.
  const openWith = async (body: object) =>
    fetchApi(`/p/forms/${await slugOf()}/sessions`, {
      method: "POST",
      headers: { "content-type": "text/plain;charset=UTF-8" },
      body: JSON.stringify(body),
    });
  const reserve = async (id?: string) =>
    ((await (await fetchApi(`/p/reserve`, { method: "POST", body: JSON.stringify(id ? { id } : {}) })).json()) as { id: string }).id;

  it("is the session that opens, and writes nothing until it does", async () => {
    await publish({ welcome: true, gate: false });
    const before = (await env.DB.prepare(`SELECT COUNT(*) AS n FROM chat_sessions`).first<{ n: number }>())!.n;
    const id = await reserve();
    expect(id).toMatch(/^chs_[0-9a-f]{64}$/);
    // Asking again with the id keeps the same one.
    expect(await reserve(id)).toBe(id);
    expect((await env.DB.prepare(`SELECT COUNT(*) AS n FROM chat_sessions`).first<{ n: number }>())!.n).toBe(before);

    const res = await openWith({ reserved: id });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { sessionId: string; events: unknown[] };
    expect(body.sessionId).toBe(id);
    expect(body.events.length).toBeGreaterThan(0);
  });

  it("cannot be opened twice, or name somebody else's session", async () => {
    await publish({ welcome: true, gate: false });
    const id = await reserve();
    const first = (await (await openWith({ reserved: id })).json()) as { sessionId: string };
    const second = (await (await openWith({ reserved: id })).json()) as { sessionId: string; events: unknown[] };
    expect(first.sessionId).toBe(id);
    expect(second.sessionId).not.toBe(id);
    // And the second is a whole session of its own, not an empty reply from the first one's object.
    expect(second.events.length).toBeGreaterThan(0);
  });

  it("ignores an id it did not mint", async () => {
    await publish({ welcome: true, gate: false });
    const res = await openWith({ reserved: "chs_notanobjectid" });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { sessionId: string }).sessionId).toMatch(/^chs_[0-9a-f]{64}$/);
  });
});
