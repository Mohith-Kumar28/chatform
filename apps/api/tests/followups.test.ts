import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { applySchema, seedTenant, type Tenant } from "./helpers.js";
import {
  scheduleFollowUps,
  cancelFollowUps,
  suppress,
  isSuppressed,
  recordFollowUpClick,
  creditFollowUpRecovery,
  backfillFollowUps,
  CATCHUP_LOOKBACK_DAYS,
} from "../src/lib/followups.js";
import { finalizeResponse, type ResponseOwner } from "../src/lib/submissions.js";
import { computeFollowUpStats } from "../src/lib/followup-analytics.js";
import { sweepFollowUps } from "../src/lib/sweeps.js";
import { resolveRespondentAddress } from "../src/lib/respondent-address.js";
import { sendMail } from "../src/lib/mail.js";
import { readFormDoc } from "@repo/form-schema";
import { inWindow } from "../src/lib/quiet-hours.js";
import type { Bindings } from "../src/env.js";

/**
 * Follow-ups, from an abandoned response to a message that does or does not go
 * out.
 *
 * Almost every assertion here is about *not* sending. That is the shape of the
 * feature: it mails people who never asked to hear from us, so the interesting
 * behaviour is the set of reasons it declines to. A bug that sends one nudge
 * too few is a missed conversion; a bug that sends one too many is a spam
 * complaint against a shared sending domain.
 */

let t: Tenant;
const VERSION_ID = "ver_followup";

const DOC = {
  schemaVersion: 4,
  title: "Get a quote",
  blocks: [
    { id: "blk_follow1", ref: "q_name", type: "short_text", title: "Your name", required: true },
    { id: "blk_follow2", ref: "q_email", type: "email", title: "Your email", required: true },
    { id: "blk_follow3", ref: "q_size", type: "short_text", title: "Team size", required: false },
  ],
  endings: [{ id: "end_followup1", ref: "end_thanks", title: "Thanks!", bodyMd: "" }],
  logic: [],
  endingRules: [],
  variables: [],
  hiddenFields: [{ name: "lead_email" }],
  layout: {},
  settings: {
    followUp: {
      enabled: true,
      steps: [
        { delayHours: 4, subject: "You're {{remaining}} questions from finishing", bodyMd: "" },
        { delayHours: 24, subject: "Your {{form.title}} is still open", bodyMd: "" },
      ],
    },
  },
  theme: {},
};

async function publish(doc: unknown = DOC): Promise<void> {
  const now = Date.now();
  await env.DB.prepare(
    `INSERT OR REPLACE INTO form_versions (id, form_id, version, schema_json, checksum, published_at, created_at)
     VALUES (?, ?, 1, ?, 'ck', ?, ?)`,
  )
    .bind(VERSION_ID, t.formId, JSON.stringify(doc), now, now)
    .run();
  await env.DB.prepare(`UPDATE forms SET active_version_id = ?, status = 'published' WHERE id = ?`)
    .bind(VERSION_ID, t.formId)
    .run();
}

/** An abandoned response with two answers, one of them an email address. */
async function seedAbandoned(id: string, answers: Record<string, unknown> = {
  q_name: "Maya",
  q_email: "maya@northwind.example",
}): Promise<string> {
  const now = Date.now();
  await env.DB.prepare(
    `INSERT INTO submissions (id, form_id, form_version_id, organization_id, status, source, is_test, started_at, updated_at)
     VALUES (?, ?, ?, ?, 'abandoned', 'chat', 0, ?, ?)`,
  )
    .bind(id, t.formId, VERSION_ID, t.orgId, now, now)
    .run();
  for (const [ref, value] of Object.entries(answers)) {
    await env.DB.prepare(
      `INSERT INTO submission_answers (id, submission_id, form_id, block_ref, block_type, value_json, updated_at)
       VALUES (?, ?, ?, ?, 'short_text', ?, ?)`,
    )
      .bind(`ans_${id}_${ref}`, id, t.formId, ref, JSON.stringify(value), now)
      .run();
  }
  return id;
}

function rowsFor(id: string) {
  return env.DB.prepare(`SELECT step, status, address, reason, scheduled_at, sent_at FROM followups WHERE submission_id = ? ORDER BY step`)
    .bind(id)
    .all<{
      step: number;
      status: string;
      address: string;
      reason: string | null;
      scheduled_at: number;
      sent_at: number | null;
    }>();
}

/**
 * Put the tenant on a plan. `free` is expressed as "no subscription row",
 * which is what a free org actually looks like — inventing a `free`
 * subscription would test a state production never produces.
 */
async function setPlan(plan: "free" | "pro"): Promise<void> {
  const { PLANS } = await import("@repo/entitlements");
  const { invalidateEntitlements } = await import("../src/lib/entitlements.js");
  if (plan === "free") {
    await env.DB.prepare(`DELETE FROM subscriptions WHERE organization_id = ?`).bind(t.orgId).run();
  } else {
    await env.DB.prepare(
      `INSERT INTO plans (id, slug, name, price_monthly_cents, price_yearly_cents, currency, features_json, limits_json, is_active, sort_order)
       VALUES ('pro', 'pro', 'Pro', ?, ?, 'USD', ?, ?, 1, 1) ON CONFLICT (id) DO NOTHING`,
    )
      .bind(
        PLANS.pro.priceMonthlyCents,
        PLANS.pro.priceYearlyCents,
        JSON.stringify(PLANS.pro.features),
        JSON.stringify(PLANS.pro.limits),
      )
      .run();
    await env.DB.prepare(
      `INSERT INTO subscriptions (id, organization_id, plan_id, dodo_subscription_id, cycle, status,
                                  current_period_start, current_period_end, seats, created_at, updated_at)
       VALUES (?, ?, 'pro', ?, 'monthly', 'active', ?, ?, 1, ?, ?) ON CONFLICT (dodo_subscription_id) DO NOTHING`,
    )
      .bind(
        `sub_fu_${t.orgId}`,
        t.orgId,
        `dodo_fu_${t.orgId}`,
        Date.now() - 1000,
        Date.now() + 20 * 86_400_000,
        Date.now(),
        Date.now(),
      )
      .run();
  }
  await invalidateEntitlements(env as never, t.orgId);
}

beforeAll(async () => {
  await applySchema();
  t = await seedTenant("followup");
  await publish();
  await setPlan("pro");
  // Nothing schedules without one — see the CAN-SPAM gate in `scheduleInner`.
  await setPostalAddress("Acme Ltd, MG Road, Bengaluru 560001, India");
});

async function setPostalAddress(value: string | null): Promise<void> {
  await env.DB.prepare(`UPDATE organizations SET postal_address = ? WHERE id = ?`)
    .bind(value, t.orgId)
    .run();
}

beforeEach(async () => {
  await env.DB.prepare(`DELETE FROM followups`).run();
  await env.DB.prepare(`DELETE FROM email_suppressions`).run();
  await env.DB.prepare(`DELETE FROM submission_answers`).run();
  await env.DB.prepare(`DELETE FROM submissions`).run();
});

describe("resolveRespondentAddress", () => {
  const doc = readFormDoc(DOC);

  it("prefers a verified identity over anything they typed", () => {
    const got = resolveRespondentAddress(doc, {
      respondentEmail: "verified@example.com",
      byRef: new Map([["q_email", "typed@example.com"]]),
    });
    expect(got).toEqual({ address: "verified@example.com", source: "identity" });
  });

  it("falls back to an email block's answer", () => {
    const got = resolveRespondentAddress(doc, {
      respondentEmail: null,
      byRef: new Map([["q_email", "typed@example.com"]]),
    });
    expect(got).toEqual({ address: "typed@example.com", source: "answer" });
  });

  it("reads a contact_info block, and takes the first name with it", () => {
    const withContact = readFormDoc({
      ...DOC,
      blocks: [
        { id: "blk_contact1", ref: "q_contact", type: "contact_info", title: "You", required: true, fields: ["first_name", "email"] },
      ],
    });
    const got = resolveRespondentAddress(withContact, {
      respondentEmail: null,
      byRef: new Map([["q_contact", { first_name: "Maya", email: "maya@example.com" }]]),
    });
    expect(got).toMatchObject({ address: "maya@example.com", source: "contact_info", firstName: "Maya" });
  });

  it("reads the hidden field the author named, and only that one", () => {
    const hiddenFields = { lead_email: "crm@example.com", other: "nope@example.com" };
    expect(
      resolveRespondentAddress(doc, { respondentEmail: null, byRef: new Map(), hiddenFields, addressField: "lead_email" }),
    ).toEqual({ address: "crm@example.com", source: "hidden" });
    // Without being told which field, a hidden address is not guessed at.
    expect(resolveRespondentAddress(doc, { respondentEmail: null, byRef: new Map(), hiddenFields })).toBeNull();
  });

  it("returns null when the form gives us no way to reach anyone", () => {
    expect(resolveRespondentAddress(doc, { respondentEmail: null, byRef: new Map() })).toBeNull();
    // A blank or malformed value is not an address.
    expect(resolveRespondentAddress(doc, { respondentEmail: null, byRef: new Map([["q_email", ""]]) })).toBeNull();
    expect(resolveRespondentAddress(doc, { respondentEmail: null, byRef: new Map([["q_email", "not-an-email"]]) })).toBeNull();
  });
});

