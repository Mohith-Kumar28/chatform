import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { applySchema, seedTenant, fetchApi, type Tenant } from "./helpers.js";
import { mintEmailToken } from "../src/lib/signed-url.js";
import { RESUME_TTL_DAYS } from "../src/lib/followups.js";
import { sha256Hex } from "@repo/form-schema";
import type { Bindings } from "../src/env.js";
import type { SessionDO } from "../src/do/session-do.js";

/**
 * Coming back to a response you abandoned.
 *
 * This is the half of follow-ups that nobody else in the category has: every
 * competitor that can email an abandoner keeps the partial answers in that
 * browser's `localStorage`, so the link in the email lands on an empty form
 * whenever it is opened on a different device — which is most of the time.
 *
 * The behaviour worth pinning is therefore not "the token verifies" but "the
 * same response continues": one submission id, the answers still attached, and
 * the conversation sitting on the question they actually stopped on.
 */

let t: Tenant;
const VERSION_ID = "ver_resume01";
const SLUG = "resume-form";

const DOC = {
  schemaVersion: 4,
  title: "Resume me",
  blocks: [
    { id: "blk_res00001", ref: "q_name", type: "short_text", title: "Your name?", required: true, minLength: 0, maxLength: 80 },
    { id: "blk_res00002", ref: "q_email", type: "email", title: "Your email?", required: true },
    { id: "blk_res00003", ref: "q_team", type: "short_text", title: "Team size?", required: true, minLength: 0, maxLength: 80 },
  ],
  endings: [{ id: "end_res00001", ref: "end_thanks", title: "All done!", bodyMd: "Thanks." }],
  logic: [],
  endingRules: [],
  variables: [],
  hiddenFields: [],
  layout: {},
  // Template mode keeps every turn deterministic and model-free.
  settings: { agent: { mode: "template" }, followUp: { enabled: true } },
  theme: {},
};

async function publish(settings: Record<string, unknown> = DOC.settings): Promise<void> {
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare(
      `INSERT OR REPLACE INTO form_versions (id, form_id, version, schema_json, checksum, published_at, created_by, created_at)
       VALUES (?1, ?2, 1, ?3, 'ck', ?4, ?5, ?4)`,
    ).bind(VERSION_ID, t.formId, JSON.stringify({ ...DOC, settings }), now, t.userId),
    env.DB.prepare(
      `UPDATE forms SET slug = ?, status = 'published', active_version_id = ? WHERE id = ?`,
    ).bind(SLUG, VERSION_ID, t.formId),
  ]);
}

/** An abandoned response that got through the first two questions. */
async function seedAbandoned(id: string, status = "abandoned"): Promise<void> {
  const now = Date.now();
  await env.DB.prepare(
    `INSERT INTO submissions (id, form_id, form_version_id, organization_id, status, source, is_test, started_at, updated_at, active_ms)
     VALUES (?, ?, ?, ?, ?, 'chat', 0, ?, ?, 60000)`,
  )
    .bind(id, t.formId, VERSION_ID, t.orgId, status, now - 3_600_000, now - 3_600_000)
    .run();
  const answers: [string, string, unknown][] = [
    ["q_name", "short_text", "Maya"],
    ["q_email", "email", "maya@northwind.example"],
  ];
  for (const [ref, type, value] of answers) {
    await env.DB.prepare(
      `INSERT INTO submission_answers (id, submission_id, form_id, block_ref, block_type, value_json, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(`ans_${id}_${ref}`, id, t.formId, ref, type, JSON.stringify(value), now)
      .run();
  }
}

const open = (body: Record<string, unknown>, ip?: string) =>
  fetchApi(`/p/forms/${SLUG}/sessions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      // The resubmission rule hashes this header; without it the rule is inert
      // and the test that depends on it would pass for the wrong reason.
      ...(ip ? { "cf-connecting-ip": ip } : {}),
    },
    body: JSON.stringify(body),
  });

async function token(submissionId: string, days = RESUME_TTL_DAYS): Promise<string> {
  return mintEmailToken(env as unknown as Bindings, "resume", submissionId, days);
}

beforeAll(async () => {
  await applySchema();
  t = await seedTenant("resume");
  await publish();
});

