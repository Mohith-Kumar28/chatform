import { describe, it, expect, beforeAll } from "vitest";
import { env } from "cloudflare:test";
import { applySchema, seedTenant, seedKey, fetchApi, type Tenant } from "./helpers.js";

/**
 * Changing one answer, and what happens to all the others.
 *
 * Going back to correct a single answer used to hand the flow straight back to
 * `resolveNext`, which returns the question after the one just answered — so
 * every question after the corrected one was asked again, and a one-word fix
 * cost the whole tail of the form. These pin the two halves of the fix: the
 * common case resumes where the respondent was, and the interesting case —
 * where the new answer opens a path they have not been down — still asks the
 * questions that genuinely became relevant.
 *
 * Driven over `/v1`, whose turn responses carry the resulting question, so
 * each assertion is on the question a respondent would actually be shown.
 */

let t: Tenant;
let key: string;

const blocks = [
  {
    id: "blk_edplat01",
    ref: "q_platform",
    type: "single_select",
    title: "Platform?",
    required: true,
    options: [
      { id: "opt_ios", label: "iOS" },
      { id: "opt_web", label: "Web" },
    ],
  },
  { id: "blk_edrole01", ref: "q_role", type: "short_text", title: "Role?", required: true, minLength: 0, maxLength: 80 },
  { id: "blk_edteam01", ref: "q_team", type: "short_text", title: "Team size?", required: true, minLength: 0, maxLength: 80 },
  { id: "blk_edmail01", ref: "q_email", type: "email", title: "Email?", required: true },
];

const DOC = {
  schemaVersion: 4,
  title: "Edit resume",
  blocks,
  endings: [{ id: "end_ed00001", ref: "end_thanks", title: "All done!", bodyMd: "Thanks." }],
  logic: [],
  endingRules: [],
  variables: [],
  hiddenFields: [],
  layout: {},
  // Template mode keeps every turn deterministic and model-free.
  settings: { agent: { mode: "template" }, onComplete: { requireSubmit: true } },
  theme: {},
};

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
    .bind(`sub_ed_${orgId}`, orgId, `dodo_ed_${orgId}`, Date.now() - 1000, Date.now() + 86_400_000 * 20, Date.now(), Date.now())
    .run();
  await invalidateEntitlements(env as never, orgId);
}