describe("scheduleFollowUps", () => {
  it("writes one row per configured step, at the configured delays", async () => {
    const at = Date.now();
    await seedAbandoned("sbm_sched");
    const n = await scheduleFollowUps({
      env: env as unknown as Bindings,
      submissionId: "sbm_sched",
      formId: t.formId,
      organizationId: t.orgId,
      abandonedAt: at,
    });
    expect(n).toBe(2);
    const { results } = await rowsFor("sbm_sched");
    expect(results?.map((r) => r.status)).toEqual(["scheduled", "scheduled"]);
    expect(results?.[0]!.address).toBe("maya@northwind.example");
    // 4h and 24h out, to the minute.
    expect(Math.round((results![0]!.scheduled_at - at) / 3_600_000)).toBe(4);
    expect(Math.round((results![1]!.scheduled_at - at) / 3_600_000)).toBe(24);
  });

  /**
   * Signing in and stopping is the abandonment worth chasing.
   *
   * They got through the gate — which is the step people drop at — and then
   * answered nothing. The sign-in handed us a verified address, so this is the
   * one zero-answer response we can actually reach, and it used to be skipped
   * as `no_answers` alongside the anonymous ones we cannot.
   */
  it("still nudges a verified respondent who answered nothing", async () => {
    await seedAbandoned("sbm_verified_zero", {});
    await env.DB.prepare(
      `UPDATE submissions SET respondent_provider = 'google', respondent_subject = 'sub_zero',
              respondent_email = 'signed.in@northwind.example' WHERE id = ?`,
    )
      .bind("sbm_verified_zero")
      .run();

    const n = await scheduleFollowUps({
      env: env as unknown as Bindings,
      submissionId: "sbm_verified_zero",
      formId: t.formId,
      organizationId: t.orgId,
      abandonedAt: Date.now(),
    });
    expect(n).toBe(2);
    expect((await rowsFor("sbm_verified_zero")).results?.[0]!.address).toBe(
      "signed.in@northwind.example",
    );
  });

  it("stays quiet when nothing was answered and nobody signed in", async () => {
    // The address would have to come from an answer, and there are none. This
    // is the case the old rule was actually written for.
    await seedAbandoned("sbm_anon_zero", {});
    const n = await scheduleFollowUps({
      env: env as unknown as Bindings,
      submissionId: "sbm_anon_zero",
      formId: t.formId,
      organizationId: t.orgId,
      abandonedAt: Date.now(),
    });
    expect(n).toBe(0);
  });

  /**
   * The silent branches, made legible.
   *
   * Each of these used to return zero and write nothing anywhere, so an author
   * whose reminders never went out had no way to find out why — no row in
   * `followups` to inspect, and no error on any surface they can see.
   */
  it("records on the response why nothing was scheduled", async () => {
    const skipOf = (id: string) =>
      env.DB
        .prepare(`SELECT json_extract(meta, '$.followUpSkip') AS s FROM submissions WHERE id = ?`)
        .bind(id)
        .first<{ s: string | null }>();

    await seedAbandoned("sbm_why_noaddr", { q_name: "Maya" });
    await scheduleFollowUps({
      env: env as unknown as Bindings,
      submissionId: "sbm_why_noaddr",
      formId: t.formId,
      organizationId: t.orgId,
      abandonedAt: Date.now(),
    });
    expect((await skipOf("sbm_why_noaddr"))?.s).toBe("no_address");

    await setPlan("free");
    await seedAbandoned("sbm_why_plan");
    await scheduleFollowUps({
      env: env as unknown as Bindings,
      submissionId: "sbm_why_plan",
      formId: t.formId,
      organizationId: t.orgId,
      abandonedAt: Date.now(),
    });
    expect((await skipOf("sbm_why_plan"))?.s).toBe("not_entitled");
    await setPlan("pro");

    // And cleared once a sequence is actually written, so a response rescheduled
    // after the cause was fixed does not keep the old excuse.
    await seedAbandoned("sbm_why_cleared");
    await env.DB.prepare(
      `UPDATE submissions SET meta = json_set(coalesce(meta,'{}'), '$.followUpSkip', 'not_entitled') WHERE id = ?`,
    )
      .bind("sbm_why_cleared")
      .run();
    await scheduleFollowUps({
      env: env as unknown as Bindings,
      submissionId: "sbm_why_cleared",
      formId: t.formId,
      organizationId: t.orgId,
      abandonedAt: Date.now(),
    });
    expect((await skipOf("sbm_why_cleared"))?.s).toBeNull();
  });

  /**
   * The clock starts when the respondent stopped, not when we noticed.
   *
   * A conversation is not declared abandoned until its Durable Object has been
   * idle for thirty minutes, so scheduling from the finalize time added that
   * half hour to every delay the author configured — a "4 hours later" reminder
   * went out at four and a half, with nothing in the product saying so.
   * `finalizeResponse` reads `updated_at` before overwriting it, which is the
   * whole fix and the reason this asserts through the writer rather than by
   * calling `scheduleFollowUps` directly.
   */
  it("measures the delay from the last answer, not from the abandonment", async () => {
    const owner: ResponseOwner = {
      env: env as never,
      formId: t.formId,
      formVersionId: VERSION_ID,
      organizationId: t.orgId,
      sessionId: null,
      source: "chat",
    };
    const startedAt = Date.now() - 4 * 3_600_000;
    await seedAbandoned("sbm_clock");
    // Put it back in progress with a last answer 30 minutes ago — the state the
    // idle alarm actually finds.
    const lastAnswer = Date.now() - 30 * 60_000;
    await env.DB.prepare(`UPDATE submissions SET status = 'in_progress', updated_at = ? WHERE id = ?`)
      .bind(lastAnswer, "sbm_clock")
      .run();

    await finalizeResponse(owner, {
      responseId: "sbm_clock",
      status: "abandoned",
      endingRef: null,
      abandonReason: "idle_timeout",
      answers: {},
      startedAt,
      collectedCount: 1,
    });

    const { results } = await rowsFor("sbm_clock");
    expect(results).toHaveLength(2);
    // 4h and 24h from the last answer. Measured from `now` instead, each would
    // be half an hour further out.
    expect(Math.round((results![0]!.scheduled_at - lastAnswer) / 60_000)).toBe(240);
    expect(Math.round((results![1]!.scheduled_at - lastAnswer) / 60_000)).toBe(1440);
  });

  it("is idempotent — a second call adds nothing", async () => {
    await seedAbandoned("sbm_twice");
    const args = {
      env: env as unknown as Bindings,
      submissionId: "sbm_twice",
      formId: t.formId,
      organizationId: t.orgId,
      abandonedAt: Date.now(),
    };
    await scheduleFollowUps(args);
    await scheduleFollowUps(args);
    const { results } = await rowsFor("sbm_twice");
    expect(results).toHaveLength(2);
  });

  it("does nothing when the feature is switched off", async () => {
    await publish({ ...DOC, settings: { followUp: { enabled: false, steps: DOC.settings.followUp.steps } } });
    await seedAbandoned("sbm_off");
    const n = await scheduleFollowUps({
      env: env as unknown as Bindings,
      submissionId: "sbm_off",
      formId: t.formId,
      organizationId: t.orgId,
      abandonedAt: Date.now(),
    });
    expect(n).toBe(0);
    expect((await rowsFor("sbm_off")).results).toHaveLength(0);
    await publish();
  });

  it("does nothing when the address is suppressed", async () => {
    await suppress(env as unknown as Bindings, t.orgId, "maya@northwind.example", "unsubscribe");
    await seedAbandoned("sbm_supp");
    const n = await scheduleFollowUps({
      env: env as unknown as Bindings,
      submissionId: "sbm_supp",
      formId: t.formId,
      organizationId: t.orgId,
      abandonedAt: Date.now(),
    });
    expect(n).toBe(0);
  });

  it("does nothing when nothing was answered", async () => {
    await seedAbandoned("sbm_empty", {});
    const n = await scheduleFollowUps({
      env: env as unknown as Bindings,
      submissionId: "sbm_empty",
      formId: t.formId,
      organizationId: t.orgId,
      abandonedAt: Date.now(),
    });
    expect(n).toBe(0);
  });

  it("never mails anyone about a test-mode response", async () => {
    await seedAbandoned("sbm_test");
    const n = await scheduleFollowUps({
      env: env as unknown as Bindings,
      submissionId: "sbm_test",
      formId: t.formId,
      organizationId: t.orgId,
      abandonedAt: Date.now(),
      isTest: true,
    });
    expect(n).toBe(0);
  });

  it("drops steps that would land after the form closes", async () => {
    // Closes in six hours: the 4h nudge survives, the 24h one does not.
    const closeAt = new Date(Date.now() + 6 * 3_600_000).toISOString();
    await publish({
      ...DOC,
      settings: { ...DOC.settings, closeRules: { closeAt, closedMessageMd: "Closed." } },
    });
    await seedAbandoned("sbm_close");
    await scheduleFollowUps({
      env: env as unknown as Bindings,
      submissionId: "sbm_close",
      formId: t.formId,
      organizationId: t.orgId,
      abandonedAt: Date.now(),
    });
    const { results } = await rowsFor("sbm_close");
    expect(results?.map((r) => r.step)).toEqual([1]);
    await publish();
  });

  it("holds a share back when a holdout is configured, and sends them nothing", async () => {
    await publish({ ...DOC, settings: { followUp: { ...DOC.settings.followUp, holdoutPercent: 100 } } });
    await seedAbandoned("sbm_hold");
    const n = await scheduleFollowUps({
      env: env as unknown as Bindings,
      submissionId: "sbm_hold",
      formId: t.formId,
      organizationId: t.orgId,
      abandonedAt: Date.now(),
    });
    // Rows exist so the arm is measurable, but nothing is queued to send.
    expect(n).toBe(0);
    const { results } = await rowsFor("sbm_hold");
    expect(results?.every((r) => r.status === "holdout")).toBe(true);
    await publish();
  });

  it("does nothing when the org has no postal address", async () => {
    // Required in the footer of every commercial message. Enforced server-side
    // because the builder is not the only way a document gets published.
    await setPostalAddress(null);
    await seedAbandoned("sbm_nopostal");
    const n = await scheduleFollowUps({
      env: env as unknown as Bindings,
      submissionId: "sbm_nopostal",
      formId: t.formId,
      organizationId: t.orgId,
      abandonedAt: Date.now(),
    });
    expect(n).toBe(0);
    expect((await rowsFor("sbm_nopostal")).results).toHaveLength(0);
    await setPostalAddress("Acme Ltd, MG Road, Bengaluru 560001, India");
  });

  it("does nothing for an org without the feature", async () => {
    await setPlan("free");
    await seedAbandoned("sbm_free");
    const n = await scheduleFollowUps({
      env: env as unknown as Bindings,
      submissionId: "sbm_free",
      formId: t.formId,
      organizationId: t.orgId,
      abandonedAt: Date.now(),
    });
    expect(n).toBe(0);
    await setPlan("pro");
  });
});