beforeEach(async () => {
  await env.DB.prepare(`DELETE FROM followups`).run();
  await env.DB.prepare(`DELETE FROM email_suppressions`).run();
  await env.DB.prepare(`DELETE FROM submission_answers`).run();
  await env.DB.prepare(`DELETE FROM submissions`).run();
  await env.DB.prepare(`DELETE FROM chat_sessions`).run();
});

describe("resuming with a valid token", () => {
  it("continues the same response instead of starting a new one", async () => {
    await seedAbandoned("sbm_resume01");
    const res = await open({ resumeToken: await token("sbm_resume01") });
    expect(res.status).toBe(200);
    const { sessionId } = (await res.json()) as { sessionId: string };

    // The new session is bound to the response that already existed…
    const session = await env.DB.prepare(`SELECT submission_id FROM chat_sessions WHERE id = ?`)
      .bind(sessionId)
      .first<{ submission_id: string | null }>();
    expect(session?.submission_id).toBe("sbm_resume01");

    // …which is live again, and is still the only one.
    const subs = await env.DB.prepare(`SELECT id, status FROM submissions`).all<{ id: string; status: string }>();
    expect(subs.results).toHaveLength(1);
    expect(subs.results?.[0]).toMatchObject({ id: "sbm_resume01", status: "in_progress" });
  });

  it("keeps the answers they already gave", async () => {
    await seedAbandoned("sbm_resume02");
    await open({ resumeToken: await token("sbm_resume02") });
    const answers = await env.DB.prepare(
      `SELECT block_ref FROM submission_answers WHERE submission_id = ? ORDER BY block_ref`,
    )
      .bind("sbm_resume02")
      .all<{ block_ref: string }>();
    expect(answers.results?.map((r) => r.block_ref)).toEqual(["q_email", "q_name"]);
  });

  it("cancels the rest of the sequence, so nobody is nagged mid-conversation", async () => {
    await seedAbandoned("sbm_resume03");
    await env.DB.prepare(
      `INSERT INTO followups (id, submission_id, form_id, organization_id, channel, address, address_source,
                              step, status, scheduled_at, created_at)
       VALUES ('flw_r3', 'sbm_resume03', ?, ?, 'email', 'maya@northwind.example', 'answer', 2, 'scheduled', ?, ?)`,
    )
      .bind(t.formId, t.orgId, Date.now() + 86_400_000, Date.now())
      .run();

    await open({ resumeToken: await token("sbm_resume03") });

    const row = await env.DB.prepare(`SELECT status, reason FROM followups WHERE id = 'flw_r3'`)
      .first<{ status: string; reason: string | null }>();
    expect(row).toMatchObject({ status: "cancelled", reason: "resumed" });
  });

  it("survives being opened twice — a scanner pre-fetch must not spend the link", async () => {
    await seedAbandoned("sbm_resume04");
    const tok = await token("sbm_resume04");
    // Corporate mail security fetches URLs before the human sees them. A
    // single-use token would leave the recipient with a dead link.
    const first = await open({ resumeToken: tok });
    const second = await open({ resumeToken: tok });
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    const subs = await env.DB.prepare(`SELECT COUNT(*) AS n FROM submissions`).first<{ n: number }>();
    expect(subs?.n).toBe(1);
  });
});

