import type { Bindings } from "../env.js";

/**
 * Every outbound email leaves through this file.
 *
 * Transport is deliberately one function with one shape. The provider is a
 * detail nothing else in the codebase knows: `sendMail` prefers the Cloudflare
 * Email Service binding, falls back to Resend over HTTP when `RESEND_API_KEY`
 * is set, and logs instead of sending when neither exists.
 *
 * That fallback is not hedging for its own sake. Email Sending is in public
 * beta and new accounts start on a conservative daily quota that Cloudflare
 * scales with sending reputation and does not publish — so the day a launch
 * pushes past it, the fix has to be a variable and a redeploy, not a
 * refactor. `RESEND_API_KEY` was declared in `Bindings` and used nowhere for
 * most of this project's life; this is what it was reserved for.
 *
 * Nothing here renders. Templates live in `mail-templates.ts` and the jobs
 * that decide who gets what live in `mail-jobs.ts`, so a change to wording
 * cannot break delivery and a change of provider cannot change a message.
 */

/**
 * Which kind of mail this is, and therefore which pipe it may leave through.
 *
 * Not a label — a routing decision. Cloudflare documents Email Service as
 * transactional-only ("Email Service is intended only for transactional
 * emails"), and Postmark draws the same line for the same reason: mixing
 * broadcast and transactional traffic on one reputation means the day a growth
 * feature annoys people is the day password resets stop arriving.
 *
 * So a `marketing` message never touches the `EMAIL` binding, and never
 * silently falls back onto it. It goes out over Resend on the marketing
 * subdomain or it fails loudly. Defaulting to `transactional` keeps every
 * existing caller — invitations, OTPs, resets, submission notifications —
 * exactly where it already was.
 */
export type MailClass = "transactional" | "marketing";

export interface MailMessage {
  to: string;
  subject: string;
  html: string;
  /**
   * Required, not optional. A message with no plain-text part is scored as spam
   * by most filters and is unreadable in a client that refuses HTML, and making
   * it optional means it is omitted exactly when someone is in a hurry.
   */
  text: string;
  replyTo?: string;
  /** Defaults to `transactional`. See `MailClass`. */
  class?: MailClass;
  /**
   * Extra headers, for the one-click unsubscribe a marketing message is
   * required to carry. Only the Resend path can set these; the binding has no
   * parameter for them, which is one more reason marketing mail does not use it.
   */
  headers?: Record<string, string>;
}

/** What actually carried the message, for the log line. */
export type MailTransport = "cloudflare" | "resend" | "noop";

export interface MailResult {
  transport: MailTransport;
  messageId: string | null;
}

/**
 * The From address.
 *
 * `EMAIL_FROM` when set. Otherwise `noreply@` at the apex of `APP_ORIGIN` —
 * the API answers at `api.chatform.in`, and mail from `noreply@api.chatform.in`
 * would need that subdomain onboarded separately, so the leading label is
 * dropped. A two-label host is already an apex and is left alone.
 */
export function mailFrom(env: Bindings): string {
  if (env.EMAIL_FROM?.trim()) return env.EMAIL_FROM.trim();
  let host: string;
  try {
    host = new URL(env.APP_ORIGIN).hostname;
  } catch {
    return "noreply@chatform.in";
  }
  const labels = host.split(".");
  const apex = labels.length > 2 ? labels.slice(-2).join(".") : host;
  return `chatform <noreply@${apex}>`;
}

/**
 * The From address for marketing mail.
 *
 * A different subdomain from transactional on purpose, so the two reputations
 * are separable at the receiving end: a run of complaints about follow-ups
 * should cost us follow-up delivery, not password resets. `EMAIL_FROM_MARKETING`
 * when set; otherwise `hello@mail.<apex>`, which is the shape a recipient
 * expects to be able to reply to.
 */
export function marketingFrom(env: Bindings): string {
  if (env.EMAIL_FROM_MARKETING?.trim()) return env.EMAIL_FROM_MARKETING.trim();
  let host: string;
  try {
    host = new URL(env.APP_ORIGIN).hostname;
  } catch {
    return "chatform <hello@mail.chatform.in>";
  }
  const labels = host.split(".");
  const apex = labels.length > 2 ? labels.slice(-2).join(".") : host;
  return `chatform <hello@mail.${apex}>`;
}

/**
 * Send one message.
 *
 * Throws on failure — every caller is a queue consumer, and a thrown error is
 * how a message gets retried and eventually lands in the DLQ. Swallowing here
 * would turn "the invite never arrived" into a silent event.
 */