describe("sweepFollowUps", () => {
  async function due(id: string): Promise<void> {
    await seedAbandoned(id);
    await scheduleFollowUps({
      env: env as unknown as Bindings,
      submissionId: id,
      formId: t.formId,
      organizationId: t.orgId,
      // Far enough in the past that both steps are due.
      abandonedAt: Date.now() - 48 * 3_600_000,
    });
  }

  /**
   * `queued`, not `sent`: the sweep hands the message to a queue and the queue
   * consumer is what learns whether it was delivered. Marking it `sent` here
   * meant a follow-up that failed every retry into the dead-letter queue still
   * read as delivered in the results table.
   */
  it("queues a due nudge without yet calling it sent", async () => {
    await due("sbm_due");
    const n = await sweepFollowUps(env as unknown as Bindings);
    expect(n).toBe(2);
    const { results } = await rowsFor("sbm_due");
    expect(results?.every((r) => r.status === "queued")).toBe(true);
    expect(results?.every((r) => r.sent_at === null)).toBe(true);
  });

  /** The guard against a second send: the sweep only ever picks up `scheduled`. */
  it("does not re-enqueue a nudge that is already in flight", async () => {
    await due("sbm_inflight");
    expect(await sweepFollowUps(env as unknown as Bindings)).toBe(2);
    expect(await sweepFollowUps(env as unknown as Bindings)).toBe(0);
    const { results } = await rowsFor("sbm_inflight");
    expect(results?.every((r) => r.status === "queued")).toBe(true);
  });

  it("skips a response that was completed after the nudge was scheduled", async () => {
    await due("sbm_raced");
    await env.DB.prepare(`UPDATE submissions SET status = 'completed' WHERE id = ?`).bind("sbm_raced").run();
    const n = await sweepFollowUps(env as unknown as Bindings);
    expect(n).toBe(0);
    const { results } = await rowsFor("sbm_raced");
    expect(results?.every((r) => r.status === "skipped" && r.reason === "response_settled")).toBe(true);
  });

  it("skips an address that unsubscribed between scheduling and sending", async () => {
    await due("sbm_unsub");
    await suppress(env as unknown as Bindings, t.orgId, "maya@northwind.example", "unsubscribe");
    const n = await sweepFollowUps(env as unknown as Bindings);
    expect(n).toBe(0);
    const { results } = await rowsFor("sbm_unsub");
    expect(results?.every((r) => r.reason === "suppressed")).toBe(true);
  });

  it("skips an org whose plan lapsed after the nudge was scheduled", async () => {
    await due("sbm_lapsed");
    await setPlan("free");
    const n = await sweepFollowUps(env as unknown as Bindings);
    expect(n).toBe(0);
    const { results } = await rowsFor("sbm_lapsed");
    expect(results?.every((r) => r.reason === "not_entitled")).toBe(true);
    await setPlan("pro");
  });

  it("leaves a nudge alone until it is actually due", async () => {
    await seedAbandoned("sbm_early");
    await scheduleFollowUps({
      env: env as unknown as Bindings,
      submissionId: "sbm_early",
      formId: t.formId,
      organizationId: t.orgId,
      abandonedAt: Date.now(),
    });
    expect(await sweepFollowUps(env as unknown as Bindings)).toBe(0);
    const { results } = await rowsFor("sbm_early");
    expect(results?.every((r) => r.status === "scheduled")).toBe(true);
  });
});