describe("resuming a response the form has since outgrown", () => {
  /**
   * The answers were given to a version whose questions no longer exist.
   *
   * `resolveNext` already does the right thing with them — nothing routes to a
   * ref the document does not have, so the respondent lands on question one —
   * but they were still being *counted*, and the count is what a deferred
   * sign-in gate reads. A public demo republished with a new set of questions
   * met every returning visitor with the sign-in card in front of question one,
   * progress bar reading 0%.
   */
  async function seedStale(id: string): Promise<void> {
    const now = Date.now();
    await env.DB.prepare(
      `INSERT INTO submissions (id, form_id, form_version_id, organization_id, status, source, is_test, started_at, updated_at, active_ms)
       VALUES (?, ?, ?, ?, 'abandoned', 'chat', 0, ?, ?, 60000)`,
    )
      .bind(id, t.formId, VERSION_ID, t.orgId, now - 3_600_000, now - 3_600_000)
      .run();
    for (const ref of ["q_gone_one", "q_gone_two", "q_gone_three"]) {
      await env.DB.prepare(
        `INSERT INTO submission_answers (id, submission_id, form_id, block_ref, block_type, value_json, updated_at)
         VALUES (?, ?, ?, ?, 'short_text', ?, ?)`,
      )
        .bind(`ans_${id}_${ref}`, id, t.formId, ref, JSON.stringify("from an older version"), now)
        .run();
    }
  }

  it("does not count answers to questions this version no longer asks", async () => {
    await publish({ ...DOC.settings, requireAuth: { enabled: true, method: "google", afterBlocks: 3 } });
    await seedStale("sbm_resume20");
    const res = await open({ resumeToken: await token("sbm_resume20") });
    expect(res.status).toBe(200);
    const { sessionId } = (await res.json()) as { sessionId: string };

    const stub = env.SESSION_DO.get(env.SESSION_DO.idFromName(sessionId)) as unknown as DurableObjectStub<SessionDO>;
    const status = await stub.getStatus();
    // Three orphaned answers, a gate set to close after three: counted raw,
    // this is a sign-in card in front of question one.
    expect(status?.collected).toBe(0);
    expect(status?.currentRef).toBe("q_name");

    const { events } = await stub.eventsSince(0);
    expect(events.map((e) => e.type)).not.toContain("auth_required");
    await publish();
  });

  /**
   * The gate is silent for somebody who arrives already verified — that is the
   * point of carrying the identity forward — and silence used to be all the
   * respondent got. `auth_verified` announces a sign-in as it happens, so a
   * session that never signs in never emits one, and the form gave no sign of
   * who was answering it or that anyone was signed in at all.
   *
   * `session_ready` is per connection, so it answers that on the first frame
   * and again after every reload, however old the conversation is.
   */
  it("tells the connecting client who the resumed session already is", async () => {
    await publish({ ...DOC.settings, requireAuth: { enabled: true, method: "google" } });
    await seedAbandoned("sbm_resume22");
    await env.DB.prepare(
      `UPDATE submissions
          SET respondent_provider = 'google', respondent_subject = 'sub_maya',
              respondent_email = 'maya@northwind.example', respondent_name = 'Maya'
        WHERE id = ?`,
    )
      .bind("sbm_resume22")
      .run();

    const res = await open({ resumeToken: await token("sbm_resume22") });
    expect(res.status).toBe(200);
    const { sessionId } = (await res.json()) as { sessionId: string };

    const stub = env.SESSION_DO.get(env.SESSION_DO.idFromName(sessionId)) as unknown as DurableObjectStub<SessionDO>;
    const ready = await readReady(await stub.stream());
    expect(ready.identity).toEqual({
      provider: "google",
      label: "maya@northwind.example",
      name: "Maya",
      pictureUrl: null,
    });
    await publish();
  });

  /**
   * What a returning respondent actually wants back is the thread.
   *
   * The summary line this replaces — "you'd already answered 2 questions" —
   * asked them to take the form's word for what they had said. The questions
   * and their answers, printed as ordinary chat, are the same information in
   * the form they already know how to read, and each answer arrives carrying
   * its `blockRef`, which is what puts "change this answer" on the bubble.
   */
  it("replays the earlier questions and answers as ordinary chat", async () => {
    await publish();
    await seedAbandoned("sbm_resume23");
    const res = await open({ resumeToken: await token("sbm_resume23") });
    const { sessionId } = (await res.json()) as { sessionId: string };
    const stub = env.SESSION_DO.get(env.SESSION_DO.idFromName(sessionId)) as unknown as DurableObjectStub<SessionDO>;
    const frames = await readFrames(await stub.stream());

    // The thread reads exactly as it did before they left, with the question
    // they stopped on at the bottom of it.
    const said = frames.filter((f) => f.event === "token").map((f) => (f.data as { delta: string }).delta);
    expect(said).toEqual(["Your name?", "Your email?", "Team size?"]);

    const answers = frames
      .filter((f) => f.event === "user_message")
      .map((f) => f.data as { text: string; blockRef: string });
    expect(answers).toEqual([
      { messageId: expect.any(String), text: "Maya", blockRef: "q_name" },
      { messageId: expect.any(String), text: "maya@northwind.example", blockRef: "q_email" },
    ]);

    // No banner, no count, no "welcome back" — and the conversation is sitting
    // on the question they actually stopped on, under the replayed thread.
    expect(JSON.stringify(frames)).not.toContain("Welcome back");
    const question = frames.findLast((f) => f.event === "question");
    expect((question?.data as { block: { ref: string } }).block.ref).toBe("q_team");
  });

  it("greets them as a new arrival rather than welcoming them back", async () => {
    // Republished without the gate, so what is under test is the greeting and
    // not whatever the previous test left in `settings`.
    await publish();
    await seedStale("sbm_resume21");
    const res = await open({ resumeToken: await token("sbm_resume21") });
    const { sessionId } = (await res.json()) as { sessionId: string };
    const stub = env.SESSION_DO.get(env.SESSION_DO.idFromName(sessionId)) as unknown as DurableObjectStub<SessionDO>;
    // The opening line lives in the transcript, not in the event stream: it is
    // written by `appendMessage` before the first question is put.
    const said = (await stub.getTranscript()).map((m) => m.content).join("\n");
    expect(said).not.toContain("Welcome back");
    expect(said).not.toContain("pick up");
  });
});