export async function sendMail(env: Bindings, msg: MailMessage): Promise<MailResult> {
  const marketing = msg.class === "marketing";
  const from = marketing ? marketingFrom(env) : mailFrom(env);
  const replyTo = msg.replyTo ?? env.EMAIL_REPLY_TO;
  const preference = transportPreference(env);

  /**
   * Marketing mail takes the Resend path or no path at all.
   *
   * Deliberately not a fallback: falling back onto the binding is precisely the
   * failure this split exists to prevent, and it would happen silently, on the
   * day someone forgot to set the key, to every nudge at once. A queue retry
   * and a DLQ entry are the right outcome — they are visible.
   */
  if (marketing) {
    if (!env.RESEND_API_KEY) {
      if (env.ENVIRONMENT !== "production") {
        console.log(
          "mail_marketing_not_configured",
          JSON.stringify({ to: msg.to, subject: msg.subject }),
        );
        return { transport: "noop", messageId: null };
      }
      throw new Error("marketing_transport_unconfigured: RESEND_API_KEY is required for marketing mail");
    }
    return sendViaResend(env, msg, from, replyTo);
  }

  /**
   * `MAIL_TRANSPORT=resend` — everything goes over Resend, including auth mail.
   *
   * Worth having as a variable rather than a code change because the binding is
   * in beta with quotas Cloudflare does not publish and scales by sending
   * reputation. The day that bites, the fix should be one line in `.prod.vars`
   * and a redeploy, not a refactor under pressure. Loud rather than silent when
   * the key is missing, for the same reason the marketing path is: a
   * transactional deployment that quietly sends nothing is worse than one that
   * fails visibly.
   */
  if (preference === "resend") {
    if (!env.RESEND_API_KEY) {
      if (env.ENVIRONMENT === "production") {
        throw new Error("mail_transport_unconfigured: MAIL_TRANSPORT=resend but RESEND_API_KEY is unset");
      }
      console.log("mail_not_configured", JSON.stringify({ to: msg.to, subject: msg.subject }));
      return { transport: "noop", messageId: null };
    }
    return sendViaResend(env, msg, from, replyTo);
  }

  if (env.EMAIL) {
    // The binding's builder overload — not the `EmailMessage` overload, which is
    // Email Routing's raw-MIME path and cannot address an arbitrary recipient.
    const res = await env.EMAIL.send({
      from,
      to: msg.to,
      subject: msg.subject,
      html: msg.html,
      text: msg.text,
      ...(replyTo ? { replyTo } : {}),
    });
    return { transport: "cloudflare", messageId: readMessageId(res) };
  }

  // `auto` (the default) falls through to Resend when the binding is absent —
  // which is what local dev and a Cloudflare-less deployment both look like.
  // `cloudflare` stops here rather than falling through: an explicit choice of
  // transport that silently uses the other one is not a choice.
  if (env.RESEND_API_KEY && preference !== "cloudflare") {
    return sendViaResend(env, msg, from, replyTo);
  }

  /**
   * No provider configured. Local dev and the test suite land here, and so would
   * a production deployment that forgot to onboard a sending domain — which is
   * why the recipient and subject are logged rather than nothing at all.
   */
  console.log("mail_not_configured", JSON.stringify({ to: msg.to, subject: msg.subject }));
  return { transport: "noop", messageId: null };
}

/**
 * Which transport to prefer for transactional mail.
 *
 * `auto` — the default, and what every deployment did before this existed:
 * the Cloudflare binding when it is bound, Resend when it is not.
 * `resend` — everything over Resend, so one provider carries both classes and
 * the reputations are separated by *domain* instead of by vendor.
 * `cloudflare` — the binding only, and no quiet fallback.
 *
 * Marketing mail ignores this entirely and always uses Resend. That is not a
 * preference; Cloudflare documents Email Service as transactional-only.
 */
function transportPreference(env: Bindings): "auto" | "resend" | "cloudflare" {
  const raw = env.MAIL_TRANSPORT?.trim().toLowerCase();
  return raw === "resend" || raw === "cloudflare" ? raw : "auto";
}

async function sendViaResend(
  env: Bindings,
  msg: MailMessage,
  from: string,
  replyTo: string | undefined,
): Promise<MailResult> {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.RESEND_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [msg.to],
      subject: msg.subject,
      html: msg.html,
      text: msg.text,
      ...(replyTo ? { reply_to: replyTo } : {}),
      ...(msg.headers && Object.keys(msg.headers).length > 0 ? { headers: msg.headers } : {}),
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`resend_send_failed ${res.status} ${detail.slice(0, 300)}`);
  }
  const body = (await res.json().catch(() => ({}))) as { id?: string };
  return { transport: "resend", messageId: body.id ?? null };
}

/**
 * The binding's result carries a message id, but the field has been spelled
 * differently across the beta and the type does not name it. Reading it
 * defensively costs three lines and keeps a rename out of the delivery path.
 */
function readMessageId(res: unknown): string | null {
  if (!res || typeof res !== "object") return null;
  const r = res as Record<string, unknown>;
  for (const key of ["messageId", "message_id", "id"]) {
    if (typeof r[key] === "string") return r[key];
  }
  return null;
}

// ───────────────────────────── the queue ─────────────────────────────

