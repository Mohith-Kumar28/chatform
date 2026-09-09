import { describe, it, expect, beforeAll } from "vitest";
import { env } from "cloudflare:test";
import { applySchema, seedTenant, type Tenant } from "./helpers.js";
import { runMailJob } from "../src/lib/mail-jobs.js";
import { mailFrom, sendMail } from "../src/lib/mail.js";
import type { Bindings } from "../src/env.js";
import { DEFAULT_CONFIRMATION_SUBJECT, SCHEMA_VERSION } from "@repo/form-schema";

/**
 * The email layer, from a queued job to what lands in the inbox.
 *
 * Sending is the one feature in this codebase whose failure is invisible from
 * the inside: nothing 500s, no row is missing, and the only symptom is a
 * customer saying "I never got it" weeks later. So the assertions here are
 * about the *content* of what would have been sent — who it goes to, what it
 * says, whose answers are in it — rather than about whether the call was made.
 *
 * A fake binding stands in for Cloudflare Email Service. Miniflare does not
 * implement `send_email`, so this is also the only way these paths can be
 * exercised at all.
 */

interface Captured {
  to: string;
  from: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
}

/** A `SendEmail` binding that records instead of sending. */
function captureBinding(): { sent: Captured[]; binding: SendEmail } {
  const sent: Captured[] = [];
  const binding = {
    send: async (msg: unknown) => {
      const m = msg as Captured;
      sent.push(m);
      return { messageId: `msg_${sent.length}` } as unknown as EmailSendResult;
    },
  } as unknown as SendEmail;
  return { sent, binding };
}

function withMail(overrides: Partial<Bindings> = {}): Bindings {
  return { ...(env as unknown as Bindings), ...overrides };
}

let t: Tenant;

const VERSION_ID = "ver_mailtest";

/**
 * Two questions and an email block, because the auto-reply's fallback recipient
 * is "the first answer to an email block" and that only means something when
 * there is one.
 */
const DOC = {
  /**
   * Current, and it has to be: the v7 → v8 migration switches the confirmation
   * email on for every older document, so a doc published at v4 could not
   * express "the author turned this off" — which is half of what these tests
   * assert. `tests/schema-migration.test.ts` covers the legacy path instead.
   */
  schemaVersion: SCHEMA_VERSION,
  title: "Feedback",
  blocks: [
    { id: "blk_mail1", ref: "q_name", type: "short_text", title: "Your name", required: true },
    { id: "blk_mail2", ref: "q_email", type: "email", title: "Your email", required: true },
    {
      id: "blk_mail3",
      ref: "q_pick",
      type: "single_select",
      title: "Favourite",
      required: false,
      options: [
        { id: "opt_tea", label: "Tea" },
        { id: "opt_coffee", label: "Coffee" },
      ],
    },
  ],
  endings: [{ id: "end_mail", ref: "end_thanks", title: "Thanks!", bodyMd: "" }],
  logic: [],
  endingRules: [],
  variables: [],
  hiddenFields: [],
  layout: {},
  settings: {},
  theme: {},
};

/** Publish `doc` as this form's active version. */
async function publish(doc: unknown): Promise<void> {
  const now = Date.now();
  await env.DB.prepare(
    `INSERT INTO form_versions (id, form_id, version, schema_json, checksum, published_at, created_at)
     VALUES (?1, ?2, 1, ?3, 'x', ?4, ?4)
     ON CONFLICT(id) DO UPDATE SET schema_json = ?3`,
  )
    .bind(VERSION_ID, t.formId, JSON.stringify(doc), now)
    .run();
  await env.DB.prepare(`UPDATE forms SET active_version_id = ?1, title = ?2 WHERE id = ?3`)
    .bind(VERSION_ID, "Feedback", t.formId)
    .run();
}

