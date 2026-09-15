import { env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { applySchema, fetchApi, minimalDoc, seedTenant, type Tenant } from "./helpers.js";
import { FEEDBACK_DAILY_CAP } from "../src/lib/feedback.js";
import { runMailJob } from "../src/lib/mail-jobs.js";
import { tagFeedback } from "../src/lib/feedback-tags.js";
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

    /*
      The subject is the same four words every time, then the form. It is what
      makes this recognisable in a list of nineteen thousand emails, and it must
      not drift into looking like one of the notifications a form sends.
    */
    expect(sent[0]?.subject).toBe("chatform bug report — Bug report form");
    // Their words are not lost — they move to the preheader, which is the grey
    // line an inbox prints beside the subject.
    expect(sent[0]?.html).toContain("The phone field rejects a UK number.");
    expect(sent[0]?.html).toContain("Bad ·");

    // Everything needed to reproduce it, without opening anything else.
    expect(sent[0]?.text).toContain("Bug report form");
    expect(sent[0]?.text).toContain("Mozilla/5.0 (Pixel 8)");
    // The live form, which is where the bug is.
    expect(sent[0]?.text).toContain("/f/bug-report-form");
    // And the account it belongs to, straight to its page in the console.
    expect(sent[0]?.text).toContain(`/admin/accounts/${t.orgId}`);

    /*
      The footer used to name the environment variable that decides who gets
      this. An inbox is not where a deploy detail belongs.
    */
    expect(sent[0]?.html).not.toContain("PLATFORM_ADMIN_EMAILS");
  });

  it("names who sent it and makes the reply one tap", async () => {
    await DB()
      .DB.prepare(
        `INSERT INTO respondents (id, display_name, email, phone, first_seen_at, last_seen_at, created_at)
         VALUES ('rsp_mailwho', 'Priya Nair', 'priya@example.com', NULL, ?1, ?1, ?1)`,
      )
      .bind(Date.now())
      .run();
    const id = await seedReport("fbk_mail_who", 1, "The Continue button does nothing.");
    await DB().DB.prepare(`UPDATE respondent_feedback SET respondent_id = 'rsp_mailwho' WHERE id = ?`).bind(id).run();

    const { sent, binding } = captureBinding();
    await runMailJob(withMail({ EMAIL: binding, PLATFORM_ADMIN_EMAILS: "founder@example.com" }), {
      kind: "respondent_feedback",
      feedbackId: id,
    });

    expect(sent[0]?.text).toContain("From: Priya Nair · priya@example.com");
    // A mailto with the form named, so replying is typing the answer and nothing else.
    expect(sent[0]?.html).toContain("mailto:priya@example.com?subject=");
    expect(sent[0]?.html).toContain(encodeURIComponent("Re: your report about Bug report form"));
    // Answering the notification answers the person.
    expect((sent[0] as unknown as { replyTo?: string }).replyTo).toBe("priya@example.com");
    // And straight to this report in the console.
    expect(sent[0]?.text).toContain(`/admin/feedback?report=${id}`);
  });

  it("says there is no way to reply when they never signed in", async () => {
    const id = await seedReport("fbk_mail_anon", 3, "Hmm.");
    const { sent, binding } = captureBinding();
    await runMailJob(withMail({ EMAIL: binding, PLATFORM_ADMIN_EMAILS: "founder@example.com" }), {
      kind: "respondent_feedback",
      feedbackId: id,
    });
    expect(sent[0]?.text).toContain("never signed in — no way to reply");
    expect(sent[0]?.html).not.toContain("mailto:");
  });

  it("says so when there were no words", async () => {
    const id = await seedReport("fbk_mail_silent", 5, null);
    const { sent, binding } = captureBinding();
    await runMailJob(withMail({ EMAIL: binding, PLATFORM_ADMIN_EMAILS: "founder@example.com" }), {
      kind: "respondent_feedback",
      feedbackId: id,
    });
    expect(sent[0]?.subject).toBe("chatform bug report — Bug report form");
    expect(sent[0]?.html).toContain("Great · no note");
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

/**
 * What they were looking at, attached separately.
 *
 * The report is the part that must never be lost; the snapshot is the part that
 * can be large, blocked or slow. These pin the separation: a snapshot attaches
 * only to its own session's report, only once, only within the size cap — and
 * none of its failures touch the report.
 */
describe("the snapshot", () => {
  const put = (s: { sessionId: string; respondentToken: string }, feedbackId: string, body: string, token?: string) =>
    fetchApi(`/p/sessions/${s.sessionId}/feedback/${feedbackId}/snapshot`, {
      method: "PUT",
      headers: { "content-type": "application/json", "x-respondent-token": token ?? s.respondentToken },
      body,
    });

  it("attaches to the report it came with, once", async () => {
    const s = await openSession("device-snapshot");
    const res = await send(s, { rating: 2, message: "The picker is stuck." });
    const { id } = await res.json<{ id: string }>();
    expect(id).toMatch(/^fbk_/);

    const snapshot = JSON.stringify({ v: 1, messages: [{ role: "assistant", text: "What is your name?" }] });
    expect((await put(s, id, snapshot)).status).toBe(200);

    const row = await DB()
      .DB.prepare(`SELECT snapshot_key, snapshot_bytes, form_version_id FROM respondent_feedback WHERE id = ?`)
      .bind(id)
      .first<{ snapshot_key: string; snapshot_bytes: number; form_version_id: string | null }>();
    expect(row?.snapshot_key).toBe(`feedback/${t.orgId}/${id}.json`);
    expect(row?.snapshot_bytes).toBe(snapshot.length);
    // The version on screen rides with the report.
    expect(row?.form_version_id).toBe("fv_bugreport");
    expect(await (await DB().R2.get(row!.snapshot_key))?.text()).toBe(snapshot);

    // Evidence that can be replaced afterwards is not evidence.
    expect((await put(s, id, JSON.stringify({ v: 1, forged: true }))).status).toBe(409);
  });

  it("refuses a snapshot for somebody else's report", async () => {
    const mine = await openSession("device-snap-mine");
    const theirs = await openSession("device-snap-theirs");
    const { id } = await (await send(theirs, { rating: 4 })).json<{ id: string }>();
    expect((await put(mine, id, "{}")).status).toBe(404);
  });

  it("refuses one that is too large or not JSON, and the report survives", async () => {
    const s = await openSession("device-snap-big");
    const { id } = await (await send(s, { rating: 1, message: "keep me" })).json<{ id: string }>();

    expect((await put(s, id, "x".repeat(1024 * 1024 + 1))).status).toBe(413);
    expect((await put(s, id, "not json at all")).status).toBe(400);

    const row = await DB()
      .DB.prepare(`SELECT message, snapshot_key FROM respondent_feedback WHERE id = ?`)
      .bind(id)
      .first<{ message: string; snapshot_key: string | null }>();
    expect(row?.message).toBe("keep me");
    expect(row?.snapshot_key).toBeNull();
  });
});

/**
 * The Feedback page's endpoints.
 *
 * The rules these pin are each a bug that already exists somewhere else in the
 * console: a `total` that ignores the filter, badges that move as you narrow the
 * list, and spam that keeps dragging the average after somebody binned it.
 */
describe("the feedback page", () => {
  let admin: Tenant;
  const asAdmin = (path: string, init: RequestInit = {}) =>
    fetchApi(path, { ...init, headers: { ...(init.headers ?? {}), cookie: admin.cookie } });

  beforeAll(async () => {
    admin = await seedTenant("fbpage");
  });

  it("is hidden from anyone who is not a platform admin", async () => {
    (env as unknown as Record<string, string | undefined>).PLATFORM_ADMIN_EMAILS = "someone-else@example.com";
    for (const path of ["/api/admin/feedback/stats", "/api/admin/feedback/reports"]) {
      expect((await asAdmin(path)).status).toBe(404);
    }
  });

  it("filters, pages, and counts what it filtered", async () => {
    (env as unknown as Record<string, string | undefined>).PLATFORM_ADMIN_EMAILS = "fbpage@example.com";

    const all = await (await asAdmin("/api/admin/feedback/reports?status=all&limit=100")).json<{
      total: number;
      reports: { id: string; rating: number }[];
    }>();
    expect(all.total).toBeGreaterThan(3);

    const bad = await (await asAdmin("/api/admin/feedback/reports?status=all&rating=1&limit=1")).json<{
      total: number;
      reports: { rating: number }[];
      counts: { new: number };
    }>();
    // One row on the page, but the total is every matching row — not the table.
    expect(bad.reports).toHaveLength(1);
    expect(bad.reports[0]?.rating).toBe(1);
    expect(bad.total).toBe(all.reports.filter((r) => r.rating === 1).length);
    expect(bad.total).toBeLessThan(all.total);
    // The badges describe the whole inbox, whatever the filter.
    expect(bad.counts.new).toBeGreaterThanOrEqual(all.total);
  });

  it("resolves, marks spam, and stops spam counting", async () => {
    const list = await (await asAdmin("/api/admin/feedback/reports?status=new&limit=1")).json<{
      reports: { id: string }[];
    }>();
    const id = list.reports[0]!.id;

    const before = await (await asAdmin("/api/admin/feedback/stats?range=30d")).json<{ total: number }>();

    const patched = await asAdmin(`/api/admin/feedback/reports/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: "spam", internalNote: "  test junk  " }),
    });
    expect(patched.status).toBe(200);

    const detail = await (await asAdmin(`/api/admin/feedback/reports/${id}`)).json<{
      status: string;
      statusBy: string;
      internalNote: string;
    }>();
    expect(detail.status).toBe("spam");
    expect(detail.statusBy).toBe("fbpage@example.com");
    expect(detail.internalNote).toBe("test junk");

    // Binned means it stops moving the numbers.
    const after = await (await asAdmin("/api/admin/feedback/stats?range=30d")).json<{ total: number }>();
    expect(after.total).toBe(before.total - 1);

    // Audited against the platform, never against the customer's log.
    const audited = await DB()
      .DB.prepare(`SELECT organization_id FROM audit_logs WHERE action = 'admin.feedback.triaged' AND resource_id = ?`)
      .bind(id)
      .first<{ organization_id: string }>();
    expect(audited?.organization_id).toBe("_platform");

    // A null note clears it, rather than being ignored.
    await asAdmin(`/api/admin/feedback/reports/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ internalNote: null }),
    });
    const cleared = await (await asAdmin(`/api/admin/feedback/reports/${id}`)).json<{ internalNote: string | null }>();
    expect(cleared.internalNote).toBeNull();
  });

  it("returns the snapshot a respondent attached", async () => {
    const s = await openSession("device-snap-admin");
    const { id } = await (await send(s, { rating: 3, message: "look at this" })).json<{ id: string }>();
    await fetchApi(`/p/sessions/${s.sessionId}/feedback/${id}/snapshot`, {
      method: "PUT",
      headers: { "content-type": "application/json", "x-respondent-token": s.respondentToken },
      body: JSON.stringify({ v: 1, marker: "on-screen" }),
    });

    const res = await asAdmin(`/api/admin/feedback/reports/${id}/snapshot`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ v: 1, marker: "on-screen" });

    const none = await (await asAdmin("/api/admin/feedback/reports?status=all&noted=no&limit=1")).json<{
      reports: { id: string }[];
    }>();
    if (none.reports[0]) {
      expect((await asAdmin(`/api/admin/feedback/reports/${none.reports[0].id}/snapshot`)).status).toBe(404);
    }
  });

  it("charts every day in the window, gaps included", async () => {
    const stats = await (await asAdmin("/api/admin/feedback/stats?range=7d")).json<{
      days: string[];
      series: { volume: number[]; average: (number | null)[]; byRating: { counts: number[] }[] };
      distribution: { rating: number }[];
    }>();
    expect(stats.days).toHaveLength(7);
    expect(stats.series.volume).toHaveLength(7);
    expect(stats.series.byRating).toHaveLength(5);
    expect(stats.distribution.map((d) => d.rating)).toEqual([1, 2, 3, 4, 5]);
    // A day nobody reported is a gap in the average, not a rating of zero.
    stats.series.volume.forEach((n, i) => {
      if (n === 0) expect(stats.series.average[i]).toBeNull();
    });
  });
});

