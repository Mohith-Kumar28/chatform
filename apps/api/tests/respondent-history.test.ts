import { describe, it, expect, beforeAll } from "vitest";
import { env } from "cloudflare:test";
import { applySchema, seedTenant, type Tenant } from "./helpers.js";
import { findIdentityHistory, findDeviceResumable } from "../src/lib/respondent-history.js";
import { respondentKey, readDeviceSignal } from "../src/lib/respondent-key.js";
import type { RespondentIdentity } from "@repo/form-schema";
import type { Bindings } from "../src/env.js";

/**
 * Recognising a respondent by who they are, rather than by what their browser
 * kept.
 *
 * Every other way a returning respondent was recognised keyed on the device: a
 * session id in `localStorage` to resume, another key to say "you already
 * answered", a hashed IP for `allowResubmissions`. A signed-in respondent on a
 * second device matched none of them, so a form behind a sign-in gate would
 * take their identity, greet them by name, and start them at question one while
 * their half-finished response sat in the results table.
 */

let t: Tenant;

const ME: RespondentIdentity = {
  provider: "google",
  subject: "google-sub-me",
  email: "me@northwind.example",
  phone: null,
  name: "Me",
  pictureUrl: null,
  verifiedAt: Date.now(),
};

const SOMEONE_ELSE: RespondentIdentity = { ...ME, subject: "google-sub-other" };

/** The session doing the asking. Never its own history. */
const CURRENT = "chs_current";