/** A completed response with three answers on it. */
async function seedResponse(
  id: string,
  opts: { respondentEmail?: string | null; status?: string } = {},
): Promise<void> {
  const now = Date.now();
  await env.DB.prepare(
    `INSERT INTO submissions (id, form_id, form_version_id, organization_id, status, respondent_email,
                              source, is_test, started_at, completed_at, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'chat', 0, ?7, ?7, ?7)`,
  )
    .bind(
      id,
      t.formId,
      VERSION_ID,
      t.orgId,
      opts.status ?? "completed",
      opts.respondentEmail ?? null,
      now,
    )
    .run();

  const answers: [string, string, unknown][] = [
    ["q_name", "short_text", "Ada"],
    ["q_email", "email", "ada@example.com"],
    ["q_pick", "single_select", "opt_coffee"],
  ];
  await env.DB.batch(
    answers.map(([ref, type, value], i) =>
      env.DB.prepare(
        `INSERT INTO submission_answers (id, submission_id, form_id, block_ref, block_type, value_json, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`,
      ).bind(`ans_${id}_${i}`, id, t.formId, ref, type, JSON.stringify(value), now),
    ),
  );
}

beforeAll(async () => {
  await applySchema();
  t = await seedTenant("mailtest");
});

describe("transport", () => {
  it("prefers the Cloudflare binding and passes the From through", async () => {
    const { sent, binding } = captureBinding();
    const res = await sendMail(
      withMail({ EMAIL: binding, EMAIL_FROM: "chatform <hello@chatform.in>" }),
      { to: "x@example.com", subject: "Hi", html: "<p>Hi</p>", text: "Hi" },
    );
    expect(res.transport).toBe("cloudflare");
    expect(res.messageId).toBe("msg_1");
    expect(sent[0]!.from).toBe("chatform <hello@chatform.in>");
    expect(sent[0]!.to).toBe("x@example.com");
  });

  /**
   * The whole reason `RESEND_API_KEY` is still in `Bindings`: Email Sending is
   * in beta on an unpublished, reputation-scaled daily quota, and the fallback
   * has to be a variable rather than a rewrite on the day that bites.
   */
  it("falls back to Resend when the binding is absent", async () => {
    const calls: { url: string; body: unknown }[] = [];
    const original = globalThis.fetch;
    globalThis.fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(url), body: JSON.parse(String(init?.body)) });
      return new Response(JSON.stringify({ id: "re_123" }), { status: 200 });
    }) as typeof fetch;
    try {
      const res = await sendMail(withMail({ EMAIL: undefined, RESEND_API_KEY: "re_test" }), {
        to: "x@example.com",
        subject: "Hi",
        html: "<p>Hi</p>",
        text: "Hi",
      });
      expect(res.transport).toBe("resend");
      expect(res.messageId).toBe("re_123");
      expect(calls[0]!.url).toBe("https://api.resend.com/emails");
    } finally {
      globalThis.fetch = original;
    }
  });

  it("no-ops rather than throwing when nothing is configured", async () => {
    const res = await sendMail(withMail({ EMAIL: undefined, RESEND_API_KEY: undefined }), {
      to: "x@example.com",
      subject: "Hi",
      html: "<p>Hi</p>",
      text: "Hi",
    });
    expect(res.transport).toBe("noop");
  });

  /**
   * The API answers at `api.chatform.in`, and mail from `noreply@api.chatform.in`
   * would need that subdomain onboarded separately — so the derived default has
   * to drop the leading label.
   */
  it("derives a From at the apex, not at the API subdomain", () => {
    expect(mailFrom(withMail({ EMAIL_FROM: undefined, APP_ORIGIN: "https://api.chatform.in" }))).toBe(
      "chatform <noreply@chatform.in>",
    );
    expect(mailFrom(withMail({ EMAIL_FROM: undefined, APP_ORIGIN: "https://chatform.in" }))).toBe(
      "chatform <noreply@chatform.in>",
    );
  });
});

