import { describe, it, expect, beforeAll } from "vitest";
import { env } from "cloudflare:test";
import { applySchema, seedTenant, seedKey, fetchApi, type Tenant } from "./helpers.js";

/**
 * The three ways a finished-looking response used to come out incomplete.
 *
 * All three were found in one live registration form, in one response, and
 * they compound: the interview spent its phrasing budget and dropped to
 * template mode, the template questions were streamed but never written down,
 * and an edit tapped on the review card deleted an answer that was never
 * replaced. What the author was left looking at was a required question
 * reading "Not answered" above a transcript with no questions in it, and no
 * way to work out how either had happened.
 *
 * Driven over `/v1` in template mode, so there is no model in the loop.
 */

let t: Tenant;
let key: string;

const DOC = {
  schemaVersion: 4,
  title: "Team registration",
  blocks: [
    { id: "blk_ad_name1", ref: "q_team", type: "short_text", title: "What is your team name?", required: true, minLength: 0, maxLength: 200 },
    { id: "blk_ad_elig1", ref: "q_eligible", type: "yes_no", title: "Are all of you currently enrolled?", required: true },
    { id: "blk_ad_mem01", ref: "q_member_1", type: "short_text", title: "Team member 1", required: true, minLength: 0, maxLength: 200 },
    { id: "blk_ad_mem02", ref: "q_member_2", type: "short_text", title: "Team member 2", required: true, minLength: 0, maxLength: 200 },
  ],
  endings: [
    { id: "end_ad_ok01", ref: "end_thanks", title: "You're registered", bodyMd: "See you Friday." },
    { id: "end_ad_no01", ref: "end_ineligible", title: "Not eligible", bodyMd: "Enrolled students only.", kind: "screen_out", requirements: [] },
  ],
  logic: [
    {
      id: "rl_ad_elig1",
      action_kind: "goto",
      from: "q_eligible",
      when: { op: "and", conditions: [{ left: { kind: "ref", ref: "q_eligible" }, op: "eq", value: false }], groups: [] },
      target: "end_ineligible",
      targetKind: "ending",
    },
  ],
  endingRules: [],
  variables: [],
  hiddenFields: [],
  layout: {},
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
    .bind(`sub_ad_${orgId}`, orgId, `dodo_ad_${orgId}`, Date.now() - 1000, Date.now() + 86_400_000 * 20, Date.now(), Date.now())
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
  complete: boolean;
  awaitingSubmit: boolean;
  question: { ref: string } | null;
  ending: { ref: string; title: string } | null;
  events: { type: string }[];
  validation: { ref: string; code: string } | null;
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

/** Every answer the results dashboard would show for this conversation. */
const storedAnswers = async (sessionId: string): Promise<Record<string, string>> => {
  const rows = await env.DB.prepare(
    `SELECT a.block_ref AS ref, a.value_json AS value FROM submission_answers a
       JOIN submissions s ON s.id = a.submission_id
      WHERE s.session_id = ?`,
  )
    .bind(sessionId)
    .all<{ ref: string; value: string }>();
  return Object.fromEntries((rows.results ?? []).map((r) => [r.ref, r.value]));
};

/** The transcript the results dashboard would show, once the session closes. */
const storedTranscript = async (sessionId: string): Promise<{ role: string; content: string }[]> => {
  const rows = await env.DB.prepare(
    `SELECT role, content FROM chat_messages WHERE session_id = ? ORDER BY created_at`,
  )
    .bind(sessionId)
    .all<{ role: string; content: string }>();
  return rows.results ?? [];
};

beforeAll(async () => {
  await applySchema();
  t = await seedTenant("answerdur");
  await subscribePro(t.orgId);
  key = (
    await seedKey(t, "answerdurkey", {
      scopes: { form: ["read"], response: ["read", "write"], session: ["create", "write", "read"] },
    })
  ).raw;
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO form_versions (id, form_id, version, schema_json, checksum, published_at, created_by, created_at)
       VALUES (?1, ?2, 1, ?3, 'ck', ?4, ?5, ?4) ON CONFLICT (id) DO NOTHING`,
    ).bind("ver_answerdur", t.formId, JSON.stringify(DOC), now, t.userId),
    env.DB.prepare(
      `UPDATE forms SET status = 'published', working_schema = ?1, active_version_id = ?2 WHERE id = ?3`,
    ).bind(JSON.stringify(DOC), "ver_answerdur", t.formId),
  ]);
});

/**
 * The pencil is a replacement, not a retraction.
 *
 * Tapping "change this answer" used to delete the answer, its tally and its
 * projected row on the spot, on the theory that the respondent had withdrawn
 * it. They had not — they had promised a better one. When the better one never
 * came (a phone put down on the review card, which is exactly where the pencil
 * is easiest to hit) the response was left with a required question blank, the
 * review card gone, and nothing in the transcript to say why.
 */
describe("an edit that is never finished", () => {
  it("leaves the answer that was there", async () => {
    const s = await open();
    await answer(s, "q_team", "Team Spark");
    await answer(s, "q_eligible", true);
    await answer(s, "q_member_1", "Aishwarya R Deshpande");
    const done = await answer(s, "q_member_2", "Deekshitha M");
    expect(done.awaitingSubmit).toBe(true);

    // Second thoughts about member 2 — and then nothing.
    const edit = await act(s, "edit", "q_member_2");
    expect(edit.accepted).toBe(true);
    expect(edit.question?.ref).toBe("q_member_2");

    expect(await storedAnswers(s)).toMatchObject({ q_member_2: JSON.stringify("Deekshitha M") });
  });

  it("still holds it after the conversation is abandoned", async () => {
    const s = await open();
    await answer(s, "q_team", "Team Spark");
    await answer(s, "q_eligible", true);
    await answer(s, "q_member_1", "Aishwarya R Deshpande");
    await answer(s, "q_member_2", "Deekshitha M");
    await act(s, "edit", "q_member_2");
    await act(s, "stop");

    const stored = await storedAnswers(s);
    expect(Object.keys(stored).sort()).toEqual(["q_eligible", "q_member_1", "q_member_2", "q_team"]);
  });

  it("replaces rather than duplicates when the new answer does arrive", async () => {
    const s = await open();
    await answer(s, "q_team", "Team Spark");
    await answer(s, "q_eligible", true);
    await answer(s, "q_member_1", "Aishwarya R Deshpande");
    await answer(s, "q_member_2", "Deekshitha M");
    await act(s, "edit", "q_member_2");
    const again = await answer(s, "q_member_2", "Radhika U J");

    expect(await storedAnswers(s)).toMatchObject({ q_member_2: JSON.stringify("Radhika U J") });
    // Straight back to the review, not back through the questions after it —
    // and counted once, so the response is not "4 of 3 answered".
    expect(again.awaitingSubmit).toBe(true);
  });
});

/**
 * The floor under finishing.
 *
 * `submit` completed unconditionally: it picked an ending and took it. Nothing
 * between the review card and a filed response ever asked whether the response
 * was actually complete, so any way of arriving at that button with a required
 * question blank — an undone screen-out, a stale card in a second tab — filed
 * it blank.
 */
describe("submitting with a required question still blank", () => {
  it("is refused, and asks the question instead", async () => {
    const s = await open();
    await answer(s, "q_team", "Team Spark");
    // Turned away, then taking it back: `undo_screen_out` genuinely retracts
    // the answer that refused them, which is how a live session legitimately
    // ends up short one required answer.
    await answer(s, "q_eligible", false);
    await act(s, "undo_screen_out");

    const sent = await act(s, "submit");
    expect(sent.complete).toBe(false);
    expect(sent.ending).toBeNull();
    expect(sent.question?.ref).toBe("q_eligible");
  });

  it("completes once nothing required is missing", async () => {
    const s = await open();
    await answer(s, "q_team", "Team Spark");
    await answer(s, "q_eligible", true);
    await answer(s, "q_member_1", "Aishwarya R Deshpande");
    await answer(s, "q_member_2", "Deekshitha M");

    const sent = await act(s, "submit");
    expect(sent.complete).toBe(true);
    expect(sent.ending?.ref).toBe("end_thanks");
  });
});

/**
 * A required question does not take a space bar for an answer.
 *
 * The emptiness gate ran before the trim, so `" "` cleared it and came back as
 * a valid `""` — an answered question holding nothing, which the results table
 * then renders as "Not answered", which is the one thing it was supposed to
 * mean something else.
 */
describe("whitespace offered to a required question", () => {
  it("is refused as missing", async () => {
    const s = await open();
    await answer(s, "q_team", "Team Spark");
    await answer(s, "q_eligible", true);
    const turn = await answer(s, "q_member_1", "   ");

    expect(turn.validation?.code).toBe("required");
    expect(turn.question?.ref).toBe("q_member_1");
    expect(await storedAnswers(s)).not.toHaveProperty("q_member_1");
  });
});

/**
 * The questions are written down, not just streamed.
 *
 * `emitMessage` sent text to the respondent and `appendMessage` stored it, and
 * seven of the fourteen callers only did the first — every one of them on the
 * deterministic path. So a conversation in template mode, or one that had spent
 * its phrasing budget partway through, produced a transcript of answers with no
 * questions above them.
 */
describe("a conversation conducted in template mode", () => {
  it("stores the questions it asked, not only the answers it got", async () => {
    const s = await open();
    await answer(s, "q_team", "Team Spark");
    await answer(s, "q_eligible", true);
    await answer(s, "q_member_1", "Aishwarya R Deshpande");
    await answer(s, "q_member_2", "Deekshitha M");
    await act(s, "submit");

    const said = (await storedTranscript(s)).filter((m) => m.role === "assistant").map((m) => m.content);
    for (const title of ["What is your team name?", "Are all of you currently enrolled?", "Team member 1", "Team member 2"]) {
      expect(said.some((c) => c.includes(title))).toBe(true);
    }
  });

  it("keeps them in order with the answers they asked for", async () => {
    const s = await open();
    await answer(s, "q_team", "Team Spark");
    await answer(s, "q_eligible", true);
    await answer(s, "q_member_1", "Aishwarya R Deshpande");
    await answer(s, "q_member_2", "Deekshitha M");
    await act(s, "submit");

    const roles = (await storedTranscript(s)).map((m) => m.role);
    // Whatever else is in there, no two answers sit next to each other with
    // nothing asked in between — which is exactly what the broken transcript
    // looked like.
    for (let i = 1; i < roles.length; i += 1) {
      expect(roles[i] === "user" && roles[i - 1] === "user").toBe(false);
    }
  });
});
