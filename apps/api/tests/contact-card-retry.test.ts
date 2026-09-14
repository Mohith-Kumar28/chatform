import { describe, it, expect, beforeAll } from "vitest";
import { env } from "cloudflare:test";
import { applySchema, seedTenant, seedKey, fetchApi, type Tenant } from "./helpers.js";

/**
 * A contact card refused for one field, re-asked holding the other three.
 *
 * The production bug: a respondent gave a name, an email and a bare national
 * phone number in one message. The number was refused for having no country
 * code — and because the whole record was thrown away with it, the card came
 * back with all four boxes empty while the agent's own message asked only for
 * the phone. The two halves of the runtime disagreed in front of the person
 * filling it in.
 *
 * What these pin: the refusal keeps what was good, the re-asked question
 * carries it as a prefill, and answering properly clears it.
 */

let t: Tenant;
let key: string;

const DOC = {
  schemaVersion: 4,
  title: "Contact retry",
  blocks: [
    {
      id: "blk_ccard001",
      ref: "q_contact",
      type: "contact_info",
      title: "Your details",
      required: true,
      fields: ["first_name", "last_name", "email", "phone"],
    },
  ],
  endings: [{ id: "end_cc00001", ref: "end_thanks", title: "All done!", bodyMd: "Thanks." }],
  logic: [], endingRules: [], variables: [], hiddenFields: [], layout: {},
  // Template mode keeps every turn deterministic and model-free.
  settings: { agent: { mode: "template" }, onComplete: { requireSubmit: false } },
  theme: {},
};

/** The `/v1` surface is a Pro feature, and these tests drive the session through it. */
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
    .bind(`sub_cc_${orgId}`, orgId, `dodo_cc_${orgId}`, Date.now() - 1000, Date.now() + 86_400_000 * 20, Date.now(), Date.now())
    .run();
  await invalidateEntitlements(env as never, orgId);
}

const api = (path: string, init: RequestInit = {}) =>
  fetchApi(path, {
    ...init,
    headers: { "x-api-key": key, "content-type": "application/json", ...(init.headers as Record<string, string>) },
  });

beforeAll(async () => {
  await applySchema();
  t = await seedTenant("ccard");
  await subscribePro(t.orgId);
  key = (await seedKey(t, "ccardkey")).raw;
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO form_versions (id, form_id, version, schema_json, checksum, published_at, created_by, created_at)
       VALUES ('ver_ccard', ?1, 1, ?2, 'ck', ?3, ?4, ?3)`,
    ).bind(t.formId, JSON.stringify(DOC), now, t.userId),
    env.DB.prepare(
      `UPDATE forms SET status = 'published', working_schema = ?1, active_version_id = 'ver_ccard' WHERE id = ?2`,
    ).bind(JSON.stringify(DOC), t.formId),
  ]);
});

type Evt = { seq: number; type: string; data: Record<string, unknown> };

async function open(): Promise<string> {
  const res = await api(`/v1/forms/${t.formId}/sessions`, { method: "POST", body: "{}" });
  const body = await res.json();
  // Named loudly: a 402 here is an entitlement problem, not a chat one, and
  // reading it as "sessionId was undefined" costs an afternoon.
  if (res.status !== 200) throw new Error(`open ${res.status} ${JSON.stringify(body)}`);
  return (body as { sessionId: string }).sessionId;
}

const answer = (sessionId: string, value: unknown) =>
  api(`/v1/sessions/${sessionId}/messages`, {
    method: "POST",
    body: JSON.stringify({ type: "structured", ref: "q_contact", value }),
  });

/** The most recent `question` event on the session's durable stream. */
async function lastQuestion(sessionId: string): Promise<Evt | undefined> {
  const res = await api(`/v1/sessions/${sessionId}/events?since=0`);
  const { events } = (await res.json()) as { events: Evt[] };
  return events.filter((e) => e.type === "question").at(-1);
}

const HALF_GOOD = {
  first_name: "Randhir",
  last_name: "Kumar",
  email: "randhir@example.com",
  phone: "9835126411",
};

describe("a refused contact card", () => {
  it("comes back holding the fields that were fine", async () => {
    const sessionId = await open();
    await answer(sessionId, HALF_GOOD);

    const q = await lastQuestion(sessionId);
    expect(q?.data.prefill).toEqual({
      first_name: "Randhir",
      last_name: "Kumar",
      email: "randhir@example.com",
    });
  });

  it("never hands back the value that was just refused", async () => {
    const sessionId = await open();
    await answer(sessionId, HALF_GOOD);
    expect(await lastQuestion(sessionId).then((q) => q?.data.prefill)).not.toHaveProperty("phone");
  });

  it("keeps what an earlier attempt banked when the fix arrives on its own", async () => {
    const sessionId = await open();
    await answer(sessionId, HALF_GOOD);
    // What the composer sends after the respondent corrects one cell: a record
    // holding a still-bad number and nothing else. The name and email are not
    // in it, and must not be lost because of that.
    await answer(sessionId, { phone: "12345" });

    expect(await lastQuestion(sessionId).then((q) => q?.data.prefill)).toMatchObject({
      first_name: "Randhir",
      email: "randhir@example.com",
    });
  });

  it("stops carrying anything once the card is answered", async () => {
    const sessionId = await open();
    await answer(sessionId, HALF_GOOD);
    await answer(sessionId, { ...HALF_GOOD, phone: "+919835126411" });

    const res = await api(`/v1/sessions/${sessionId}`);
    const body = (await res.json()) as { answers?: Record<string, unknown> };
    expect(body.answers?.q_contact).toMatchObject({ phone: "+919835126411" });
  });

  it("says what is wrong with the number instead of naming the convention", async () => {
    const sessionId = await open();
    const res = await answer(sessionId, HALF_GOOD);
    const body = (await res.json()) as { events?: Evt[] };
    const refusal = body.events?.find((e) => e.type === "validation_error");
    expect(refusal?.data.message).toContain("+91");
  });
});
