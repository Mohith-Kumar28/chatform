import { env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { applySchema, fetchApi, minimalDoc, seedTenant, type Tenant } from "./helpers.js";
import { FEEDBACK_DAILY_CAP } from "../src/lib/feedback.js";
import { runMailJob } from "../src/lib/mail-jobs.js";
import type { Bindings } from "../src/env.js";

/**
 * "Report a bug" — the respondent talking to us rather than to the customer.
 *
 * Three things have to hold, and each one is a different kind of wrong if it
 * does not: the report has to be attributed to the person rather than to the
 * browser (or the console cannot tell one upset respondent from five), the cap
 * has to be countable across sessions (or reloading the page buys another
 * three), and the session token has to be the only way in (or the table is an
 * open write endpoint on the public internet).
 */

let t: Tenant;
const SLUG = "bug-report-form";
const DB = () => env as unknown as Bindings;

async function publish(): Promise<void> {
  const formId = `frm_bugreport`;
  const versionId = `fv_bugreport`;
  // Template mode: a session that reaches the agent makes a real model call,
  // and nothing here is about the conversation.
  const doc = { ...minimalDoc("feedback"), settings: { agent: { mode: "template" } } };
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO forms (id, organization_id, workspace_id, created_by, title, slug, status, working_schema, fingerprint_salt, active_version_id, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, 'Bug report form', ?5, 'published', ?6, 'salt', ?7, ?8, ?8)`,
    ).bind(formId, t.orgId, t.workspaceId, t.userId, SLUG, JSON.stringify(doc), versionId, now),
    env.DB.prepare(
      `INSERT INTO form_versions (id, form_id, version, schema_json, checksum, published_at, created_by, created_at)
       VALUES (?1, ?2, 1, ?3, 'ck', ?4, ?5, ?4)`,
    ).bind(versionId, formId, JSON.stringify(doc), now, t.userId),
  ]);
}

/** A respondent arriving, optionally with the device signal a real browser sends. */
async function openSession(deviceSignal?: string): Promise<{ sessionId: string; respondentToken: string }> {
  const res = await fetchApi(`/p/forms/${SLUG}/sessions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(deviceSignal ? { deviceSignal } : {}),
  });
  expect(res.status).toBe(200);
  return res.json();
}

const send = (
  session: { sessionId: string; respondentToken: string },
  body: Record<string, unknown>,
  token?: string,
) =>
  fetchApi(`/p/sessions/${session.sessionId}/feedback`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-respondent-token": token ?? session.respondentToken,
      "user-agent": "Mozilla/5.0 (Test)",
    },
    body: JSON.stringify(body),
  });

beforeAll(async () => {
  await applySchema();
  t = await seedTenant("feedback");
  await publish();
});

describe("sending a report", () => {
  it("stores the rating, the note and where it came from", async () => {
    const s = await openSession("device-one");
    const res = await send(s, { rating: 5, message: "  The date picker is lovely.  " });
    expect(res.status).toBe(200);

    const row = await DB()
      .DB.prepare(`SELECT * FROM respondent_feedback WHERE session_id = ?`)
      .bind(s.sessionId)
      .first<Record<string, unknown>>();

    expect(row?.rating).toBe(5);
    // Trimmed on the way in: a note that is nothing but whitespace is no note.
    expect(row?.message).toBe("The date picker is lovely.");
    expect(row?.form_id).toBe("frm_bugreport");
    expect(row?.organization_id).toBe(t.orgId);
    expect(row?.user_agent).toBe("Mozilla/5.0 (Test)");
    // The person, not the browser: this is what lets two notes from one
    // respondent read as one voice.
    expect(row?.respondent_id).toBeTruthy();
  });

  it("takes a face with no words", async () => {
    const s = await openSession("device-wordless");
    expect((await send(s, { rating: 2 })).status).toBe(200);
    const row = await DB()
      .DB.prepare(`SELECT message FROM respondent_feedback WHERE session_id = ?`)
      .bind(s.sessionId)
      .first<{ message: string | null }>();
    expect(row?.message).toBeNull();
  });

  it("refuses a rating outside the five faces", async () => {
    const s = await openSession("device-range");
    expect((await send(s, { rating: 0 })).status).toBe(400);
    expect((await send(s, { rating: 6 })).status).toBe(400);
    expect((await send(s, { message: "no face" })).status).toBe(400);
  });

  it("refuses a report with the wrong session token", async () => {
    const s = await openSession("device-token");
    expect((await send(s, { rating: 3 }, "not-the-token")).status).toBe(401);
    const row = await DB()
      .DB.prepare(`SELECT COUNT(*) AS n FROM respondent_feedback WHERE session_id = ?`)
      .bind(s.sessionId)
      .first<{ n: number }>();
    expect(row?.n).toBe(0);
  });
});

describe("the daily cap", () => {
  it("allows three and refuses the fourth", async () => {
    const s = await openSession("device-capped");
    for (let i = 0; i < FEEDBACK_DAILY_CAP; i++) {
      expect((await send(s, { rating: 3, message: `note ${i}` })).status).toBe(200);
    }
    const refused = await send(s, { rating: 3, message: "one too many" });
    expect(refused.status).toBe(429);
    expect((await refused.json<{ error: { code: string } }>()).error.code).toBe("feedback_capped");
  });

  it("counts the person, not the session — a reload buys nothing", async () => {
    /*
      The whole reason the cap is keyed on the respondent. Two sessions, one
      browser: the second one is recognised as the same person when it opens,
      so the allowance it finds is the one the first session already spent.
    */
    const first = await openSession("device-shared");
    for (let i = 0; i < FEEDBACK_DAILY_CAP; i++) {
      expect((await send(first, { rating: 1, message: `first ${i}` })).status).toBe(200);
    }
    const second = await openSession("device-shared");
    expect(second.sessionId).not.toBe(first.sessionId);
    expect((await send(second, { rating: 1, message: "from a new session" })).status).toBe(429);
  });

  it("does not spend one person's allowance on another's", async () => {
    const other = await openSession("device-unrelated");
    expect((await send(other, { rating: 4 })).status).toBe(200);
  });
});