let n = 0;
async function seed(opts: {
  status: "in_progress" | "abandoned" | "completed" | "disqualified";
  identity?: RespondentIdentity;
  answers?: Record<string, unknown>;
  isTest?: boolean;
  sessionId?: string;
  updatedAt?: number;
  formId?: string;
  fingerprint?: string;
  anonymous?: boolean;
}): Promise<string> {
  const id = `sbm_hist_${++n}`;
  const now = opts.updatedAt ?? Date.now();
  const who = opts.identity ?? ME;
  await env.DB.prepare(
    `INSERT INTO submissions
       (id, form_id, organization_id, session_id, status, source, is_test,
        started_at, updated_at, completed_at, fingerprint,
        respondent_provider, respondent_subject, respondent_email)
     VALUES (?, ?, ?, ?, ?, 'chat', ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      opts.formId ?? t.formId,
      t.orgId,
      opts.sessionId ?? `chs_${id}`,
      opts.status,
      opts.isTest ? 1 : 0,
      now,
      now,
      opts.status === "in_progress" || opts.status === "abandoned" ? null : now,
      opts.fingerprint ?? null,
      opts.anonymous ? null : who.provider,
      opts.anonymous ? null : who.subject,
      opts.anonymous ? null : who.email,
    )
    .run();

  for (const [ref, value] of Object.entries(opts.answers ?? {})) {
    await env.DB.prepare(
      `INSERT INTO submission_answers (id, submission_id, form_id, block_ref, block_type, value_json, updated_at)
       VALUES (?, ?, ?, ?, 'short_text', ?, ?)`,
    )
      .bind(`ans_${id}_${ref}`, id, opts.formId ?? t.formId, ref, JSON.stringify(value), now)
      .run();
  }
  return id;
}

const look = (identity: RespondentIdentity = ME) =>
  findIdentityHistory(env as unknown as Bindings, t.formId, identity, CURRENT);

beforeAll(async () => {
  await applySchema();
  t = await seedTenant("histy");
});

describe("findIdentityHistory", () => {
  it("finds nothing for someone who has never been here", async () => {
    expect(await look({ ...ME, subject: "nobody" })).toEqual({ finished: null, resumable: null });
  });

  it("hands back a half-finished response with its answers", async () => {
    const id = await seed({ status: "in_progress", answers: { q_name: "Maya", q_city: "Pune" } });
    const { finished, resumable } = await look();
    expect(finished).toBeNull();
    expect(resumable?.submissionId).toBe(id);
    expect(resumable?.answers).toEqual({ q_name: "Maya", q_city: "Pune" });
    await env.DB.prepare(`DELETE FROM submissions WHERE id = ?`).bind(id).run();
  });

  /**
   * An abandoned response is the same response. It is what a follow-up link
   * brings somebody back to, and signing in is the other way of proving the
   * same thing about the same person.
   */
  it("treats an abandoned response as resumable", async () => {
    const id = await seed({ status: "abandoned", answers: { q_name: "Maya" } });
    expect((await look()).resumable?.submissionId).toBe(id);
    await env.DB.prepare(`DELETE FROM submissions WHERE id = ?`).bind(id).run();
  });

  it("returns the most recently touched of several", async () => {
    const old = await seed({ status: "abandoned", updatedAt: Date.now() - 86_400_000 });
    const recent = await seed({ status: "in_progress", updatedAt: Date.now() });
    expect((await look()).resumable?.submissionId).toBe(recent);
    await env.DB.prepare(`DELETE FROM submissions WHERE id IN (?, ?)`).bind(old, recent).run();
  });

  it("never hands back another person's response", async () => {
    const theirs = await seed({ status: "in_progress", identity: SOMEONE_ELSE });
    expect(await look()).toEqual({ finished: null, resumable: null });
    await env.DB.prepare(`DELETE FROM submissions WHERE id = ?`).bind(theirs).run();
  });

  /** Its own session's row is not history; it is the conversation in progress. */
  it("ignores the asking session's own response", async () => {
    const mine = await seed({ status: "in_progress", sessionId: CURRENT });
    expect(await look()).toEqual({ finished: null, resumable: null });
    await env.DB.prepare(`DELETE FROM submissions WHERE id = ?`).bind(mine).run();
  });

  it("ignores a rehearsal", async () => {
    const rehearsal = await seed({ status: "completed", isTest: true });
    expect(await look()).toEqual({ finished: null, resumable: null });
    await env.DB.prepare(`DELETE FROM submissions WHERE id = ?`).bind(rehearsal).run();
  });

  it("reports a completed response, with when", async () => {
    const at = Date.now() - 3_600_000;
    const id = await seed({ status: "completed", updatedAt: at });
    const { finished, resumable } = await look();
    expect(finished?.submissionId).toBe(id);
    expect(finished?.completedAt).toBe(at);
    expect(resumable).toBeNull();
    await env.DB.prepare(`DELETE FROM submissions WHERE id = ?`).bind(id).run();
  });

  /** A screen-out that reloading could undo would not be a screen-out. */
  it("counts a screen-out as having answered", async () => {
    const id = await seed({ status: "disqualified" });
    expect((await look()).finished?.submissionId).toBe(id);
    await env.DB.prepare(`DELETE FROM submissions WHERE id = ?`).bind(id).run();
  });

  /**
   * Both can exist — they answered, came back, and wandered off. Handing back
   * the scrap would be strange when the real answer is already recorded, and it
   * is the finished one every setting here is about.
   */
  it("prefers a finished response over an open one", async () => {
    const open = await seed({ status: "in_progress" });
    const done = await seed({ status: "completed" });
    const { finished, resumable } = await look();
    expect(finished?.submissionId).toBe(done);
    expect(resumable).toBeNull();
    await env.DB.prepare(`DELETE FROM submissions WHERE id IN (?, ?)`).bind(open, done).run();
  });
});

describe("respondentKey", () => {
  it("keys on the fingerprint, and on nothing else", () => {
    /*
      The fingerprint library is the only source. It used to fall back to the
      network address when no signal arrived, which is a rule about a network
      pretending to be a rule about a person: one campus is a single value
      shared by everybody on it. No signal now means no key, and every rule that
      reads one is simply not applied to that visit.
    */
    expect(respondentKey({ signal: "abcdefgh1234", salt: "s" }).source).toBe("device");
    expect(respondentKey({ signal: null, salt: "s" })).toEqual({ value: "", source: "none" });
    expect(respondentKey({ signal: "  ", salt: "s" })).toEqual({ value: "", source: "none" });
  });

  /**
   * The salt is per form, so the same device answering two customers' forms is
   * two unrelated values. Without it this table would be a cross-tenant record
   * of which devices filled in which forms.
   */
  it("gives one device different keys on different forms", () => {
    const a = respondentKey({ signal: "abcdefgh1234", salt: "salt-a" });
    const b = respondentKey({ signal: "abcdefgh1234", salt: "salt-b" });
    expect(a.value).not.toBe(b.value);
    expect(a.value).toHaveLength(64);
  });

  /** Unauthenticated input from a public endpoint. Bounded before it is hashed. */
  it("refuses a signal that is not one", () => {
    expect(readDeviceSignal("short")).toBeNull();
    expect(readDeviceSignal("x".repeat(200))).toBeNull();
    expect(readDeviceSignal("has spaces!!")).toBeNull();
    expect(readDeviceSignal(12345)).toBeNull();
    expect(readDeviceSignal("abcdefgh1234")).toBe("abcdefgh1234");
  });
});

describe("findDeviceResumable", () => {
  const DEVICE = { value: "fp-device-key", source: "device" as const };

  it("hands back an anonymous response left on this device", async () => {
    const id = await seed({
      status: "abandoned",
      anonymous: true,
      fingerprint: DEVICE.value,
      answers: { q_name: "Maya" },
    });
    const found = await findDeviceResumable(env as unknown as Bindings, t.formId, DEVICE);
    expect(found?.submissionId).toBe(id);
    expect(found?.answers).toEqual({ q_name: "Maya" });
    await env.DB.prepare(`DELETE FROM submissions WHERE id = ?`).bind(id).run();
  });

  /**
   * The security boundary. A signed-in person's response is theirs, and a
   * guessed device signal must not be a way past the sign-in gate to it.
   */
  it("refuses a response that belongs to a verified respondent", async () => {
    const id = await seed({ status: "in_progress", fingerprint: DEVICE.value });
    expect(await findDeviceResumable(env as unknown as Bindings, t.formId, DEVICE)).toBeNull();
    await env.DB.prepare(`DELETE FROM submissions WHERE id = ?`).bind(id).run();
  });

  /**
   * An IP is a whole office. Resuming on one would routinely open a colleague's
   * half-finished response, so only a real device signal may.
   */
  it("never resumes on an IP-derived key", async () => {
    const id = await seed({ status: "in_progress", anonymous: true, fingerprint: DEVICE.value });
    const asIp = { value: DEVICE.value, source: "ip" as const };
    expect(await findDeviceResumable(env as unknown as Bindings, t.formId, asIp)).toBeNull();
    await env.DB.prepare(`DELETE FROM submissions WHERE id = ?`).bind(id).run();
  });

  it("ignores a finished response and a rehearsal", async () => {
    const done = await seed({ status: "completed", anonymous: true, fingerprint: DEVICE.value });
    const rehearsal = await seed({
      status: "in_progress",
      anonymous: true,
      isTest: true,
      fingerprint: DEVICE.value,
    });
    expect(await findDeviceResumable(env as unknown as Bindings, t.formId, DEVICE)).toBeNull();
    await env.DB.prepare(`DELETE FROM submissions WHERE id IN (?, ?)`).bind(done, rehearsal).run();
  });
});
