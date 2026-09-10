import { describe, it, expect, beforeAll } from "vitest";
import { env } from "cloudflare:test";
import { applySchema, seedTenant, seedKey, fetchApi, type Tenant } from "./helpers.js";

/**
 * A form that turns somebody away, end to end.
 *
 * The bug this pins: a branch could work out that a respondent must not submit
 * and had nowhere to send them but the thank-you, so a team that had just
 * declared itself ineligible was shown "Registration Submitted Successfully"
 * and counted as a completed response. Every assertion here is one half of
 * that — what the respondent is shown, and what the row says afterwards.
 *
 * Driven over `/v1` in template mode, so there is no model in the loop and the
 * transitions are the state machine's own.
 */

let t: Tenant;
let key: string;

const CONSENT_TEXT = "I agree to the code of conduct.";

/** `requireSubmit` is ON, because a screen-out has to skip the review step. */
const DOC = {
  schemaVersion: 4,
  title: "Hackathon registration",
  blocks: [
    { id: "blk_so_size1", ref: "q_size", type: "number", title: "How many people are on your team?", required: true, min: 1 },
    {
      id: "blk_so_cond1",
      ref: "q_conduct",
      type: "legal_consent",
      title: "Our code of conduct",
      required: true,
      consentText: CONSENT_TEXT,
      allowDecline: true,
    },
    { id: "blk_so_why01", ref: "q_project", type: "short_text", title: "What are you building?", required: false, minLength: 0, maxLength: 200 },
  ],
  endings: [
    { id: "end_so_ok01", ref: "end_thanks", title: "You're registered", bodyMd: "See you Friday." },
    {
      id: "end_so_no01",
      ref: "end_ineligible",
      title: "You can't submit this registration",
      bodyMd: "Sort the points below out and start again.",
      kind: "screen_out",
      requirements: [
        { id: "req_so_size1", label: "A team of 2 to 5 people", when: { op: "and", conditions: [{ left: { kind: "ref", ref: "q_size" }, op: "gt", value: 5 }], groups: [] } },
        { id: "req_so_cond1", label: "Agreement to the code of conduct", when: { op: "and", conditions: [{ left: { kind: "ref", ref: "q_conduct" }, op: "is_not_checked" }], groups: [] } },
      ],
    },
  ],
  logic: [
    {
      id: "rl_so_big001",
      action_kind: "goto",
      from: "q_size",
      when: { op: "and", conditions: [{ left: { kind: "ref", ref: "q_size" }, op: "gt", value: 5 }], groups: [] },
      target: "end_ineligible",
      targetKind: "ending",
    },
    {
      id: "rl_so_dec001",
      action_kind: "goto",
      from: "q_conduct",
      when: { op: "and", conditions: [{ left: { kind: "ref", ref: "q_conduct" }, op: "is_not_checked" }], groups: [] },
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
    .bind(`sub_so_${orgId}`, orgId, `dodo_so_${orgId}`, Date.now() - 1000, Date.now() + 86_400_000 * 20, Date.now(), Date.now())
    .run();
  await invalidateEntitlements(env as never, orgId);
}

const api = (path: string, init: RequestInit = {}) =>
  fetchApi(path, {
    ...init,
    headers: { "x-api-key": key, "content-type": "application/json", ...(init.headers as Record<string, string>) },
  });

async function publish(doc: unknown, versionId: string, formId: string, userId: string) {
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

interface TurnResult {
  accepted: boolean;
  complete: boolean;
  awaitingSubmit: boolean;
  question: { ref: string } | null;
  ending: { ref: string; kind?: string; requirements?: string[]; title: string } | null;
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

const rowFor = (sessionId: string) =>
  env.DB.prepare(`SELECT status, completed_at, json_extract(meta, '$.endingRef') AS ending FROM submissions WHERE session_id = ?`)
    .bind(sessionId)
    .first<{ status: string; completed_at: number | null; ending: string | null }>();

beforeAll(async () => {
  await applySchema();
  t = await seedTenant("screenout");
  await subscribePro(t.orgId);
  // The response API needs `response:write` on top of the session scopes; the
  // conversation and the headless path are both driven from this one key.
  key = (
    await seedKey(t, "screenoutkey", {
      scopes: { form: ["read"], response: ["read", "write"], session: ["create", "write", "read"] },
    })
  ).raw;
  await publish(DOC, "ver_screenout", t.formId, t.userId);
});

describe("a respondent who declines a consent", () => {
  it("is routed to the screen-out rather than the thank-you", async () => {
    const s = await open();
    await answer(s, "q_size", 3);
    const turn = await answer(s, "q_conduct", false);

    expect(turn.accepted).toBe(true);
    expect(turn.validation).toBeNull();
    expect(turn.ending?.ref).toBe("end_ineligible");
    expect(turn.ending?.kind).toBe("screen_out");
  });

  it("skips the review step even though the form asks for an explicit submit", async () => {
    const s = await open();
    await answer(s, "q_size", 3);
    const turn = await answer(s, "q_conduct", false);

    // "Review your answers and submit" in front of a refusal is a button that
    // promises something the form has already decided against.
    expect(turn.awaitingSubmit).toBe(false);
    expect(turn.events.map((e) => e.type)).not.toContain("review");
    expect(turn.events.map((e) => e.type)).toContain("ending");
    expect(turn.complete).toBe(true);
  });

  it("is shown only the requirement it actually missed", async () => {
    const s = await open();
    await answer(s, "q_size", 3);
    const turn = await answer(s, "q_conduct", false);

    // The team of three met the size requirement, so being told otherwise is
    // exactly the failure the conditions exist to prevent.
    expect(turn.ending?.requirements).toEqual(["Agreement to the code of conduct"]);
  });

  it("is recorded as screened out, not as a completion", async () => {
    const s = await open();
    await answer(s, "q_size", 3);
    await answer(s, "q_conduct", false);

    const row = await rowFor(s);
    expect(row?.status).toBe("disqualified");
    expect(row?.ending).toBe("end_ineligible");
    // Terminal at a definite moment, unlike an abandonment.
    expect(row?.completed_at).toBeGreaterThan(0);
  });

  it("keeps the refusal in the answers, with the wording it refused", async () => {
    const s = await open();
    await answer(s, "q_size", 3);
    await answer(s, "q_conduct", false);

    const row = await rowFor(s);
    const answers = await env.DB.prepare(
      `SELECT value_json FROM submission_answers a
        JOIN submissions s ON s.id = a.submission_id
       WHERE s.session_id = ? AND a.block_ref = 'q_conduct'`,
    )
      .bind(s)
      .first<{ value_json: string }>();
    expect(row?.status).toBe("disqualified");
    const value = JSON.parse(answers!.value_json) as { accepted: boolean; textSha256: string };
    expect(value.accepted).toBe(false);
    expect(value.textSha256).toHaveLength(64);
  });
});

describe("a respondent screened out by a number", () => {
  it("never reaches the questions below the gate", async () => {
    const s = await open();
    const turn = await answer(s, "q_size", 9);

    expect(turn.ending?.ref).toBe("end_ineligible");
    expect(turn.question).toBeNull();
    const row = await rowFor(s);
    expect(row?.status).toBe("disqualified");
  });

  it("is shown the size requirement and not the consent one", async () => {
    const s = await open();
    const turn = await answer(s, "q_size", 9);
    // The consent was never asked, so `is_not_checked` on it is technically
    // true — and listing it would tell somebody they failed to agree to
    // something they were never shown.
    expect(turn.ending?.requirements).toEqual(["A team of 2 to 5 people"]);
  });
});

describe("a respondent who qualifies", () => {
  it("still gets the review step, then a completed response", async () => {
    const s = await open();
    await answer(s, "q_size", 3);
    const consented = await answer(s, "q_conduct", true);
    const last = await answer(s, "q_project", "A better kettle");

    expect(consented.ending).toBeNull();
    // Parked at the review step. The headless contract names the ending it
    // WILL reach on submit — that is what `awaitingSubmit` distinguishes it
    // from — so the thing to assert is that nothing has finished yet.
    expect(last.awaitingSubmit).toBe(true);
    expect(last.complete).toBe(false);
    expect(last.ending?.ref).toBe("end_thanks");
    expect(await rowFor(s)).toMatchObject({ status: "in_progress" });

    const submit = await api(`/v1/sessions/${s}/actions`, {
      method: "POST",
      body: JSON.stringify({ action: "submit" }),
    });
    const done = (await submit.json()) as TurnResult;
    expect(done.ending?.ref).toBe("end_thanks");
    expect(done.ending?.kind).toBe("success");

    const row = await rowFor(s);
    expect(row?.status).toBe("completed");
  });
});

/**
 * The same outcome, driven with no conversation at all.
 *
 * "One event contract, two transports" — a response the API completes onto a
 * `screen_out` ending has been refused exactly as one that got there through
 * the interview, and the endpoint used to hardcode `status: "completed"`.
 */
describe("the same form driven over the response API", () => {
  const openResponse = async (): Promise<string> => {
    const res = await api(`/v1/forms/${t.formId}/responses`, { method: "POST", body: "{}" });
    return ((await res.json()) as { id: string }).id;
  };
  const put = (id: string, ref: string, value: unknown) =>
    api(`/v1/responses/${id}/answers`, { method: "POST", body: JSON.stringify({ ref, value }) });

  it("records a refused response as disqualified, not completed", async () => {
    const id = await openResponse();
    await put(id, "q_size", 3);
    await put(id, "q_conduct", false);

    const res = await api(`/v1/responses/${id}/complete`, { method: "POST", body: "{}" });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; ending: { ref: string; kind: string; requirements: string[] } };
    expect(body.status).toBe("disqualified");
    expect(body.ending.ref).toBe("end_ineligible");
    expect(body.ending.kind).toBe("screen_out");
    expect(body.ending.requirements).toEqual(["Agreement to the code of conduct"]);
  });

  it("still records an accepted response as completed", async () => {
    const id = await openResponse();
    await put(id, "q_size", 3);
    await put(id, "q_conduct", true);

    const res = await api(`/v1/responses/${id}/complete`, { method: "POST", body: "{}" });
    const body = (await res.json()) as { status: string; ending: { ref: string; kind: string } };
    expect(body.status).toBe("completed");
    expect(body.ending.kind).toBe("success");
  });

  it("honours an explicitly named screen-out", async () => {
    const id = await openResponse();
    await put(id, "q_size", 3);
    await put(id, "q_conduct", true);

    const res = await api(`/v1/responses/${id}/complete`, {
      method: "POST",
      body: JSON.stringify({ endingRef: "end_ineligible" }),
    });
    const body = (await res.json()) as { status: string };
    expect(body.status).toBe("disqualified");
  });
});

/**
 * Taking a refusal back.
 *
 * A screen-out is a rule failing, and the ordinary way to fail one is to tap
 * the wrong chip: "No, we don't have two women on the team" answered by
 * somebody who does. Until `undo_screen_out` existed that cost them the whole
 * form — the card said what was wrong and offered nothing to do about it, and
 * reloading only brought the same card back, because the session was terminal.
 *
 * So the refusal is reversible in exactly one direction: back to the question
 * that caused it, with that answer discarded and every other one kept.
 */
describe("a respondent who was screened out by mistake", () => {
  const act = (sessionId: string, action: string) =>
    api(`/v1/sessions/${sessionId}/actions`, { method: "POST", body: JSON.stringify({ action }) });

  it("is put back on the question that refused them", async () => {
    const s = await open();
    await answer(s, "q_size", 3);
    await answer(s, "q_conduct", false);

    const res = await act(s, "undo_screen_out");
    expect(res.status).toBe(200);
    const turn = (await res.json()) as TurnResult;
    expect(turn.accepted).toBe(true);
    expect(turn.question?.ref).toBe("q_conduct");
    expect(turn.ending).toBeNull();
    expect(turn.complete).toBe(false);
  });

  it("keeps everything they answered before it", async () => {
    const s = await open();
    await answer(s, "q_size", 3);
    await answer(s, "q_conduct", false);
    await act(s, "undo_screen_out");

    // The whole point of not calling this "start over": three answers in, one
    // wrong tap must not cost the other two.
    const rows = await env.DB.prepare(
      `SELECT a.block_ref FROM submission_answers a
         JOIN submissions s ON s.id = a.submission_id
        WHERE s.session_id = ?`,
    )
      .bind(s)
      .all<{ block_ref: string }>();
    const refs = (rows.results ?? []).map((r) => r.block_ref);
    expect(refs).toContain("q_size");
    // The retracted one is gone, not merely overwritten later.
    expect(refs).not.toContain("q_conduct");
  });

  it("puts the response row back to in_progress", async () => {
    const s = await open();
    await answer(s, "q_size", 3);
    await answer(s, "q_conduct", false);
    expect(await rowFor(s)).toMatchObject({ status: "disqualified" });

    await act(s, "undo_screen_out");

    const row = await rowFor(s);
    expect(row?.status).toBe("in_progress");
    // A response that is open again must not still claim a moment it ended,
    // or the results table reports a completion time for a live conversation.
    expect(row?.completed_at).toBeNull();
    expect(row?.ending).toBeNull();
  });

  it("puts the chat session row back to active as well", async () => {
    const s = await open();
    await answer(s, "q_size", 9);
    await act(s, "undo_screen_out");

    // The `allowResubmissions` gate reads this column. A live conversation
    // still claiming to be a finished one locks its own respondent out of the
    // form they are in the middle of.
    const row = await env.DB.prepare(`SELECT status FROM chat_sessions WHERE id = ?`)
      .bind(s)
      .first<{ status: string }>();
    expect(row?.status).toBe("active");
  });

  it("can then finish the form properly", async () => {
    const s = await open();
    await answer(s, "q_size", 3);
    await answer(s, "q_conduct", false);
    await act(s, "undo_screen_out");

    const fixed = await answer(s, "q_conduct", true);
    // `resumeAfterEdit` walks forward rather than re-asking the tail, so the
    // next thing wanted is the one question still unanswered.
    expect(fixed.question?.ref).toBe("q_project");

    const last = await answer(s, "q_project", "A better kettle");
    expect(last.awaitingSubmit).toBe(true);

    const submit = await act(s, "submit");
    const done = (await submit.json()) as TurnResult;
    expect(done.ending?.ref).toBe("end_thanks");
    expect(await rowFor(s)).toMatchObject({ status: "completed" });
  });

  it("is refused on a response that was accepted", async () => {
    const s = await open();
    await answer(s, "q_size", 3);
    await answer(s, "q_conduct", true);
    await answer(s, "q_project", "A better kettle");
    await act(s, "submit");
    expect(await rowFor(s)).toMatchObject({ status: "completed" });

    // Only a refusal is reversible. A completion is the respondent's own
    // decision and reopening it would un-submit a response the owner has
    // already been told about.
    const res = await act(s, "undo_screen_out");
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe("not_screened_out");
    expect(await rowFor(s)).toMatchObject({ status: "completed" });
  });

  it("is refused twice over — the second undo has nothing to undo", async () => {
    const s = await open();
    await answer(s, "q_size", 9);
    expect((await act(s, "undo_screen_out")).status).toBe(200);

    const again = await act(s, "undo_screen_out");
    expect(again.status).toBe(400);
    expect(await rowFor(s)).toMatchObject({ status: "in_progress" });
  });
});