describe("the console", () => {
  it("shows the notes, the spread and the average", async () => {
    const admin = await seedTenant("fbadmin");
    (env as unknown as Record<string, string | undefined>).PLATFORM_ADMIN_EMAILS = "fbadmin@example.com";

    const res = await fetchApi("/api/admin/feedback?range=30d", { headers: { cookie: admin.cookie } });
    expect(res.status).toBe(200);
    const body = await res.json<{
      total: number;
      average: number | null;
      distribution: { rating: number; count: number }[];
      notes: { message: string | null; formTitle: string | null; rating: number }[];
    }>();

    expect(body.total).toBeGreaterThan(0);
    expect(body.average).not.toBeNull();
    // Five entries whatever happened, including the faces nobody picked.
    expect(body.distribution.map((d) => d.rating)).toEqual([1, 2, 3, 4, 5]);
    // Newest first, and joined back to the form so a report can be reproduced.
    expect(body.notes[0]?.formTitle).toBe("Bug report form");
    expect(body.notes.some((n) => n.message === "The date picker is lovely.")).toBe(true);
  });
});

/**
 * The report has to leave the building.
 *
 * A console nobody opens is where bug reports went to die before this — the
 * whole value of the feature is the minutes between a respondent hitting
 * something and a person knowing about it, so the mail is not a nicety on top
 * of the table, it is the point of writing the row.
 */
describe("telling the founders", () => {
  interface Captured {
    to: string;
    subject: string;
    html: string;
    text: string;
  }

  /** A `SendEmail` binding that records instead of sending — Miniflare has none. */
  function captureBinding(): { sent: Captured[]; binding: SendEmail } {
    const sent: Captured[] = [];
    const binding = {
      send: async (msg: unknown) => {
        sent.push(msg as Captured);
        return { messageId: `msg_${sent.length}` } as unknown as EmailSendResult;
      },
    } as unknown as SendEmail;
    return { sent, binding };
  }

  const withMail = (overrides: Partial<Bindings>): Bindings => ({ ...DB(), ...overrides });

  /** One stored report, written straight to the table — the route is covered above. */
  async function seedReport(id: string, rating: number, message: string | null): Promise<string> {
    await DB()
      .DB.prepare(
        `INSERT INTO respondent_feedback (id, respondent_id, session_id, form_id, organization_id, rating, message, source, user_agent, created_at)
         VALUES (?1, NULL, 'chs_mail', 'frm_bugreport', ?2, ?3, ?4, 'chat', 'Mozilla/5.0 (Pixel 8)', ?5)`,
      )
      .bind(id, t.orgId, rating, message, Date.now())
      .run();
    return id;
  }

  it("mails every address on the platform allowlist", async () => {
    const id = await seedReport("fbk_mail_all", 2, "The phone field rejects a UK number.");
    const { sent, binding } = captureBinding();

    const out = await runMailJob(
      withMail({ EMAIL: binding, PLATFORM_ADMIN_EMAILS: "founder@example.com, second@example.com" }),
      { kind: "respondent_feedback", feedbackId: id },
    );

    expect(out.messages).toBe(2);
    expect(sent.map((m) => m.to).sort()).toEqual(["founder@example.com", "second@example.com"]);
    // What they said, in the subject — so the inbox alone says whether this is
    // worth opening now.
    expect(sent[0]?.subject).toContain("The phone field rejects a UK number.");
    // And the word for the face, not the digit.
    expect(sent[0]?.subject).toContain("Bad");
    // Everything needed to reproduce it, in the body.
    expect(sent[0]?.text).toContain("Bug report form");
    expect(sent[0]?.text).toContain("Mozilla/5.0 (Pixel 8)");
  });

  it("says so when there were no words", async () => {
    const id = await seedReport("fbk_mail_silent", 5, null);
    const { sent, binding } = captureBinding();
    await runMailJob(withMail({ EMAIL: binding, PLATFORM_ADMIN_EMAILS: "founder@example.com" }), {
      kind: "respondent_feedback",
      feedbackId: id,
    });
    expect(sent[0]?.subject).toContain("Great");
    expect(sent[0]?.text).toContain("(no note)");
  });

  /*
    A deployment with no console has nobody to tell, and a report whose row has
    been deleted has nothing to say. Both are "skipped", not "failed" — the
    difference decides whether the queue spends five retries on them.
  */
  it("mails nobody when the allowlist is empty", async () => {
    const id = await seedReport("fbk_mail_nolist", 3, "nobody is listening");
    const { sent, binding } = captureBinding();
    const out = await runMailJob(withMail({ EMAIL: binding, PLATFORM_ADMIN_EMAILS: "" }), {
      kind: "respondent_feedback",
      feedbackId: id,
    });
    expect(out.messages).toBe(0);
    expect(sent).toHaveLength(0);
  });

  it("mails nobody when the report has been deleted", async () => {
    const { sent, binding } = captureBinding();
    const out = await runMailJob(
      withMail({ EMAIL: binding, PLATFORM_ADMIN_EMAILS: "founder@example.com" }),
      { kind: "respondent_feedback", feedbackId: "fbk_never_existed" },
    );
    expect(out.messages).toBe(0);
    expect(sent).toHaveLength(0);
  });
});