describe("resuming when it should not work", () => {
  it("starts a fresh session for a token that does not verify", async () => {
    await seedAbandoned("sbm_resume05");
    const res = await open({ resumeToken: "sbm_resume05.9999999999.deadbeefdeadbeefdeadbeefdeadbeef" });
    expect(res.status).toBe(200);
    const { sessionId } = (await res.json()) as { sessionId: string };
    const session = await env.DB.prepare(`SELECT submission_id FROM chat_sessions WHERE id = ?`)
      .bind(sessionId)
      .first<{ submission_id: string | null }>();
    // Degraded to an ordinary session rather than an error page: a respondent
    // who clicked a link in an email can do nothing with "invalid token".
    expect(session?.submission_id).toBeNull();
    const sub = await env.DB.prepare(`SELECT status FROM submissions WHERE id = 'sbm_resume05'`)
      .first<{ status: string }>();
    expect(sub?.status).toBe("abandoned");
  });

  it("ignores an expired token", async () => {
    await seedAbandoned("sbm_resume06");
    const res = await open({ resumeToken: await token("sbm_resume06", -1) });
    const { sessionId } = (await res.json()) as { sessionId: string };
    const session = await env.DB.prepare(`SELECT submission_id FROM chat_sessions WHERE id = ?`)
      .bind(sessionId)
      .first<{ submission_id: string | null }>();
    expect(session?.submission_id).toBeNull();
  });

  it("refuses to reopen a response that was already completed", async () => {
    await seedAbandoned("sbm_resume07", "completed");
    const res = await open({ resumeToken: await token("sbm_resume07") });
    const { sessionId } = (await res.json()) as { sessionId: string };
    const session = await env.DB.prepare(`SELECT submission_id FROM chat_sessions WHERE id = ?`)
      .bind(sessionId)
      .first<{ submission_id: string | null }>();
    expect(session?.submission_id).toBeNull();
    const sub = await env.DB.prepare(`SELECT status FROM submissions WHERE id = 'sbm_resume07'`)
      .first<{ status: string }>();
    expect(sub?.status).toBe("completed");
  });

  it("will not resume a response belonging to a different form", async () => {
    const now = Date.now();
    await env.DB.prepare(
      `INSERT OR IGNORE INTO forms (id, organization_id, workspace_id, created_by, title, slug, status,
                                    working_schema, fingerprint_salt, created_at, updated_at)
       VALUES ('frm_other01', ?, ?, ?, 'Other', 'other-form', 'published', '{}', 'salt', ?, ?)`,
    )
      .bind(t.orgId, t.workspaceId, t.userId, now, now)
      .run();
    await seedAbandoned("sbm_resume08");
    await env.DB.prepare(`UPDATE submissions SET form_id = 'frm_other01' WHERE id = 'sbm_resume08'`).run();
    const res = await open({ resumeToken: await token("sbm_resume08") });
    const { sessionId } = (await res.json()) as { sessionId: string };
    const session = await env.DB.prepare(`SELECT submission_id FROM chat_sessions WHERE id = ?`)
      .bind(sessionId)
      .first<{ submission_id: string | null }>();
    expect(session?.submission_id).toBeNull();
  });
});

