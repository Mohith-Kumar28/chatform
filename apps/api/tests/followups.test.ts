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
} from "../src/lib/followups.js";
import { finalizeResponse, type ResponseOwner } from "../src/lib/submissions.js";
import { computeFollowUpStats } from "../src/lib/followup-analytics.js";
import { sweepFollowUps } from "../src/lib/sweeps.js";
import { resolveRespondentAddress } from "../src/lib/respondent-address.js";
import { sendMail } from "../src/lib/mail.js";
import { readFormDoc } from "@repo/form-schema";
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
    const theirs = await seedAbandoned("sub_theirs");
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