describe("topic tags", () => {
  const fake =
    (object: unknown) =>
    async () => ({ object, usage: { input: 10, output: 5, costUsd: 0.00001, generationId: null } });

  it("stores the topic once and does not pay twice", async () => {
    const s = await openSession("device-tag");
    const { id } = await (await send(s, { rating: 1, message: "The phone number field rejects +44" })).json<{
      id: string;
    }>();

    let calls = 0;
    const classify = async () => {
      calls += 1;
      return fake({ topic: "validation", tags: ["Phone Number"], sentiment: -0.6 })();
    };

    expect(await tagFeedback(DB(), id, classify)).toEqual({ topic: "validation", tags: ["phone number"], sentiment: -0.6 });
    // A queue retry reads what is already there.
    await tagFeedback(DB(), id, classify);
    expect(calls).toBe(1);

    const row = await DB()
      .DB.prepare(`SELECT topic, tags FROM respondent_feedback WHERE id = ?`)
      .bind(id)
      .first<{ topic: string; tags: string }>();
    expect(row?.topic).toBe("validation");
    expect(JSON.parse(row!.tags)).toEqual(["phone number"]);
  });

  it("leaves a report untagged when the model misbehaves, and does not throw", async () => {
    const s = await openSession("device-tag-bad");
    const { id } = await (await send(s, { rating: 2, message: "something" })).json<{ id: string }>();
    expect(await tagFeedback(DB(), id, fake({ topic: "not-a-topic" }))).toBeNull();
    expect(
      await tagFeedback(DB(), id, async () => {
        throw new Error("model down");
      }),
    ).toBeNull();
  });

  it("does not call a model in the test environment unless handed one", async () => {
    const s = await openSession("device-tag-env");
    const { id } = await (await send(s, { rating: 5, message: "lovely" })).json<{ id: string }>();
    expect(await tagFeedback(DB(), id)).toBeNull();
  });
});