describe("invitation and reset", () => {
  it("mails an invitation with the inviter, the workspace and the accept link", async () => {
    const { sent, binding } = captureBinding();
    await runMailJob(withMail({ EMAIL: binding }), {
      kind: "invitation",
      to: "new@example.com",
      inviterName: "Ada Lovelace",
      inviterEmail: "ada@example.com",
      organizationName: "Acme",
      role: "editor",
      acceptUrl: "https://app.chatform.in/accept-invitation?id=inv_1",
      expiresAt: Date.now() + 3 * 86_400_000,
    });
    expect(sent).toHaveLength(1);
    const m = sent[0]!;
    expect(m.to).toBe("new@example.com");
    expect(m.subject).toContain("Ada Lovelace");
    expect(m.subject).toContain("Acme");
    expect(m.html).toContain("https://app.chatform.in/accept-invitation?id=inv_1");
    expect(m.html).toContain("an editor");
    expect(m.html).toContain("expires in 3 days");
    // Answering an invitation should reach the person who sent it.
    expect(m.replyTo).toBe("ada@example.com");
    // The plain-text part is not optional — a message without one is scored as spam.
    expect(m.text).toContain("https://app.chatform.in/accept-invitation?id=inv_1");
  });

  /**
   * The header lockup, on a message anybody can trigger.
   *
   * The mark is a remote PNG at an absolute production URL, because a relative
   * one has no meaning in an inbox and `localhost` would be a permanently
   * broken image in somebody's archive. The wordmark stays live text so a
   * client with images blocked — which is most of them, on first open — still
   * shows the name rather than an empty box.
   */
  it("puts the mark and the wordmark in the header", async () => {
    const { sent, binding } = captureBinding();
    await runMailJob(withMail({ EMAIL: binding }), {
      kind: "password_reset",
      to: "ada@example.com",
      name: "Ada",
      resetUrl: "https://app.chatform.in/reset-password?token=abc",
    });
    const html = sent[0]!.html;
    expect(html).toContain("https://chatform.in/brand/email-mark.png");
    expect(html).not.toContain(".svg");
    expect(html).toContain(">chatform</td>");
  });

  it("mails a reset link that points at the web app, not the API", async () => {
    const { sent, binding } = captureBinding();
    await runMailJob(withMail({ EMAIL: binding }), {
      kind: "password_reset",
      to: "ada@example.com",
      name: "Ada",
      resetUrl: "https://app.chatform.in/reset-password?token=abc",
      });
    expect(sent).toHaveLength(1);
    expect(sent[0]!.html).toContain("https://app.chatform.in/reset-password?token=abc");
    expect(sent[0]!.html).toContain("Hi Ada,");
  });
});

