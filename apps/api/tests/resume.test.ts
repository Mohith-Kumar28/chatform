import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { applySchema, seedTenant, fetchApi, type Tenant } from "./helpers.js";
import { mintEmailToken } from "../src/lib/signed-url.js";
import { RESUME_TTL_DAYS } from "../src/lib/followups.js";
import { sha256Hex } from "@repo/form-schema";
import type { Bindings } from "../src/env.js";

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
    // A finished session from the same address is exactly what the rule refuses.
    const IP = "203.0.113.7";
    await open({}, IP);
    await env.DB.prepare(`UPDATE chat_sessions SET status = 'completed' WHERE ip_hash = ?1`)
      .bind(sha256Hex(IP))
      .run();
    const blocked = await open({}, IP);
    expect(blocked.status).toBe(409);

    const resumed = await open({ resumeToken: await token("sbm_resume09") }, IP);
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