/**
 * A job, not a rendered message.
 *
 * Rendering happens in the consumer so that changing a template does not leave
 * stale HTML sitting in a queue, and so a message is never larger than it needs
 * to be. `submission` carries only identifiers for the same reason it carries
 * no answers: the consumer reads the response and the published form document
 * from D1, which is the only place they are guaranteed to agree.
 */
export type MailJob =
  | {
      kind: "invitation";
      to: string;
      inviterName: string | null;
      inviterEmail: string | null;
      organizationName: string;
      role: string;
      acceptUrl: string;
      expiresAt: number | null;
    }
  | {
      kind: "password_reset";
      to: string;
      name: string | null;
      resetUrl: string;
    }
  | {
      kind: "otp";
      to: string;
      /** Six digits, already generated. Never regenerated by the consumer. */
      code: string;
      /**
       * Better Auth's own vocabulary, passed through unchanged so a new flow it
       * adds later cannot silently render as the wrong sentence.
       */
      purpose: "sign-in" | "email-verification" | "forget-password" | "change-email";
    }
  | {
      kind: "submission";
      organizationId: string;
      formId: string;
      responseId: string;
      /** Skipped entirely for a `*_test_` key's response — see `enqueueMail`. */
      isTest: boolean;
    }
  | {
      /**
       * One nudge for a response somebody abandoned.
       *
       * Carries only the row id, for the same reason `submission` carries only
       * identifiers: the consumer reads the response, the published document
       * and the schedule row itself, which is the only place they are
       * guaranteed to agree. It also means a template edited between scheduling
       * and sending takes effect, which is what an author expects.
       */
      kind: "followup";
      followupId: string;
    };

/**
 * Hand a job to the queue.
 *
 * Never throws. Enqueueing runs inside `finalizeResponse` and inside Better
 * Auth's own request handlers, and a queue that is briefly unavailable must not
 * fail a response the respondent already completed or a sign-up that already
 * created the account. A dropped notification is a smaller problem than a 500
 * on the path that produced it.
 */
export async function enqueueMail(env: Bindings, job: MailJob): Promise<void> {
  try {
    await env.Q_EMAIL.send(job);
  } catch (err) {
    console.error("mail_enqueue_failed", job.kind, err);
  }
}

/**
 * The recipient's domain, and nothing else.
 *
 * The delivery record deliberately has no column for an address, so this is the
 * whole of what is kept about who a message went to. It answers the only
 * question the platform console needs to ask — is a particular provider
 * rejecting us — without putting a customer's or a respondent's address on a
 * cross-tenant screen.
 */
function domainOf(job: MailJob): string {
  const to = "to" in job ? job.to : "";
  const at = to.lastIndexOf("@");
  return at === -1 ? "" : to.slice(at + 1).toLowerCase();
}

/**
 * Record what the queue did with a job.
 *
 * Written by the consumer, on both outcomes, because a delivery rate needs the
 * denominator. Everything transactional shares this queue, so this table is the
 * only place that can answer "is mail working" across sign-in codes, password
 * resets, invitations, notifications, auto-replies and nudges at once — until
 * now that was five separate `console.log` lines and no way to count them.
 *
 * Never throws, for the same reason `enqueueMail` does not: a bookkeeping write
 * that fails must not turn a delivered message into a retried one, which is how
 * an observability table starts sending duplicates.
 */
export async function recordMailDelivery(
  env: Bindings,
  job: MailJob,
  outcome: { status: "sent" | "failed"; messages?: number; attempt: number; error?: unknown },
): Promise<void> {
  try {
    await env.DB.prepare(
      `INSERT INTO mail_deliveries (id, kind, status, messages, attempt, domain, error, organization_id, created_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)`,
    )
      .bind(
        crypto.randomUUID(),
        job.kind,
        outcome.status,
        outcome.messages ?? 0,
        outcome.attempt,
        domainOf(job),
        outcome.error === undefined ? null : String(outcome.error).slice(0, 300),
        "organizationId" in job ? job.organizationId : null,
        Date.now(),
      )
      .run();
  } catch (err) {
    console.error("mail_delivery_record_failed", job.kind, err);
  }
}

/**
 * Delivery records are operational, not historical.
 *
 * A row exists to answer "is mail working now" and "what broke last week". At
 * a message per row this table grows faster than anything else the console
 * reads, and nothing looks at a ninety-day-old successful OTP. Failures are
 * kept the same length of time as successes on purpose: a rate needs both
 * halves, and pruning only the successes would make the failure rate climb
 * every time the sweep ran.
 */
export async function pruneMailDeliveries(env: Bindings, olderThanDays = 90): Promise<number> {
  const res = await env.DB.prepare(`DELETE FROM mail_deliveries WHERE created_at < ?`)
    .bind(Date.now() - olderThanDays * 86_400_000)
    .run();
  return res.meta?.changes ?? 0;
}