async function publish(doc: unknown, versionId: string, formId: string, userId: string): Promise<void> {
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO form_versions (id, form_id, version, schema_json, checksum, published_at, created_by, created_at)
       VALUES (?1, ?2, 1, ?3, 'ck', ?4, ?5, ?4) ON CONFLICT (id) DO NOTHING`,
    ).bind(versionId, formId, JSON.stringify(doc), now, userId),
    env.DB.prepare(
      `UPDATE forms SET status = 'published', working_schema = ?1, active_version_id = ?2 WHERE id = ?3`,
    ).bind(JSON.stringify(doc), versionId, formId),
  ]);
}

interface TurnBody {
  question: { ref: string } | null;
  awaitingSubmit: boolean;
  complete: boolean;
}

const api = (path: string, init: RequestInit = {}) =>
  fetchApi(path, {
    ...init,
    headers: { "x-api-key": key, "content-type": "application/json", ...(init.headers as Record<string, string>) },
  });

const answer = (sessionId: string, ref: string, value: unknown) =>
  api(`/v1/sessions/${sessionId}/messages`, {
    method: "POST",
    body: JSON.stringify({ type: "structured", ref, value }),
  }).then((r) => r.json() as Promise<TurnBody>);

const act = (sessionId: string, action: string, ref?: string) =>
  api(`/v1/sessions/${sessionId}/actions`, {
    method: "POST",
    body: JSON.stringify({ action, ref }),
  }).then((r) => r.json() as Promise<TurnBody>);

const open = async (): Promise<string> =>
  ((await (await api(`/v1/forms/${t.formId}/sessions`, { method: "POST", body: "{}" })).json()) as {
    sessionId: string;
  }).sessionId;

beforeAll(async () => {
  await applySchema();
  t = await seedTenant("editresume");
  await subscribePro(t.orgId);
  key = (await seedKey(t, "editresumekey")).raw;
  await publish(DOC, "ver_editresume", t.formId, t.userId);
});

describe("changing one answer mid-conversation", () => {
  it("resumes at the first question still unanswered, not the one after the edit", async () => {
    const sessionId = await open();
    await answer(sessionId, "q_platform", "opt_ios");
    await answer(sessionId, "q_role", "Designer");
    const atTeam = await answer(sessionId, "q_team", "12");
    expect(atTeam.question?.ref).toBe("q_email");

    // Go back three questions and correct the first one.
    const reopened = await act(sessionId, "edit", "q_platform");
    expect(reopened.question?.ref).toBe("q_platform");

    const resumed = await answer(sessionId, "q_platform", "opt_web");
    // The bug: this used to be `q_role`, and the respondent was walked through
    // role and team size again before getting back to where they were.
    expect(resumed.question?.ref).toBe("q_email");
  });

  it("returns to the review step when everything else is already answered", async () => {
    const sessionId = await open();
    for (const [ref, value] of [
      ["q_platform", "opt_ios"],
      ["q_role", "PM"],
      ["q_team", "3"],
      ["q_email", "rev@example.com"],
    ] as const) {
      await answer(sessionId, ref, value);
    }
    const parked = (await (await api(`/v1/sessions/${sessionId}`)).json()) as { awaitingSubmit: boolean };
    expect(parked.awaitingSubmit).toBe(true);

    await act(sessionId, "edit", "q_role");
    const back = await answer(sessionId, "q_role", "Founder");
    expect(back.question).toBeNull();
    expect(back.awaitingSubmit).toBe(true);
  });

  it("skipping an edited question resumes too, rather than re-walking the form", async () => {
    const sessionId = await open();
    await answer(sessionId, "q_platform", "opt_ios");
    await answer(sessionId, "q_role", "Eng");
    await answer(sessionId, "q_team", "40");

    await act(sessionId, "edit", "q_role");
    // `required` blocks refuse a skip, so this asserts the refusal rather than
    // a resume — the point being that the bookmark is not consumed by a turn
    // that did not happen.
    await act(sessionId, "skip");
    const resumed = await answer(sessionId, "q_role", "Eng Manager");
    expect(resumed.question?.ref).toBe("q_email");
  });
});

describe("changing an answer that changes the path", () => {
  const branchDoc = {
    ...DOC,
    title: "Edit branch",
    blocks: [
      blocks[0],
      { id: "blk_edios001", ref: "q_ios_only", type: "short_text", title: "Which iOS version?", required: true, minLength: 0, maxLength: 80 },
      { id: "blk_edweb001", ref: "q_web_only", type: "short_text", title: "Which browser?", required: true, minLength: 0, maxLength: 80 },
      blocks[3],
    ],
    logic: [
      // Two arms off the platform question, plus the join that takes the iOS
      // arm past the web-only question it must never be shown.
      {
        id: "rul_edbrnch1",
        action_kind: "goto",
        from: "q_platform",
        when: { op: "and", conditions: [{ left: { kind: "ref", ref: "q_platform" }, op: "eq", value: "opt_web" }], groups: [] },
        target: "q_web_only",
      },
      {
        id: "rul_edbrnch2",
        action_kind: "goto",
        from: "q_platform",
        when: { op: "and", conditions: [{ left: { kind: "ref", ref: "q_platform" }, op: "eq", value: "opt_ios" }], groups: [] },
        target: "q_ios_only",
      },
      {
        id: "rul_edbrnch3",
        action_kind: "goto",
        from: "q_ios_only",
        when: null,
        target: "q_email",
      },
    ],
    settings: { agent: { mode: "template" }, onComplete: { requireSubmit: true } },
  };

  let branchTenant: Tenant;
  let branchKey: string;

  const bApi = (path: string, init: RequestInit = {}) =>
    fetchApi(path, {
      ...init,
      headers: { "x-api-key": branchKey, "content-type": "application/json", ...(init.headers as Record<string, string>) },
    });

  beforeAll(async () => {
    branchTenant = await seedTenant("editbranch");
    await subscribePro(branchTenant.orgId);
    branchKey = (await seedKey(branchTenant, "editbranchkey")).raw;
    await publish(branchDoc, "ver_editbranch", branchTenant.formId, branchTenant.userId);
  });

  it("asks the questions the new path opens instead of silently skipping them", async () => {
    const sessionId = ((await (
      await bApi(`/v1/forms/${branchTenant.formId}/sessions`, { method: "POST", body: "{}" })
    ).json()) as { sessionId: string }).sessionId;

    const send = (ref: string, value: unknown) =>
      bApi(`/v1/sessions/${sessionId}/messages`, {
        method: "POST",
        body: JSON.stringify({ type: "structured", ref, value }),
      }).then((r) => r.json() as Promise<TurnBody>);

    const afterPlatform = await send("q_platform", "opt_ios");
    expect(afterPlatform.question?.ref).toBe("q_ios_only");
    await send("q_ios_only", "18.2");
    await send("q_email", "branch@example.com");

    await bApi(`/v1/sessions/${sessionId}/actions`, {
      method: "POST",
      body: JSON.stringify({ action: "edit", ref: "q_platform" }),
    });
    // The new answer routes down a branch whose question has never been
    // answered, so the resume walk must stop there rather than fast-forwarding
    // past it to the questions that were already done.
    const rerouted = await send("q_platform", "opt_web");
    expect(rerouted.question?.ref).toBe("q_web_only");
  });
});