describe("submission notifications", () => {
  it("mails every address on the list, with answers in document order", async () => {
    await publish({
      ...DOC,
      settings: {
        onComplete: {
          notificationEmails: ["one@example.com", "two@example.com"],
          // Off, so this test is about the owner's copy alone. The respondent's
          // now goes out by default and has tests of its own below.
          autoReplyEmail: { enabled: false },
        },
      },
    });
    await seedResponse("sbm_mail_notify", { respondentEmail: "ada@example.com" });

    const { sent, binding } = captureBinding();
    const n = await runMailJob(withMail({ EMAIL: binding }), {
      kind: "submission",
      organizationId: t.orgId,
      formId: t.formId,
      responseId: "sbm_mail_notify",
      isTest: false,
    });

    expect(n).toBe(2);
    expect(sent.map((m) => m.to)).toEqual(["one@example.com", "two@example.com"]);
    const html = sent[0]!.html;
    expect(html).toContain("Your name");
    expect(html).toContain("Ada");
    // The option's label, not its id — the single most common way a results
    // surface leaks internals at a customer.
    expect(html).toContain("Coffee");
    expect(html).not.toContain("opt_coffee");
    // Document order, not insertion order.
    expect(html.indexOf("Your name")).toBeLessThan(html.indexOf("Your email"));
    // Replying to the notification should reach the respondent.
    expect(sent[0]!.replyTo).toBe("ada@example.com");
  });

  it("sends nothing when the form has no notification list and no confirmation", async () => {
    await publish({ ...DOC, settings: { onComplete: { autoReplyEmail: { enabled: false } } } });
    await seedResponse("sbm_mail_quiet");
    const { sent, binding } = captureBinding();
    const n = await runMailJob(withMail({ EMAIL: binding }), {
      kind: "submission",
      organizationId: t.orgId,
      formId: t.formId,
      responseId: "sbm_mail_quiet",
      isTest: false,
    });
    expect(n).toBe(0);
    expect(sent).toHaveLength(0);
  });

  /**
   * The default that matters most: a form nobody has configured still thanks
   * the person who filled it in. Every failure mode here is silent — an author
   * who never opens the settings panel will not discover that the receipt they
   * assume exists does not.
   */
  it("confirms to the respondent by default, with their answers", async () => {
    await publish(DOC);
    await seedResponse("sbm_mail_default_confirm");
    const { sent, binding } = captureBinding();
    const n = await runMailJob(withMail({ EMAIL: binding }), {
      kind: "submission",
      organizationId: t.orgId,
      formId: t.formId,
      responseId: "sbm_mail_default_confirm",
      isTest: false,
    });

    expect(n).toBe(1);
    // The address they typed into the email block, with no notification list
    // and nothing switched on by hand.
    expect(sent[0]!.to).toBe("ada@example.com");
    expect(sent[0]!.subject).toBe(DEFAULT_CONFIRMATION_SUBJECT);
    // Their own answers, echoed back by label rather than by option id.
    expect(sent[0]!.html).toContain("What you sent");
    expect(sent[0]!.html).toContain("Your name");
    expect(sent[0]!.html).toContain("Ada");
    expect(sent[0]!.html).toContain("Coffee");
    expect(sent[0]!.html).not.toContain("opt_coffee");
    expect(sent[0]!.text).toContain("Ada");
    // The form's title reaches the default body through `{{form.title}}`, so a
    // respondent never sees the braces.
    expect(sent[0]!.html).toContain("Feedback");
    expect(sent[0]!.html).not.toContain("{{form.title}}");
  });

  it("leaves the answers out when the author switches the summary off", async () => {
    await publish({
      ...DOC,
      settings: { onComplete: { autoReplyEmail: { enabled: true, includeAnswers: false } } },
    });
    await seedResponse("sbm_mail_no_answers");
    const { sent, binding } = captureBinding();
    await runMailJob(withMail({ EMAIL: binding }), {
      kind: "submission",
      organizationId: t.orgId,
      formId: t.formId,
      responseId: "sbm_mail_no_answers",
      isTest: false,
    });

    expect(sent).toHaveLength(1);
    expect(sent[0]!.html).not.toContain("What you sent");
    // The one thing that must not leak: an answer to a question the author has
    // decided should not travel back by email.
    expect(sent[0]!.html).not.toContain("Coffee");
  });

  it("sends no confirmation when the author turns it off", async () => {
    await publish({ ...DOC, settings: { onComplete: { autoReplyEmail: { enabled: false } } } });
    await seedResponse("sbm_mail_confirm_off");
    const { sent, binding } = captureBinding();
    const n = await runMailJob(withMail({ EMAIL: binding }), {
      kind: "submission",
      organizationId: t.orgId,
      formId: t.formId,
      responseId: "sbm_mail_confirm_off",
      isTest: false,
    });
    expect(n).toBe(0);
    expect(sent).toHaveLength(0);
  });

  /**
   * An abandoned or still-running response must not produce a "new response"
   * email. The queue is at-least-once and a row can be deleted or swept between
   * finalize and delivery, so this is a real state to arrive in, not a
   * hypothetical.
   */
  it("sends nothing for a response that is not completed", async () => {
    await publish({ ...DOC, settings: { onComplete: { notificationEmails: ["one@example.com"] } } });
    await seedResponse("sbm_mail_partial", { status: "in_progress" });
    const { sent, binding } = captureBinding();
    const n = await runMailJob(withMail({ EMAIL: binding }), {
      kind: "submission",
      organizationId: t.orgId,
      formId: t.formId,
      responseId: "sbm_mail_partial",
      isTest: false,
    });
    expect(n).toBe(0);
    expect(sent).toHaveLength(0);
  });

  it("says so when the response came from a test key", async () => {
    await publish({ ...DOC, settings: { onComplete: { notificationEmails: ["one@example.com"] } } });
    await seedResponse("sbm_mail_test");
    const { sent, binding } = captureBinding();
    await runMailJob(withMail({ EMAIL: binding }), {
      kind: "submission",
      organizationId: t.orgId,
      formId: t.formId,
      responseId: "sbm_mail_test",
      isTest: true,
    });
    expect(sent[0]!.subject).toContain("[test]");
  });
});

