import { describe, it, expect, beforeAll } from "vitest";
import { env } from "cloudflare:test";
import { applySchema, seedTenant, seedKey, fetchApi, type Tenant } from "./helpers.js";

/**
 * "No two teams may register under the same name."
 *
 * The one answer rule that cannot be decided from the block and the value, so
 * the one that is not in `validateAnswer`. That makes it the rule most likely
 * to hold on one surface and not the other: it has to be checked separately by
 * the Durable Object running a conversation and by the REST handler recording a
 * programmatic answer, and there is no shared function call that forces both to
 * do it. This suite drives both.
 *
 * The edges below are the ones a registration form actually hits: the same name
 * in a different case, somebody correcting their own answer to what it already
 * was, a name typed by a respondent who then wandered off, and a test key
 * rehearsing the integration against live data.
 */

let t: Tenant;
let key: string;
let testKey: string;

const VERSION_ID = "ver_unique";

const DOC = {
  schemaVersion: 4,
  title: "Hackathon registration",
  blocks: [
    {
      id: "blk_uqteam01", ref: "q_team", type: "short_text", title: "Team name?",
      required: true, minLength: 0, maxLength: 80, unique: true,
    },
    {
      id: "blk_uqmail01", ref: "q_email", type: "email", title: "Captain's email?",
      required: true, unique: true,
    },
    {
      id: "blk_uqcity01", ref: "q_city", type: "short_text", title: "Which city?",
      required: false, minLength: 0, maxLength: 80,
    },
  ],
  endings: [{ id: "end_uq00001", ref: "end_thanks", title: "You're in!", bodyMd: "" }],
  logic: [], endingRules: [], variables: [], hiddenFields: [], layout: {},
  // Template mode keeps the conversation deterministic and model-free.
  settings: { agent: { mode: "template" }, onComplete: { requireSubmit: false } },
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
    .bind(`sub_uq_${orgId}`, orgId, `dodo_uq_${orgId}`, Date.now() - 1000, Date.now() + 86_400_000 * 20, Date.now(), Date.now())
    .run();
  await invalidateEntitlements(env as never, orgId);
}

const call = (apiKey: string) => (path: string, init: RequestInit = {}) =>
  fetchApi(path, {
    ...init,
    headers: { "x-api-key": apiKey, "content-type": "application/json", ...(init.headers as Record<string, string>) },
  });

let api: ReturnType<typeof call>;
let testApi: ReturnType<typeof call>;

interface Issue { ref: string; code: string; message: string }

/** Open a response carrying these answers, and hand back the status and issues. */
async function register(
  answers: Record<string, unknown>,
  as: ReturnType<typeof call> = api,
): Promise<{ status: number; id?: string; issues: Issue[] }> {
  const res = await as(`/v1/forms/${t.formId}/responses`, {
    method: "POST",
    body: JSON.stringify({ answers, mode: "free" }),
  });
  const body = (await res.json()) as { id?: string; error?: { issues?: Issue[] } };
  return { status: res.status, id: body.id, issues: body.error?.issues ?? [] };
}

