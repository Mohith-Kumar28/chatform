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
 * Send one message.
 *
 * Throws on failure — every caller is a queue consumer, and a thrown error is
 * how a message gets retried and eventually lands in the DLQ. Swallowing here
 * would turn "the invite never arrived" into a silent event.
 */
export async function sendMail(env: Bindings, msg: MailMessage): Promise<MailResult> {
  const from = mailFrom(env);
  const replyTo = msg.replyTo ?? env.EMAIL_REPLY_TO;

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

  if (env.RESEND_API_KEY) {
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
   * No provider configured. Local dev and the test suite land here, and so would
   * a production deployment that forgot to onboard a sending domain — which is
   * why the recipient and subject are logged rather than nothing at all.
   */
  console.log("mail_not_configured", JSON.stringify({ to: msg.to, subject: msg.subject }));
  return { transport: "noop", messageId: null };
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
      kind: "submission";
      organizationId: string;
      formId: string;
      responseId: string;
      /** Skipped entirely for a `*_test_` key's response — see `enqueueMail`. */
      isTest: boolean;
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