describe("the gates a resume may and may not walk through", () => {
  it("is not blocked by the resubmission rule it would otherwise trip", async () => {
    await publish({ ...DOC.settings, allowResubmissions: false });
    await seedAbandoned("sbm_resume09");
    /*
     * A finished session from the same *device* is exactly what the rule
     * refuses. It has to be the device: the rule no longer enforces on an
     * address, because an address is a network and the first person behind an
     * office NAT would close the form for the rest of it.
     */
    const IP = "203.0.113.7";
    const SIGNAL = "resumedevice1";
    await open({ deviceSignal: SIGNAL }, IP);
    await env.DB.prepare(`UPDATE chat_sessions SET status = 'completed' WHERE ip_hash = ?1`)
      .bind(sha256Hex(IP))
      .run();
    const blocked = await open({ deviceSignal: SIGNAL }, IP);
    expect(blocked.status).toBe(409);

    const resumed = await open({ resumeToken: await token("sbm_resume09"), deviceSignal: SIGNAL }, IP);
    expect(resumed.status).toBe(200);
    await publish();
  });

  it("is still blocked by a closed form", async () => {
    await publish({
      ...DOC.settings,
      closeRules: { closeAt: new Date(Date.now() - 1000).toISOString(), closedMessageMd: "Closed." },
    });
    await seedAbandoned("sbm_resume10");
    const res = await open({ resumeToken: await token("sbm_resume10") });
    expect(res.status).toBe(403);
    await publish();
  });

  it("is still blocked by a password", async () => {
    await publish({ ...DOC.settings, password: { enabled: true, value: "hunter2" } });
    await seedAbandoned("sbm_resume11");
    const res = await open({ resumeToken: await token("sbm_resume11") });
    // The link proves which response is theirs, not that the form is open to them.
    expect(res.status).toBe(401);
    await publish();
  });
});

/**
 * The `fu` parameter, end to end through the public route.
 *
 * The unit tests in `followups.test.ts` cover what `recordFollowUpClick` does
 * with an id. This covers the part that was missing entirely until now: that a
 * respondent clicking the link in an actual email causes the click to be
 * written at all.
 */
describe("follow-up attribution on resume", () => {
  async function seedFollowUp(id: string, submissionId: string, step = 1): Promise<void> {
    const now = Date.now();
    await env.DB.prepare(
      `INSERT INTO followups (id, submission_id, form_id, organization_id, channel, address,
                              address_source, step, status, scheduled_at, sent_at, created_at)
       VALUES (?, ?, ?, ?, 'email', 'maya@northwind.example', 'answer', ?, 'sent', ?, ?, ?)`,
    )
      .bind(id, submissionId, t.formId, t.orgId, step, now - 3_600_000, now - 3_600_000, now)
      .run();
  }

  it("records the click when the link carries its follow-up id", async () => {
    await seedAbandoned("sbm_resume_fu1");
    await seedFollowUp("flw_fu1", "sbm_resume_fu1");

    const res = await open({
      resumeToken: await token("sbm_resume_fu1"),
      followUpId: "flw_fu1",
    });
    expect(res.status).toBe(200);

    const row = await env.DB.prepare(`SELECT clicked_at, status FROM followups WHERE id = ?`)
      .bind("flw_fu1")
      .first<{ clicked_at: number | null; status: string }>();
    expect(row?.clicked_at).toBeGreaterThan(0);
    // And the rest of the sequence is still stopped — a click must not cost us
    // the cancel that keeps us from nagging somebody mid-answer.
    expect(row?.status).toBe("sent");
  });

  it("resumes normally when the id is absent, unknown, or another response's", async () => {
    await seedAbandoned("sbm_resume_fu2");
    await seedFollowUp("flw_fu2", "sbm_resume_fu2");
    // Belongs to a response this token says nothing about.
    await seedAbandoned("sbm_resume_fu3");
    await seedFollowUp("flw_fu3", "sbm_resume_fu3");

    for (const followUpId of [undefined, "flw_does_not_exist", "flw_fu3"]) {
      const res = await open({
        resumeToken: await token("sbm_resume_fu2"),
        ...(followUpId ? { followUpId } : {}),
      });
      // A bad id is never the respondent's fault and never a dead end: the form
      // opens and the answers come back either way.
      expect(res.status).toBe(200);
    }

    const other = await env.DB.prepare(`SELECT clicked_at FROM followups WHERE id = ?`)
      .bind("flw_fu3")
      .first<{ clicked_at: number | null }>();
    expect(other?.clicked_at).toBeNull();
  });
});