describe("cancellation and suppression", () => {
  it("cancels the rest of a sequence when the respondent comes back", async () => {
    await seedAbandoned("sbm_cancel");
    await scheduleFollowUps({
      env: env as unknown as Bindings,
      submissionId: "sbm_cancel",
      formId: t.formId,
      organizationId: t.orgId,
      abandonedAt: Date.now(),
    });
    const n = await cancelFollowUps(env as unknown as Bindings, "sbm_cancel", "resumed");
    expect(n).toBe(2);
    const { results } = await rowsFor("sbm_cancel");
    expect(results?.every((r) => r.status === "cancelled" && r.reason === "resumed")).toBe(true);
  });

  it("scopes an unsubscribe to the organization it was given to", async () => {
    const e = env as unknown as Bindings;
    await suppress(e, t.orgId, "shared@example.com", "unsubscribe");
    expect(await isSuppressed(e, t.orgId, "shared@example.com")).toBe(true);
    expect(await isSuppressed(e, "org_someone_else", "shared@example.com")).toBe(false);
  });

  it("applies a bounce everywhere, because that is a fact about the address", async () => {
    const e = env as unknown as Bindings;
    await suppress(e, null, "dead@example.com", "bounce");
    expect(await isSuppressed(e, t.orgId, "dead@example.com")).toBe(true);
    expect(await isSuppressed(e, "org_someone_else", "dead@example.com")).toBe(true);
  });

  it("is idempotent, globally and per-org", async () => {
    const e = env as unknown as Bindings;
    await suppress(e, null, "twice@example.com", "bounce");
    await suppress(e, null, "twice@example.com", "bounce");
    await suppress(e, t.orgId, "twice@example.com", "unsubscribe");
    await suppress(e, t.orgId, "twice@example.com", "unsubscribe");
    const { results } = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM email_suppressions WHERE address = ?`,
    )
      .bind("twice@example.com")
      .all<{ n: number }>();
    expect(results?.[0]!.n).toBe(2);
  });
});

describe("marketing mail never uses the transactional pipe", () => {
  /** A binding that fails the test if it is ever asked to carry a message. */
  function trapBinding(): SendEmail {
    return {
      send: async () => {
        throw new Error("this message must not use the Cloudflare binding");
      },
    } as unknown as SendEmail;
  }

  it("refuses to downgrade onto the binding when Resend is unset in production", async () => {
    const e = {
      ...(env as unknown as Bindings),
      EMAIL: trapBinding(),
      RESEND_API_KEY: undefined,
      ENVIRONMENT: "production",
    } as Bindings;
    await expect(
      sendMail(e, { to: "a@example.com", subject: "s", html: "<p>h</p>", text: "h", class: "marketing" }),
    ).rejects.toThrow(/marketing_transport_unconfigured/);
  });

  it("MAIL_TRANSPORT=resend moves transactional mail off the binding too", async () => {
    // The escape hatch for the binding's beta quotas: one variable, not a
    // refactor. The trap binding fails the test if anything reaches it.
    const e = {
      ...(env as unknown as Bindings),
      EMAIL: trapBinding(),
      RESEND_API_KEY: "re_test",
      MAIL_TRANSPORT: "resend",
    } as Bindings;
    const calls: string[] = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (url: unknown) => {
      calls.push(String(url));
      return new Response(JSON.stringify({ id: "msg_1" }), { status: 200 });
    }) as typeof fetch;
    try {
      const res = await sendMail(e, { to: "a@example.com", subject: "s", html: "<p>h</p>", text: "h" });
      expect(res.transport).toBe("resend");
      expect(calls[0]).toContain("api.resend.com");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("MAIL_TRANSPORT=resend with no key fails loudly rather than sending nothing", async () => {
    const e = {
      ...(env as unknown as Bindings),
      EMAIL: trapBinding(),
      RESEND_API_KEY: undefined,
      MAIL_TRANSPORT: "resend",
      ENVIRONMENT: "production",
    } as Bindings;
    await expect(
      sendMail(e, { to: "a@example.com", subject: "s", html: "<p>h</p>", text: "h" }),
    ).rejects.toThrow(/mail_transport_unconfigured/);
  });

  it("still sends transactional mail over the binding by default", async () => {
    const sent: unknown[] = [];
    const e = {
      ...(env as unknown as Bindings),
      EMAIL: { send: async (m: unknown) => { sent.push(m); return {}; } } as unknown as SendEmail,
    } as Bindings;
    const res = await sendMail(e, { to: "a@example.com", subject: "s", html: "<p>h</p>", text: "h" });
    expect(res.transport).toBe("cloudflare");
    expect(sent).toHaveLength(1);
  });
});

/**
 * Attribution: what a nudge actually did.
 *
 * These numbers get quoted. The recovery figure is the one an author reads to
 * decide whether the feature is worth paying for, and every test here is about
 * a way of inflating it that the implementation must refuse — crediting a
 * completion nobody was nudged into, counting one person three times because
 * they got three messages, or letting a repeat visit move the click.
 */
describe("follow-up attribution", () => {
  /** Mark scheduled rows as sent, the way the sweep would. */
  async function markSent(submissionId: string): Promise<string[]> {
    await env.DB.prepare(
      `UPDATE followups SET status = 'sent', sent_at = ? WHERE submission_id = ? AND status = 'scheduled'`,
    )
      .bind(Date.now(), submissionId)
      .run();
    const rows = await env.DB.prepare(
      `SELECT id FROM followups WHERE submission_id = ? ORDER BY step`,
    )
      .bind(submissionId)
      .all<{ id: string }>();
    return (rows.results ?? []).map((r) => r.id);
  }

  it("records a click once, and only against its own response", async () => {
    const id = await seedAbandoned("sub_click");
    await scheduleFollowUps({
      env: env as unknown as Bindings,
      submissionId: id,
      formId: t.formId,
      organizationId: t.orgId,
      abandonedAt: Date.now() - 5 * 3_600_000,
    });
    const [first] = await markSent(id);

    await recordFollowUpClick(env as unknown as Bindings, first!, id);
    const after = await env.DB.prepare(`SELECT clicked_at FROM followups WHERE id = ?`)
      .bind(first)
      .first<{ clicked_at: number }>();
    expect(after?.clicked_at).toBeGreaterThan(0);

    // A second visit from the same message is the same person coming back. The
    // first timestamp must survive, or the daily series walks forward every
    // time somebody reopens their inbox.
    await recordFollowUpClick(env as unknown as Bindings, first!, id);
    const again = await env.DB.prepare(`SELECT clicked_at FROM followups WHERE id = ?`)
      .bind(first)
      .first<{ clicked_at: number }>();
    expect(again?.clicked_at).toBe(after?.clicked_at);
  });

  it("refuses a follow-up id that belongs to another response", async () => {
    const mine = await seedAbandoned("sub_mine");
    // A different inbox: the per-person cap counts one address as one person,
    // and these two are meant to be strangers.
    const theirs = await seedAbandoned("sub_theirs", {
      q_name: "Ana",
      q_email: "ana@northwind.example",
    });
    for (const s of [mine, theirs]) {
      await scheduleFollowUps({
        env: env as unknown as Bindings,
        submissionId: s,
        formId: t.formId,
        organizationId: t.orgId,
        abandonedAt: Date.now() - 5 * 3_600_000,
      });
    }
    const [theirFirst] = await markSent(theirs);

    // The id is real; the response it is paired with is not the one it was
    // scheduled against. This is the check that makes the public `fu` parameter
    // safe to put in a URL.
    await recordFollowUpClick(env as unknown as Bindings, theirFirst!, mine);
    const row = await env.DB.prepare(`SELECT clicked_at FROM followups WHERE id = ?`)
      .bind(theirFirst)
      .first<{ clicked_at: number | null }>();
    expect(row?.clicked_at).toBeNull();
  });

  it("credits one recovery per person, not one per message", async () => {
    const id = await seedAbandoned("sub_recover");
    await scheduleFollowUps({
      env: env as unknown as Bindings,
      submissionId: id,
      formId: t.formId,
      organizationId: t.orgId,
      abandonedAt: Date.now() - 30 * 3_600_000,
    });
    const ids = await markSent(id);
    expect(ids.length).toBe(2);

    // They ignored the first and acted on the second.
    await recordFollowUpClick(env as unknown as Bindings, ids[0]!, id);
    await new Promise((r) => setTimeout(r, 2));
    await recordFollowUpClick(env as unknown as Bindings, ids[1]!, id);
    await creditFollowUpRecovery(env as unknown as Bindings, id);

    const credited = await env.DB.prepare(
      `SELECT id FROM followups WHERE submission_id = ? AND recovered_at IS NOT NULL`,
    )
      .bind(id)
      .all<{ id: string }>();
    expect(credited.results).toHaveLength(1);
    // The one they actually acted on last, which is the one that did the work.
    expect(credited.results?.[0]?.id).toBe(ids[1]);
  });

  it("credits nothing when the link was never opened", async () => {
    const id = await seedAbandoned("sub_selfstarter");
    await scheduleFollowUps({
      env: env as unknown as Bindings,
      submissionId: id,
      formId: t.formId,
      organizationId: t.orgId,
      abandonedAt: Date.now() - 5 * 3_600_000,
    });
    await markSent(id);

    // Somebody who came back on their own while a nudge happened to be in their
    // inbox is not a recovery. Counting them is exactly the self-flattery the
    // holdout exists to catch.
    await creditFollowUpRecovery(env as unknown as Bindings, id);
    const stats = await computeFollowUpStats(env as unknown as Bindings, t.formId);
    expect(stats.recovered).toBe(0);
  });

  it("counts holdout people rather than holdout rows", async () => {
    // Three steps' worth of rows for one held-back person. Counting rows would
    // treble the control arm and deflate the baseline it produces.
    const id = await seedAbandoned("sub_holdout");
    const now = Date.now();
    for (const step of [1, 2, 3]) {
      await env.DB.prepare(
        `INSERT INTO followups (id, submission_id, form_id, organization_id, channel, address,
                                address_source, step, status, reason, scheduled_at, created_at)
         VALUES (?, ?, ?, ?, 'email', 'held@example.com', 'answer', ?, 'holdout', 'holdout', ?, ?)`,
      )
        .bind(`flw_hold_${step}`, id, t.formId, t.orgId, step, now, now)
        .run();
    }

    const stats = await computeFollowUpStats(env as unknown as Bindings, t.formId);
    expect(stats.holdout?.people).toBe(1);
    // One person is far under the floor, so no lift figure is offered. A ratio
    // computed from a handful of people is worse than none, because it is the
    // one that gets repeated.
    expect(stats.liftPoints).toBeNull();
  });

  it("reports nothing for a form that never scheduled one", async () => {
    const stats = await computeFollowUpStats(env as unknown as Bindings, t.formId);
    expect(stats.everScheduled).toBe(false);
    expect(stats.sent).toBe(0);
    expect(stats.holdout).toBeNull();
  });
});

/**
 * Catching up the people who left before the sequence covered them.
 *
 * Scheduling is decided once, at the instant a response is abandoned, against
 * the settings live at that instant. So an author who collects twenty partials
 * and only then turns follow-ups on used to get nothing for those twenty —
 * which is backwards, because those twenty are exactly who they were looking at
 * when they turned it on. These are the rules for reaching back, and the two
 * that matter most are about how far (not far) and how fast (not all at once).
 */
describe("backfillFollowUps", () => {
  const HOUR = 3_600_000;
  const DAY = 86_400_000;

  /** An abandoned response that went quiet `agoMs` ago. */
  async function seedAbandonedAt(id: string, agoMs: number): Promise<string> {
    await seedAbandoned(id);
    await env.DB.prepare(`UPDATE submissions SET updated_at = ?, started_at = ? WHERE id = ?`)
      .bind(Date.now() - agoMs, Date.now() - agoMs - HOUR, id)
      .run();
    return id;
  }

  it("schedules a response abandoned two days ago, starting now", async () => {
    await seedAbandonedAt("sbm_catchup_old", 2 * DAY);
    const before = Date.now();

    expect(await backfillFollowUps(env as never, t.formId, t.orgId)).toBe(2);

    const { results } = await rowsFor("sbm_catchup_old");
    expect(results.map((r) => r.status)).toEqual(["scheduled", "scheduled"]);
    /*
      Both configured times — abandonment + 4h and + 24h — are a day in the past.
      Written as configured they would both be due, and the next sweep would put
      two messages in one inbox in one tick.
    */
    expect(results[0]!.scheduled_at).toBeGreaterThanOrEqual(before);
    expect(results[0]!.scheduled_at).toBeLessThanOrEqual(Date.now());
    // And the second still arrives the configured 20 hours after the first.
    expect(results[1]!.scheduled_at - results[0]!.scheduled_at).toBe(20 * HOUR);
  });

  it("leaves a step that is still in the future where the author put it", async () => {
    // Six hours ago: step one (+4h) is two hours overdue, step two (+24h) is not.
    const abandonedAt = Date.now() - 6 * HOUR;
    await seedAbandonedAt("sbm_catchup_partial", 6 * HOUR);
    const before = Date.now();

    expect(await backfillFollowUps(env as never, t.formId, t.orgId)).toBe(2);

    const { results } = await rowsFor("sbm_catchup_partial");
    expect(results[0]!.scheduled_at).toBeGreaterThanOrEqual(before);
    /*
      Step two is pushed out only as far as the configured gap requires. It is
      never pulled *backwards* to its original time, which would land it closer
      to step one than the author ever wrote.
    */
    expect(results[1]!.scheduled_at - results[0]!.scheduled_at).toBe(20 * HOUR);
    expect(results[1]!.scheduled_at).toBeGreaterThan(abandonedAt + 24 * HOUR - HOUR);
  });

  it("does not reach past the lookback window", async () => {
    await seedAbandonedAt("sbm_catchup_stale", (CATCHUP_LOOKBACK_DAYS + 1) * DAY);

    expect(await backfillFollowUps(env as never, t.formId, t.orgId)).toBe(0);
    expect((await rowsFor("sbm_catchup_stale")).results).toHaveLength(0);
  });

  it("is idempotent — a second publish finds nothing left to do", async () => {
    await seedAbandonedAt("sbm_catchup_twice", 2 * DAY);
    expect(await backfillFollowUps(env as never, t.formId, t.orgId)).toBe(2);

    expect(await backfillFollowUps(env as never, t.formId, t.orgId)).toBe(0);
    expect((await rowsFor("sbm_catchup_twice")).results).toHaveLength(2);
  });

  it("does not touch a response that already has a schedule", async () => {
    await seedAbandonedAt("sbm_catchup_scheduled", 2 * HOUR);
    await scheduleFollowUps({
      env: env as never,
      submissionId: "sbm_catchup_scheduled",
      formId: t.formId,
      organizationId: t.orgId,
      abandonedAt: Date.now() - 2 * HOUR,
    });
    const original = (await rowsFor("sbm_catchup_scheduled")).results.map((r) => r.scheduled_at);

    expect(await backfillFollowUps(env as never, t.formId, t.orgId)).toBe(0);
    expect((await rowsFor("sbm_catchup_scheduled")).results.map((r) => r.scheduled_at)).toEqual(original);
  });

  it("clears the note explaining why nothing was scheduled", async () => {
    await seedAbandonedAt("sbm_catchup_note", DAY);
    await env.DB.prepare(`UPDATE submissions SET meta = json_object('followUpSkip', 'disabled') WHERE id = ?`)
      .bind("sbm_catchup_note")
      .run();

    await backfillFollowUps(env as never, t.formId, t.orgId);

    const row = await env.DB.prepare(
      `SELECT json_extract(meta, '$.followUpSkip') AS skip FROM submissions WHERE id = ?`,
    )
      .bind("sbm_catchup_note")
      .first<{ skip: string | null }>();
    // The results table reads this to explain a "Not sent" badge. It is now a lie.
    expect(row?.skip).toBeNull();
  });

  it("ignores responses that are not abandoned, and test-mode ones", async () => {
    await seedAbandonedAt("sbm_catchup_live", DAY);
    await seedAbandonedAt("sbm_catchup_done", DAY);
    await env.DB.prepare(`UPDATE submissions SET status = 'completed' WHERE id = ?`).bind("sbm_catchup_done").run();
    await seedAbandonedAt("sbm_catchup_test", DAY);
    await env.DB.prepare(`UPDATE submissions SET is_test = 1 WHERE id = ?`).bind("sbm_catchup_test").run();

    expect(await backfillFollowUps(env as never, t.formId, t.orgId)).toBe(2);
    expect((await rowsFor("sbm_catchup_done")).results).toHaveLength(0);
    expect((await rowsFor("sbm_catchup_test")).results).toHaveLength(0);
    expect((await rowsFor("sbm_catchup_live")).results).toHaveLength(2);
  });

  it("schedules nothing while the sequence is switched off", async () => {
    await publish({ ...DOC, settings: { followUp: { ...DOC.settings.followUp, enabled: false } } });
    await seedAbandonedAt("sbm_catchup_off", DAY);
    try {
      expect(await backfillFollowUps(env as never, t.formId, t.orgId)).toBe(0);
      expect((await rowsFor("sbm_catchup_off")).results).toHaveLength(0);
    } finally {
      await publish();
    }
  });

  it("schedules a page that spans several chunks, and stops at the cap", async () => {
    /*
      Above `CATCHUP_CHUNK` and above `CATCHUP_LIMIT`, because both boundaries
      are invisible from a single-response test: the chunk loop reads, decides
      and writes a slice at a time, and the reads bind one parameter per id —
      a page read in one `IN (...)` would sit exactly on D1's hundred-parameter
      limit, which the local D1 does not enforce and production does.
    */
    const abandonedAt = Date.now() - DAY;
    const seeded = Array.from({ length: 110 }, (_, i) => `sbm_catchup_bulk_${String(i).padStart(3, "0")}`);
    // Seeded in one batch rather than through `seedAbandoned`: a hundred and ten
    // responses at three sequential statements each is slow enough to be a
    // timeout rather than a test.
    await env.DB.batch(
      seeded.flatMap((id, i) => [
        env.DB
          .prepare(
            `INSERT INTO submissions (id, form_id, form_version_id, organization_id, status, source, is_test, started_at, updated_at)
             VALUES (?, ?, ?, ?, 'abandoned', 'chat', 0, ?, ?)`,
          )
          .bind(id, t.formId, VERSION_ID, t.orgId, abandonedAt - HOUR, abandonedAt),
        env.DB
          .prepare(
            `INSERT INTO submission_answers (id, submission_id, form_id, block_ref, block_type, value_json, updated_at)
             VALUES (?, ?, ?, 'q_email', 'short_text', ?, ?)`,
          )
          .bind(`ans_${id}`, id, t.formId, JSON.stringify(`person${i}@northwind.example`), abandonedAt),
      ]),
    );

    // Two steps each, capped at a hundred responses.
    expect(await backfillFollowUps(env as never, t.formId, t.orgId)).toBe(200);

    const counted = await env.DB.prepare(
      `SELECT COUNT(DISTINCT submission_id) AS people, COUNT(*) AS rows FROM followups WHERE form_id = ?`,
    )
      .bind(t.formId)
      .first<{ people: number; rows: number }>();
    expect(counted).toEqual({ people: 100, rows: 200 });

    // The ten the cap left behind are picked up by the next publish.
    expect(await backfillFollowUps(env as never, t.formId, t.orgId)).toBe(20);
    const after = await env.DB.prepare(
      `SELECT COUNT(DISTINCT submission_id) AS people FROM followups WHERE form_id = ?`,
    )
      .bind(t.formId)
      .first<{ people: number }>();
    expect(after?.people).toBe(110);
    expect(seeded).toHaveLength(110);
  });

  it("still refuses everyone the per-response gates refuse", async () => {
    await seedAbandonedAt("sbm_catchup_suppressed", DAY);
    await suppress(env as never, t.orgId, "maya@northwind.example", "unsubscribe");

    expect(await backfillFollowUps(env as never, t.formId, t.orgId)).toBe(0);
    expect((await rowsFor("sbm_catchup_suppressed")).results).toHaveLength(0);
  });
});

/**
 * The wiring, rather than the decision.
 *
 * `backfillFollowUps` is tested above against every reason it declines. This is
 * the one assertion that the publish path actually calls it — the whole feature
 * is a no-op if turning the sequence on does not reach it, and that is a
 * one-line mistake that no unit test of the function itself would catch.
 */
describe("publishing catches up the people already waiting", () => {
  it("schedules for a response abandoned before the sequence was switched on", async () => {
    const { publishForm } = await import("../src/lib/forms-service.js");
    const { getEntitlements } = await import("../src/lib/entitlements.js");

    // Live with follow-ups off, and somebody leaves.
    const off = { ...DOC, settings: { followUp: { ...DOC.settings.followUp, enabled: false } } };
    await publish(off);
    await seedAbandoned("sbm_publish_catchup");
    await env.DB.prepare(`UPDATE submissions SET updated_at = ? WHERE id = ?`)
      .bind(Date.now() - 2 * 3_600_000, "sbm_publish_catchup")
      .run();
    await scheduleFollowUps({
      env: env as never,
      submissionId: "sbm_publish_catchup",
      formId: t.formId,
      organizationId: t.orgId,
      abandonedAt: Date.now() - 2 * 3_600_000,
    });
    expect((await rowsFor("sbm_publish_catchup")).results).toHaveLength(0);

    // The author turns the sequence on and publishes.
    await env.DB.prepare(`UPDATE forms SET working_schema = ? WHERE id = ?`)
      .bind(JSON.stringify(DOC), t.formId)
      .run();
    const res = await publishForm(env as never, {
      formId: t.formId,
      userId: null,
      ent: await getEntitlements(env as never, t.orgId),
      orgId: t.orgId,
    });
    expect(res.ok).toBe(true);

    const { results } = await rowsFor("sbm_publish_catchup");
    expect(results).toHaveLength(2);
    expect(results.every((r) => r.status === "scheduled")).toBe(true);
  });
});

/**
 * Topping up a sequence the author lengthened after people had already left.
 *
 * The bug this fixes was visible in the results table as two ladders side by
 * side on the same form: "2 of 2 sent" for everyone who walked away under the
 * old settings, "0 of 3" for everyone who arrived after the edit. Both were
 * honest reports of the rows that existed. The rows were the problem.
 */
describe("topping up a lengthened sequence", () => {
  const HOUR = 3_600_000;
  const DAY = 86_400_000;

  /** The published two-step sequence, plus a third at 72 hours. */
  const THREE_STEP = {
    ...DOC,
    settings: {
      followUp: {
        ...DOC.settings.followUp,
        steps: [
          ...DOC.settings.followUp.steps,
          { delayHours: 72, subject: "Last reminder about {{form.title}}", bodyMd: "" },
        ],
      },
    },
  };

  /** Abandoned `agoMs` ago, with the two-step sequence already on the books. */
  async function seedWithTwoSteps(id: string, agoMs = 2 * DAY): Promise<number> {
    const abandonedAt = Date.now() - agoMs;
    await seedAbandoned(id);
    await env.DB.prepare(`UPDATE submissions SET updated_at = ?, started_at = ? WHERE id = ?`)
      .bind(abandonedAt, abandonedAt - HOUR, id)
      .run();
    await scheduleFollowUps({
      env: env as never,
      submissionId: id,
      formId: t.formId,
      organizationId: t.orgId,
      abandonedAt,
    });
    return abandonedAt;
  }

  it("writes the step that did not exist when they walked away", async () => {
    await seedWithTwoSteps("sbm_topup_basic");
    expect((await rowsFor("sbm_topup_basic")).results).toHaveLength(2);

    await publish(THREE_STEP);
    try {
      await backfillFollowUps(env as never, t.formId, t.orgId);
      const { results } = await rowsFor("sbm_topup_basic");
      expect(results.map((r) => r.step)).toEqual([1, 2, 3]);
      expect(results[2]!.status).toBe("scheduled");
    } finally {
      await publish();
    }
  });

  it("leaves the steps that already existed exactly where they were", async () => {
    await seedWithTwoSteps("sbm_topup_untouched");
    const before = (await rowsFor("sbm_topup_untouched")).results.map((r) => r.scheduled_at);

    await publish(THREE_STEP);
    try {
      await backfillFollowUps(env as never, t.formId, t.orgId);
      const after = (await rowsFor("sbm_topup_untouched")).results.map((r) => r.scheduled_at);
      // The insert is ON CONFLICT DO NOTHING, so a top-up cannot re-time a
      // reminder somebody is already waiting on.
      expect(after.slice(0, 2)).toEqual(before);
    } finally {
      await publish();
    }
  });

  it("does not land the new step on top of one that just went out", async () => {
    await seedWithTwoSteps("sbm_topup_after_sent");
    await env.DB.prepare(
      `UPDATE followups SET status = 'sent', sent_at = ? WHERE submission_id = ? AND step IN (1, 2)`,
    )
      .bind(Date.now() - HOUR, "sbm_topup_after_sent")
      .run();

    await publish(THREE_STEP);
    try {
      await backfillFollowUps(env as never, t.formId, t.orgId);
      const { results } = await rowsFor("sbm_topup_after_sent");
      expect(results.map((r) => r.status)).toEqual(["sent", "sent", "scheduled"]);
      /*
        The catch-up chain is what guarantees this without a query: every step
        starts from `now` and keeps the author's own gap, so the new third step
        is at least the 48 hours between step two and step three away from a
        send that happened a moment ago. This is the assertion that makes it
        safe not to read `MAX(sent_at)`.
      */
      expect(results[2]!.scheduled_at).toBeGreaterThanOrEqual(Date.now() + 48 * HOUR - HOUR);
    } finally {
      await publish();
    }
  });

  it("stays idempotent once the sequence is whole", async () => {
    await seedWithTwoSteps("sbm_topup_idempotent");
    await publish(THREE_STEP);
    try {
      await backfillFollowUps(env as never, t.formId, t.orgId);
      const first = (await rowsFor("sbm_topup_idempotent")).results.map((r) => r.scheduled_at);

      expect(await backfillFollowUps(env as never, t.formId, t.orgId)).toBe(0);
      await backfillFollowUps(env as never, t.formId, t.orgId);

      const { results } = await rowsFor("sbm_topup_idempotent");
      expect(results).toHaveLength(3);
      expect(results.map((r) => r.scheduled_at)).toEqual(first);
    } finally {
      await publish();
    }
  });

  /**
   * The three ways a sequence is already over, none of which a longer ladder
   * is a reason to restart.
   */
  it.each([
    ["cancelled", "they came back or unsubscribed"],
    ["failed", "delivery gave up after five attempts"],
    ["holdout", "they are the control arm"],
  ])("does not restart a %s sequence (%s)", async (status) => {
    const id = `sbm_topup_${status}`;
    await seedWithTwoSteps(id);
    await env.DB.prepare(`UPDATE followups SET status = ? WHERE submission_id = ?`)
      .bind(status, id)
      .run();

    await publish(THREE_STEP);
    try {
      await backfillFollowUps(env as never, t.formId, t.orgId);
      const { results } = await rowsFor(id);
      expect(results).toHaveLength(2);
      expect(results.some((r) => r.status === "scheduled")).toBe(false);
    } finally {
      await publish();
    }
  });

  it("still bootstraps a response that has no rows at all", async () => {
    // The case the old predicate was written for. The new one has to subsume
    // it, not replace it.
    await seedAbandoned("sbm_topup_bootstrap");
    await env.DB.prepare(`UPDATE submissions SET updated_at = ? WHERE id = ?`)
      .bind(Date.now() - 2 * DAY, "sbm_topup_bootstrap")
      .run();

    await backfillFollowUps(env as never, t.formId, t.orgId);
    expect((await rowsFor("sbm_topup_bootstrap")).results).toHaveLength(2);
  });

  it("is not a candidate when the author shortened the sequence instead", async () => {
    await seedWithTwoSteps("sbm_topup_shortened");
    const before = (await rowsFor("sbm_topup_shortened")).results.map((r) => r.scheduled_at);

    const oneStep = {
      ...DOC,
      settings: { followUp: { ...DOC.settings.followUp, steps: [DOC.settings.followUp.steps[0]!] } },
    };
    await publish(oneStep);
    try {
      expect(await backfillFollowUps(env as never, t.formId, t.orgId)).toBe(0);
      expect((await rowsFor("sbm_topup_shortened")).results.map((r) => r.scheduled_at)).toEqual(before);
    } finally {
      await publish();
    }
  });

  it("cancels what it just wrote for somebody who came back while it ran", async () => {
    await seedWithTwoSteps("sbm_topup_resumed");
    // Stands in for the resume that lands between the candidate read and the
    // write batch: the true interleaving is not reproducible, the state it
    // leaves behind is.
    await env.DB.prepare(`UPDATE submissions SET status = 'in_progress' WHERE id = ?`)
      .bind("sbm_topup_resumed")
      .run();

    await publish(THREE_STEP);
    try {
      await backfillFollowUps(env as never, t.formId, t.orgId);
      const { results } = await rowsFor("sbm_topup_resumed");
      expect(results.some((r) => r.status === "scheduled" && r.step === 3)).toBe(false);
    } finally {
      await publish();
    }
  });
});

/**
 * Quiet hours: the same sequence, held out of the respondent's night.
 *
 * The exact minute a reminder lands is the module's business and is tested in
 * `quiet-hours.test.ts`. What matters here is that the scheduler reads the
 * right clock — the respondent's before the author's — and that the shift
 * composes correctly with the two rules that were already in this loop: the
 * catch-up spacing, and the refusal to invite somebody to a form that has
 * closed.
 */
describe("quiet hours", () => {
  const HOUR = 3_600_000;

  /** UTC+12 the year round, so its waking window is exactly UTC's night. */
  const ANTIPODE = "Etc/GMT-12";

  function withQuietHours(extra: Record<string, unknown> = {}, steps = DOC.settings.followUp.steps) {
    return {
      ...DOC,
      settings: {
        followUp: { ...DOC.settings.followUp, steps, quietHours: true, timezone: "UTC", ...extra },
      },
    };
  }

  /** An abandoned response whose session reported `tz`. */
  async function seedWithSession(id: string, tz: string | null): Promise<void> {
    await seedAbandoned(id);
    const now = Date.now();
    await env.DB.prepare(
      `INSERT INTO chat_sessions (id, form_id, form_version_id, organization_id, respondent_token_hash,
                                  status, timezone, created_at, last_activity_at)
       VALUES (?, ?, ?, ?, ?, 'abandoned', ?, ?, ?)`,
    )
      .bind(`cs_${id}`, t.formId, VERSION_ID, t.orgId, `hash_${id}`, tz, now, now)
      .run();
    await env.DB.prepare(`UPDATE submissions SET session_id = ? WHERE id = ?`)
      .bind(`cs_${id}`, id)
      .run();
  }

  async function schedule(id: string, abandonedAt = Date.now()): Promise<void> {
    await scheduleFollowUps({
      env: env as never,
      submissionId: id,
      formId: t.formId,
      organizationId: t.orgId,
      abandonedAt,
    });
  }

  it("changes nothing at all while it is switched off", async () => {
    const abandonedAt = Date.now();
    await seedAbandoned("sbm_quiet_off");
    await schedule("sbm_quiet_off", abandonedAt);

    const { results } = await rowsFor("sbm_quiet_off");
    // Byte-identical to the arithmetic that shipped before this feature: this
    // is what keeps every form that predates quiet hours behaving as it did.
    expect(results.map((r) => r.scheduled_at)).toEqual([
      abandonedAt + 4 * HOUR,
      abandonedAt + 24 * HOUR,
    ]);
  });

  it("holds a step due overnight until the next morning", async () => {
    /*
      Pinned to a real night rather than to whenever the suite happens to run.
      Step one falls due at 23:00 and must land at 09:00 the next morning, to
      the millisecond; step two falls due at 19:00 the following evening and
      must not move at all.
    */
    const target = nextUtcHour(23);
    await publish(withQuietHours());
    try {
      await seedAbandoned("sbm_quiet_form_zone");
      await schedule("sbm_quiet_form_zone", target - 4 * HOUR);

      const { results } = await rowsFor("sbm_quiet_form_zone");
      expect(results).toHaveLength(2);
      expect(results[0]!.scheduled_at).toBe(target + 10 * HOUR);
      expect(results[1]!.scheduled_at).toBe(target + 20 * HOUR);
      for (const row of results) expect(inWindow(row.scheduled_at, "UTC")).toBe(true);
    } finally {
      await publish();
    }
  });

  it("prefers the respondent's own clock over the form's", async () => {
    await publish(withQuietHours());
    try {
      await seedWithSession("sbm_quiet_respondent", ANTIPODE);
      await schedule("sbm_quiet_respondent");

      const { results } = await rowsFor("sbm_quiet_respondent");
      expect(results.length).toBeGreaterThan(0);
      for (const row of results) {
        /*
          UTC+12's waking window is exactly UTC's night, so these two assertions
          cannot both hold by accident: a scheduler that read the form's zone
          instead would land every row inside the UTC window and fail the
          second one.
        */
        expect(inWindow(row.scheduled_at, ANTIPODE)).toBe(true);
        expect(inWindow(row.scheduled_at, "UTC")).toBe(false);
      }
    } finally {
      await publish();
    }
  });

  it("falls back to the form when the respondent's browser said nothing", async () => {
    await publish(withQuietHours());
    try {
      const target = nextUtcHour(23);
      await seedWithSession("sbm_quiet_no_session_zone", null);
      await schedule("sbm_quiet_no_session_zone", target - 4 * HOUR);

      const { results } = await rowsFor("sbm_quiet_no_session_zone");
      expect(results[0]!.scheduled_at).toBe(target + 10 * HOUR);
    } finally {
      await publish();
    }
  });

  it("falls through a zone nobody can read rather than throwing", async () => {
    // Reachable by writing the document through the API. A zone we cannot
    // parse must degrade to UTC, not take the whole schedule down with it.
    await publish(withQuietHours({ timezone: "Mars/Olympus" }));
    try {
      const target = nextUtcHour(23);
      await seedAbandoned("sbm_quiet_junk_zone");
      await schedule("sbm_quiet_junk_zone", target - 4 * HOUR);

      const { results } = await rowsFor("sbm_quiet_junk_zone");
      expect(results).toHaveLength(2);
      // UTC, which is what an unreadable zone resolves to.
      expect(results[0]!.scheduled_at).toBe(target + 10 * HOUR);
    } finally {
      await publish();
    }
  });

  it("does not let two steps squeezed out of one night arrive together", async () => {
    /*
      Both steps fall inside the same UTC night — 23:00 and 01:00 — so both
      resolve to nine the next morning unless something holds them apart.
    */
    const target = nextUtcHour(23);
    await publish(
      withQuietHours({}, [
        { delayHours: 1, subject: "First", bodyMd: "" },
        { delayHours: 3, subject: "Second", bodyMd: "" },
      ]),
    );
    try {
      await seedAbandoned("sbm_quiet_spacing");
      await schedule("sbm_quiet_spacing", target - HOUR);

      const { results } = await rowsFor("sbm_quiet_spacing");
      expect(results).toHaveLength(2);
      expect(results[1]!.scheduled_at - results[0]!.scheduled_at).toBeGreaterThanOrEqual(2 * HOUR);
      for (const row of results) expect(inWindow(row.scheduled_at, "UTC")).toBe(true);
    } finally {
      await publish();
    }
  });

  it("drops a step the hold would carry past the form's close", async () => {
    /*
      Due at 23:00, held until 09:00, and the form shuts at 08:00 in between.
      Checked against the time it will actually go rather than the time it was
      due, or this becomes an invitation to a door we locked overnight.
    */
    const target = nextUtcHour(23);
    const closeAt = new Date(target + 9 * HOUR).toISOString();
    await publish({
      ...withQuietHours(),
      settings: { ...withQuietHours().settings, closeRules: { closeAt } },
    });
    try {
      await seedAbandoned("sbm_quiet_close");
      await schedule("sbm_quiet_close", target - 4 * HOUR);

      expect((await rowsFor("sbm_quiet_close")).results).toHaveLength(0);
      const row = await env.DB.prepare(
        `SELECT json_extract(meta, '$.followUpSkip') AS skip FROM submissions WHERE id = ?`,
      )
        .bind("sbm_quiet_close")
        .first<{ skip: string | null }>();
      expect(row?.skip).toBe("closed");
    } finally {
      await publish();
    }
  });

  it("holds an already-overdue step to the next morning, not the last one", async () => {
    /*
      A response abandoned by a sweep long after the respondent actually left.
      Its configured times are in the past, and the window they fell in is over
      — shifting from the stored instant would compute a morning that has been
      and gone and send at three regardless.
    */
    await publish(withQuietHours());
    try {
      await seedAbandoned("sbm_quiet_overdue");
      await schedule("sbm_quiet_overdue", Date.now() - 5 * 86_400_000);

      const { results } = await rowsFor("sbm_quiet_overdue");
      expect(results).toHaveLength(2);
      for (const row of results) {
        expect(row.scheduled_at).toBeGreaterThanOrEqual(Date.now() - HOUR);
        expect(inWindow(row.scheduled_at, "UTC")).toBe(true);
      }
    } finally {
      await publish();
    }
  });

  it("keeps a caught-up sequence in the window too", async () => {
    await publish(withQuietHours());
    try {
      await seedAbandoned("sbm_quiet_catchup");
      await env.DB.prepare(`UPDATE submissions SET updated_at = ? WHERE id = ?`)
        .bind(Date.now() - 2 * 86_400_000, "sbm_quiet_catchup")
        .run();

      await backfillFollowUps(env as never, t.formId, t.orgId);

      const { results } = await rowsFor("sbm_quiet_catchup");
      expect(results.length).toBeGreaterThan(0);
      for (const row of results) {
        expect(row.scheduled_at).toBeGreaterThanOrEqual(Date.now() - HOUR);
        expect(inWindow(row.scheduled_at, "UTC")).toBe(true);
      }
    } finally {
      await publish();
    }
  });
});

/** The next time it is `hour` o'clock UTC, strictly in the future. */
function nextUtcHour(hour: number): number {
  const now = new Date();
  const today = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
    hour,
    0,
    0,
    0,
  );
  return today > Date.now() + 2 * 3_600_000 ? today : today + 86_400_000;
}

/**
 * The ceiling is a person, not a response.
 *
 * A sequence is numbered per response, and one person can have several: they
 * start the form, give up, come back later or on another device, and start
 * again. Before this, each abandonment opened a fresh sequence — so an author
 * who asked for three reminders sent six to one person, and somebody opening
 * and abandoning repeatedly could be mailed indefinitely by a form whose
 * settings said three.
 *
 * Keyed on the browser fingerprint, which is what this product uses to tell one
 * respondent from another. A visit that produced no fingerprint has no key, and
 * the rule does not apply to it.
 */
describe("the per-person reminder cap", () => {
  const HOUR = 3_600_000;
  const SAME_PERSON = "fp_same_person_key";

  /** An abandoned response carrying `key` and `email`, with its sequence scheduled. */
  async function abandonAs(
    id: string,
    key: string | null,
    email = "repeat@northwind.example",
    agoMs = HOUR,
  ): Promise<void> {
    await seedAbandoned(id, { q_name: "Maya", q_email: email });
    await env.DB.prepare(
      `UPDATE submissions SET updated_at = ?, started_at = ?, fingerprint = ? WHERE id = ?`,
    )
      .bind(Date.now() - agoMs, Date.now() - agoMs - HOUR, key, id)
      .run();
    await scheduleFollowUps({
      env: env as never,
      submissionId: id,
      formId: t.formId,
      organizationId: t.orgId,
      abandonedAt: Date.now() - agoMs,
    });
  }

  /** Every reminder this person has on the form, whatever response wrote it. */
  function forPerson(key: string, email = "repeat@northwind.example") {
    return env.DB.prepare(
      `SELECT fu.status FROM followups fu JOIN submissions s ON s.id = fu.submission_id
        WHERE fu.form_id = ? AND (s.fingerprint = ? OR fu.address = ?)
        ORDER BY fu.scheduled_at`,
    )
      .bind(t.formId, key, email)
      .all<{ status: string }>();
  }

  it("gives a second response from the same person nothing", async () => {
    await abandonAs("sbm_cap_first", SAME_PERSON);
    await abandonAs("sbm_cap_second", SAME_PERSON);

    // Two steps configured, so two reminders — not two each.
    expect((await forPerson(SAME_PERSON)).results).toHaveLength(2);
    expect((await rowsFor("sbm_cap_second")).results).toHaveLength(0);
  });

  it("says why, where the author is already looking", async () => {
    await abandonAs("sbm_cap_note_first", SAME_PERSON);
    await abandonAs("sbm_cap_note_second", SAME_PERSON);

    const row = await env.DB.prepare(
      `SELECT json_extract(meta, '$.followUpSkip') AS skip FROM submissions WHERE id = ?`,
    )
      .bind("sbm_cap_note_second")
      .first<{ skip: string | null }>();
    expect(row?.skip).toBe("already_reminded");
  });

  it("spends what is left of the budget rather than all or nothing", async () => {
    // One reminder used, so the next response may write exactly one — and it
    // writes the *first* of the author's messages, not the last.
    await abandonAs("sbm_cap_partial_first", SAME_PERSON);
    await env.DB.prepare(`DELETE FROM followups WHERE submission_id = ? AND step = 2`)
      .bind("sbm_cap_partial_first")
      .run();

    await abandonAs("sbm_cap_partial_second", SAME_PERSON);

    const second = (await rowsFor("sbm_cap_partial_second")).results;
    expect(second).toHaveLength(1);
    expect(second[0]!.step).toBe(1);
    expect((await forPerson(SAME_PERSON)).results).toHaveLength(2);
  });

  it("does not spend the budget on a sequence that was cancelled", async () => {
    // They came back and finished, so the rows were cancelled and nothing
    // landed. A later abandonment starts with a clean budget.
    await abandonAs("sbm_cap_cancelled", SAME_PERSON);
    await cancelFollowUps(env as never, "sbm_cap_cancelled", "resumed");

    await abandonAs("sbm_cap_after_cancel", SAME_PERSON);
    expect((await rowsFor("sbm_cap_after_cancel")).results).toHaveLength(2);
  });

  it("leaves a different person alone", async () => {
    await abandonAs("sbm_cap_theirs", SAME_PERSON);
    await abandonAs("sbm_cap_someone_else", "fp_a_different_person", "else@northwind.example");

    expect((await rowsFor("sbm_cap_someone_else")).results).toHaveLength(2);
  });

  /**
   * The two halves of "the same person", each covering what the other misses.
   */
  it("recognises one inbox reached from two browsers", async () => {
    // A laptop and a phone are two fingerprints. They are not two people, and
    // the mail lands in one place. This is the case a fingerprint-only cap
    // misses, and the case the headless API — which has no fingerprint at all —
    // consists entirely of.
    await abandonAs("sbm_cap_laptop", "fp_laptop");
    await abandonAs("sbm_cap_phone", "fp_phone");

    expect((await rowsFor("sbm_cap_phone")).results).toHaveLength(0);
  });

  it("recognises one browser that gave two addresses", async () => {
    // The reverse: same browser, a second attempt typed with another address.
    // This is the case an address-only cap misses.
    await abandonAs("sbm_cap_addr_one", SAME_PERSON, "first@northwind.example");
    await abandonAs("sbm_cap_addr_two", SAME_PERSON, "second@northwind.example");

    expect((await rowsFor("sbm_cap_addr_two")).results).toHaveLength(0);
  });

  it("caps a visit with no fingerprint by the inbox alone", async () => {
    // Every response made through the headless API looks like this.
    await abandonAs("sbm_cap_keyless_one", null);
    await abandonAs("sbm_cap_keyless_two", null);

    expect((await rowsFor("sbm_cap_keyless_two")).results).toHaveLength(0);
  });

  it("holds inside one catch-up chunk, where nothing is written until the end", async () => {
    /*
      Both responses are decided before either is written, so they read the same
      stored count. Without a running tally inside the chunk they would each be
      granted the whole budget and the batch would spend it twice.
    */
    await seedAbandoned("sbm_cap_chunk_a", { q_name: "A", q_email: "chunk@northwind.example" });
    await seedAbandoned("sbm_cap_chunk_b", { q_name: "B", q_email: "chunk@northwind.example" });
    await env.DB.prepare(
      `UPDATE submissions SET updated_at = ?, fingerprint = ? WHERE id IN (?, ?)`,
    )
      .bind(Date.now() - 2 * 86_400_000, SAME_PERSON, "sbm_cap_chunk_a", "sbm_cap_chunk_b")
      .run();

    await backfillFollowUps(env as never, t.formId, t.orgId);
    expect((await forPerson(SAME_PERSON, "chunk@northwind.example")).results).toHaveLength(2);
  });
});