describe("auto-reply", () => {
  /**
   * White-label means white-label.
   *
   * `hidePoweredBy` already removed our name from the footer of an auto-reply.
   * The header was ignoring it and setting "chatform" above the customer's own
   * message — tolerable while it was six grey characters, and not tolerable now
   * that it is a logo. Both halves read the same flag.
   */
  it("removes the header lockup, not just the footer, when branding is hidden", async () => {
    await publish({
      ...DOC,
      settings: {
        branding: { hidePoweredBy: true },
        onComplete: {
          autoReplyEmail: { enabled: true, subject: "Thanks", bodyMd: "Got it." },
        },
      },
    });
    await seedResponse("sbm_mail_whitelabel", { respondentEmail: "ada@example.com" });
    const { sent, binding } = captureBinding();
    await runMailJob(withMail({ EMAIL: binding }), {
      kind: "submission",
      organizationId: t.orgId,
      formId: t.formId,
      responseId: "sbm_mail_whitelabel",
      isTest: false,
    });
    const html = sent[0]!.html;
    expect(html).not.toContain("brand/email-mark.png");
    expect(html).not.toContain("Powered by chatform");
  });

  it("goes to the respondent and interpolates their answers", async () => {
    await publish({
      ...DOC,
      settings: {
        onComplete: {
          autoReplyEmail: {
            enabled: true,
            subject: "Thanks, {{q_name}}",
            bodyMd: "Hi **{{q_name}}**, you picked {{q_pick}} for {{form.title}}.",
          },
        },
      },
    });
    await seedResponse("sbm_mail_reply", { respondentEmail: "ada@example.com" });

    const { sent, binding } = captureBinding();
    await runMailJob(withMail({ EMAIL: binding }), {
      kind: "submission",
      organizationId: t.orgId,
      formId: t.formId,
      responseId: "sbm_mail_reply",
      isTest: false,
    });

    expect(sent).toHaveLength(1);
    expect(sent[0]!.to).toBe("ada@example.com");
    expect(sent[0]!.subject).toBe("Thanks, Ada");
    expect(sent[0]!.html).toContain("<strong>Ada</strong>");
    expect(sent[0]!.html).toContain("Coffee");
    expect(sent[0]!.html).toContain("Feedback");
  });

  /**
   * With no verified identity the address has to come from an `email` answer —
   * unverified, but it is what they typed when we asked.
   */
  it("falls back to the first email answer when no identity was verified", async () => {
    await publish({
      ...DOC,
      settings: {
        onComplete: { autoReplyEmail: { enabled: true, subject: "Thanks", bodyMd: "Got it." } },
      },
    });
    await seedResponse("sbm_mail_fallback", { respondentEmail: null });
    const { sent, binding } = captureBinding();
    await runMailJob(withMail({ EMAIL: binding }), {
      kind: "submission",
      organizationId: t.orgId,
      formId: t.formId,
      responseId: "sbm_mail_fallback",
      isTest: false,
    });
    expect(sent[0]!.to).toBe("ada@example.com");
  });

  /**
   * The body is written by the form's owner, but it is delivered to respondents
   * over our domain and our reputation. An owner who pastes in something they
   * were sent must not be able to turn that into markup.
   */
  it("escapes markup in the body rather than rendering it", async () => {
    await publish({
      ...DOC,
      settings: {
        onComplete: {
          autoReplyEmail: {
            enabled: true,
            subject: "Thanks",
            bodyMd: `Hello <script>alert(1)</script> <a href="https://evil.test">click</a>`,
          },
        },
      },
    });
    await seedResponse("sbm_mail_escape", { respondentEmail: "ada@example.com" });
    const { sent, binding } = captureBinding();
    await runMailJob(withMail({ EMAIL: binding }), {
      kind: "submission",
      organizationId: t.orgId,
      formId: t.formId,
      responseId: "sbm_mail_escape",
      isTest: false,
    });
    expect(sent[0]!.html).not.toContain("<script>");
    expect(sent[0]!.html).toContain("&lt;script&gt;");
    expect(sent[0]!.html).not.toContain("evil.test\">click");
  });

  /**
   * An unknown reference is a typo in the owner's template. A gap is a bad
   * email; `{{q_nmae}}` in a respondent's inbox is a broken one.
   */
  it("resolves an unknown reference to nothing rather than leaking the template", async () => {
    await publish({
      ...DOC,
      settings: {
        onComplete: {
          autoReplyEmail: { enabled: true, subject: "Thanks", bodyMd: "Hi {{q_nmae}}!" },
        },
      },
    });
    await seedResponse("sbm_mail_typo", { respondentEmail: "ada@example.com" });
    const { sent, binding } = captureBinding();
    await runMailJob(withMail({ EMAIL: binding }), {
      kind: "submission",
      organizationId: t.orgId,
      formId: t.formId,
      responseId: "sbm_mail_typo",
      isTest: false,
    });
    expect(sent[0]!.html).not.toContain("q_nmae");
    expect(sent[0]!.html).toContain("Hi !");
  });
});