/**
 * One draft per person, enforced where rows are created.
 *
 * The reported sequence: sign in, wander off, come back, wander off again, and
 * end up with two half-finished responses in the results table standing for one
 * person's single attempt. It happened because nothing is written to
 * `submissions` until the first answer — so the second visit looked for a
 * response to carry on with, found none, and opened its own.
 */
describe("one response in progress per person", () => {
  const answer = (sessionId: string, respondentToken: string, ref: string, value: unknown) =>
    fetchApi(`/p/sessions/${sessionId}/messages`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-respondent-token": respondentToken },
      body: JSON.stringify({ type: "structured", ref, value }),
    });

  const openWith = async (body: Record<string, unknown>) => {
    const res = await open(body, "198.51.100.9");
    expect(res.status).toBe(200);
    return (await res.json()) as { sessionId: string; respondentToken: string };
  };

  const openRows = () =>
    env.DB.prepare(
      `SELECT id FROM submissions WHERE status IN ('in_progress','abandoned') ORDER BY started_at`,
    ).all<{ id: string }>();

  /*
   * Pins the invariant, not the mechanism — and it is honest to say that this
   * one already passed before `findOpenResponseId` existed, because
   * `findDeviceResumable` catches it at session open when the earlier row is
   * already written. It is here so that stays true.
   *
   * The case that needed the new check is the one this harness cannot reach: a
   * respondent who signed in and answered nothing, whose row is not written
   * until the idle alarm fires half an hour later and is therefore invisible to
   * every check that runs at session open. The matching rules that case depends
   * on are covered directly in `one-open-response.test.ts`.
   */
  it("continues the same draft when the same device comes back", async () => {
    const SIGNAL = "onedraftdevice";
    const first = await openWith({ deviceSignal: SIGNAL });
    await answer(first.sessionId, first.respondentToken, "q_name", "Maya");

    // A second visit from the same device — a new tab, a cleared session, an
    // embed whose storage the browser partitioned away.
    const second = await openWith({ deviceSignal: SIGNAL });
    await answer(second.sessionId, second.respondentToken, "q_name", "Maya");

    const rows = await openRows();
    expect(rows.results).toHaveLength(1);
  });

  it("still gives Start over a clean sheet", async () => {
    /*
     * The one case where reusing the draft would be wrong. "Start over" is a
     * respondent saying they want nothing to do with what they had, so writing
     * this session's answers into that row would hand back the very thing the
     * button exists to get rid of.
     */
    const SIGNAL = "startoverdevice";
    const first = await openWith({ deviceSignal: SIGNAL });
    await answer(first.sessionId, first.respondentToken, "q_name", "Maya");

    const fresh = await openWith({ deviceSignal: SIGNAL, fresh: true });
    await answer(fresh.sessionId, fresh.respondentToken, "q_name", "Someone else");

    const rows = await openRows();
    expect(rows.results).toHaveLength(2);
  });
});

/**
 * The `session_ready` payload, and then let go of the stream.
 *
 * The connection is deliberately endless — a ping every fifteen seconds keeps
 * it that way — so this reads only until the frame it came for and cancels,
 * rather than draining a body that has no end.
 */
async function readReady(res: Response): Promise<{ identity: unknown }> {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  try {
    for (let i = 0; i < 50; i++) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const frame = buf.split("\n\n").find((f) => f.includes("event: session_ready"));
      if (frame) {
        const line = frame.split("\n").find((l) => l.startsWith("data: "))!;
        return JSON.parse(line.slice(6)) as { identity: unknown };
      }
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  throw new Error("no session_ready frame arrived");
}

/** Every frame the stream replays on connect, up to the readiness signal. */
async function readFrames(res: Response): Promise<{ event: string; data: unknown }[]> {
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
  return buf
    .split("\n\n")
    .map((frame) => {
      const event = frame.split("\n").find((l) => l.startsWith("event: "))?.slice(7);
      const data = frame.split("\n").find((l) => l.startsWith("data: "))?.slice(6);
      return event && data ? { event, data: JSON.parse(data) as unknown } : null;
    })
    .filter((f): f is { event: string; data: unknown } => f !== null && f.event !== "session_ready");
}