beforeAll(async () => {
  await applySchema();
  t = await seedTenant("unique");
  await subscribePro(t.orgId);
  key = (await seedKey(t, "uniquekey", {
    scopes: { form: ["read"], response: ["read", "write"], session: ["create", "write", "read"] },
  })).raw;
  testKey = (await seedKey(t, "uniquetestkey", {
    type: "sk_test",
    scopes: { form: ["read"], response: ["read", "write"], session: ["create", "write", "read"] },
  })).raw;
  api = call(key);
  testApi = call(testKey);

  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO form_versions (id, form_id, version, schema_json, checksum, published_at, created_by, created_at)
       VALUES (?1, ?2, 1, ?3, 'ck', ?4, ?5, ?4)`,
    ).bind(VERSION_ID, t.formId, JSON.stringify(DOC), now, t.userId),
    env.DB.prepare(
      `UPDATE forms SET status = 'published', slug = 'unique-answers', working_schema = ?1, active_version_id = ?2 WHERE id = ?3`,
    ).bind(JSON.stringify(DOC), VERSION_ID, t.formId),
  ]);
});

describe("the API path", () => {
  it("refuses a team name another response already gave", async () => {
    const first = await register({ q_team: "Night Owls", q_email: "owls@example.co" });
    expect(first.status).toBe(201);

    const second = await register({ q_team: "Night Owls", q_email: "someone@example.co" });
    expect(second.status).toBe(422);
    expect(second.issues).toEqual([
      { ref: "q_team", code: "duplicate", message: expect.any(String) },
    ]);
    // Rejected before the row is opened: a refused batch must not leave an
    // empty response behind for the author to wonder about.
    expect(second.id).toBeUndefined();
  });

  it("treats case and surrounding space as the same name", async () => {
    expect((await register({ q_team: "Quiet Storm", q_email: "storm@example.co" })).status).toBe(201);
    const again = await register({ q_team: "  quiet STORM  ", q_email: "other@example.co" });
    expect(again.status).toBe(422);
    expect(again.issues[0]!.ref).toBe("q_team");
  });

  it("lets an unmarked question repeat freely", async () => {
    expect((await register({ q_team: "Team A", q_email: "a@example.co", q_city: "Pune" })).status).toBe(201);
    // Same city, different everything else. Only the marked questions are checked.
    expect((await register({ q_team: "Team B", q_email: "b@example.co", q_city: "Pune" })).status).toBe(201);
  });

  it("does not collide a response with itself when an answer is re-sent", async () => {
    const opened = await register({ q_team: "Cartographers", q_email: "carto@example.co" });
    expect(opened.status).toBe(201);

    // How a caller corrects an answer: send it again. The response already holds
    // this exact value, and that must not read as somebody else's claim.
    const res = await api(`/v1/responses/${opened.id}/answers`, {
      method: "POST",
      body: JSON.stringify({ ref: "q_team", value: "Cartographers" }),
    });
    expect(res.status).toBe(200);
  });

  it("frees a name held by a response that was abandoned", async () => {
    const opened = await register({ q_team: "Ghost Ship", q_email: "ghost@example.co" });
    expect((await register({ q_team: "Ghost Ship", q_email: "rival@example.co" })).status).toBe(422);

    await env.DB.prepare(`UPDATE submissions SET status = 'abandoned' WHERE id = ?`).bind(opened.id!).run();

    // Somebody who typed a name and wandered off does not hold it forever.
    expect((await register({ q_team: "Ghost Ship", q_email: "rival@example.co" })).status).toBe(201);
  });

  it("keeps test-mode names and live names out of each other's way", async () => {
    expect((await register({ q_team: "Rehearsal", q_email: "live@example.co" })).status).toBe(201);

    // A `*_test_` key rehearsing the integration must not be able to burn a name
    // a real respondent could have had…
    expect((await register({ q_team: "Rehearsal", q_email: "test@example.co" }, testApi)).status).toBe(201);
    // …and the rule still has to be testable with a test key.
    expect((await register({ q_team: "Rehearsal", q_email: "test2@example.co" }, testApi)).status).toBe(422);
  });
});

describe("the conversation", () => {
  const openSession = () => api(`/v1/forms/${t.formId}/sessions`, { method: "POST", body: "{}" });

  async function say(sessionId: string, ref: string, value: unknown) {
    const res = await api(`/v1/sessions/${sessionId}/messages`, {
      method: "POST",
      body: JSON.stringify({ type: "structured", ref, value }),
    });
    return (await res.json()) as {
      accepted: boolean;
      validation: { ref: string; code: string; message: string } | null;
      question: { ref: string } | null;
      answers: Record<string, unknown>;
    };
  }

  it("refuses a taken name and stays on the question", async () => {
    const { sessionId: first } = (await (await openSession()).json()) as { sessionId: string };
    const taken = await say(first, "q_team", "Solar Flare");
    expect(taken.validation).toBeNull();
    expect(taken.answers.q_team).toBe("Solar Flare");

    const { sessionId: second } = (await (await openSession()).json()) as { sessionId: string };
    const refused = await say(second, "q_team", "solar flare");
    expect(refused.validation?.ref).toBe("q_team");
    // The same code the API returns, so a client branches on one thing.
    expect(refused.validation?.code).toBe("duplicate");
    // Still being asked, and holding no answer it did not accept.
    expect(refused.question?.ref).toBe("q_team");
    expect(refused.answers.q_team).toBeUndefined();

    // A different name gets through on the very next turn.
    const accepted = await say(second, "q_team", "Lunar Flare");
    expect(accepted.validation).toBeNull();
    expect(accepted.answers.q_team).toBe("Lunar Flare");
  });

  it("lets a respondent go back and re-give their own answer", async () => {
    const { sessionId } = (await (await openSession()).json()) as { sessionId: string };
    await say(sessionId, "q_team", "Second Thoughts");
    await say(sessionId, "q_email", "second@example.co");

    // The pencil: go back to a question already answered. Re-typing what is
    // already there must not read as somebody else claiming it — the row it
    // would collide with is this respondent's own.
    const back = await api(`/v1/sessions/${sessionId}/actions`, {
      method: "POST",
      body: JSON.stringify({ action: "edit", ref: "q_team" }),
    });
    expect(back.status).toBe(200);

    const again = await say(sessionId, "q_team", "Second Thoughts");
    expect(again.validation).toBeNull();
    expect(again.answers.q_team).toBe("Second Thoughts");
  });
});
