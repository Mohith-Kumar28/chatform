import { readFormDoc, displayAnswer, type Block, type FormDoc } from "@repo/form-schema";
import type { Bindings } from "../env.js";
import { sendMail, type MailJob, type MailMessage } from "./mail.js";
import {
  autoReplyEmail,
  escapeHtml,
  invitationEmail,
  otpEmail,
  passwordResetEmail,
  submissionNotificationEmail,
  type AnswerLine,
} from "./mail-templates.js";
import { webOrigins } from "./origins.js";

/**
 * A queued job, turned into the messages it stands for and sent.
 *
 * The split between this and `mail.ts` is deliberate: everything that needs the
 * database, the form document or a URL lives here, and `sendMail` stays a
 * function that takes a rendered message and a recipient. One completed
 * response can produce eleven messages (ten notification addresses plus the
 * auto-reply), which is why this returns a count rather than a boolean.
 *
 * Throwing is how a job is retried. A partial failure — three of ten addresses
 * sent, the fourth rejected — throws after attempting all of them, so a retry
 * re-sends the successful ones too. That is the right trade at this size: a
 * duplicate notification is noise, a missing one is a lost response, and
 * per-recipient delivery tracking is a table this feature does not yet earn.
 */
export async function runMailJob(env: Bindings, job: MailJob): Promise<number> {
  switch (job.kind) {
    case "invitation": {
      const msg = invitationEmail({
        organizationName: job.organizationName,
        inviterName: job.inviterName,
        inviterEmail: job.inviterEmail,
        role: job.role,
        acceptUrl: job.acceptUrl,
        expiresAt: job.expiresAt,
      });
      // Replies go to the person who invited them, not to `noreply@`. Someone
      // who answers an invitation with a question should reach a human.
      await sendMail(env, { to: job.to, ...msg, ...(job.inviterEmail ? { replyTo: job.inviterEmail } : {}) });
      return 1;
    }

    case "password_reset": {
      const msg = passwordResetEmail({ name: job.name, resetUrl: job.resetUrl });
      await sendMail(env, { to: job.to, ...msg });
      return 1;
    }

    case "otp": {
      const msg = otpEmail({ code: job.code, purpose: job.purpose });
      await sendMail(env, { to: job.to, ...msg });
      return 1;
    }

    case "submission":
      return runSubmissionJob(env, job);
  }
}

interface SubmissionRow {
  id: string;
  form_id: string;
  organization_id: string;
  status: string;
  completed_at: number | null;
  respondent_email: string | null;
  respondent_name: string | null;
}

interface AnswerRow {
  block_ref: string;
  value_json: string;
}

/**
 * The notification list and the auto-reply, for one completed response.
 *
 * Both read the *published* document rather than the draft, for the same reason
 * the CSV export does: the settings that were live when the response came in
 * are the ones the respondent was subject to, and a notification list edited
 * five minutes ago should not retroactively decide who was told about a
 * response collected yesterday. `active_version_id` is the closest thing we
 * have to that and is what everything else already uses.
 */
async function runSubmissionJob(
  env: Bindings,
  job: Extract<MailJob, { kind: "submission" }>,
): Promise<number> {
  const sub = await env.DB.prepare(
    `SELECT id, form_id, organization_id, status, completed_at, respondent_email, respondent_name
       FROM submissions WHERE id = ?1 AND organization_id = ?2`,
  )
    .bind(job.responseId, job.organizationId)
    .first<SubmissionRow>();
  // Deleted between finalize and delivery — a real possibility with a retrying
  // queue and a customer exercising their delete button. Nothing to send, and
  // nothing wrong: ack rather than retry forever.
  if (!sub || sub.status !== "completed") return 0;

  const form = await env.DB.prepare(
    `SELECT f.title AS form_title, fv.schema_json
       FROM forms f JOIN form_versions fv ON fv.id = f.active_version_id
      WHERE f.id = ?1 AND f.organization_id = ?2`,
  )
    .bind(job.formId, job.organizationId)
    .first<{ form_title: string; schema_json: string }>();
  if (!form) return 0;

  let doc: FormDoc;
  try {
    doc = readFormDoc(JSON.parse(form.schema_json));
  } catch (err) {
    // A document we cannot parse is not going to parse on the fifth retry.
    console.error("mail_form_doc_unreadable", job.formId, err);
    return 0;
  }

  const onComplete = doc.settings.onComplete;
  const recipients = onComplete.notificationEmails ?? [];
  const autoReply = onComplete.autoReplyEmail;
  if (recipients.length === 0 && !autoReply?.enabled) return 0;

  const answers = await env.DB.prepare(
    `SELECT block_ref, value_json FROM submission_answers WHERE submission_id = ?1`,
  )
    .bind(job.responseId)
    .all<AnswerRow>();

  const byRef = new Map<string, unknown>();
  for (const row of answers.results ?? []) {
    try {
      byRef.set(row.block_ref, JSON.parse(row.value_json));
    } catch {
      /* a value we cannot parse is a value we cannot show; the rest still send */
    }
  }

  // Document order, not insertion order: the owner reads the email against the
  // form they built, and answers sorted by when they happened to be written
  // read as a shuffled version of their own questions.
  const lines: AnswerLine[] = [];
  for (const block of doc.blocks) {
    if (!byRef.has(block.ref)) continue;
    lines.push({ question: block.title, answer: displayAnswer(block as Block, byRef.get(block.ref)) });
  }

  const origin = webOrigins(env)[0]!;
  const responseUrl = `${origin}/forms/${job.formId}/results`;
  const errors: unknown[] = [];
  let sent = 0;

  if (recipients.length > 0) {
    const msg = submissionNotificationEmail({
      formTitle: form.form_title,
      responseUrl,
      answers: lines,
      respondentEmail: sub.respondent_email,
      submittedAt: sub.completed_at ?? Date.now(),
      isTest: job.isTest,
    });
    for (const to of recipients) {
      try {
        // Reply-To is the respondent where we know it, so answering the
        // notification answers the person — the single most useful thing this
        // email can do beyond existing.
        await sendMail(env, { to, ...msg, ...(sub.respondent_email ? { replyTo: sub.respondent_email } : {}) });
        sent++;
      } catch (err) {
        console.error("mail_notification_failed", job.responseId, to, err);
        errors.push(err);
      }
    }
  }

  if (autoReply?.enabled) {
    const to = respondentAddress(sub, doc, byRef);
    if (to) {
      const vars = interpolationVars(doc, byRef, form.form_title, sub);
      const bodyMd = interpolate(autoReply.bodyMd ?? "", vars);
      const msg = autoReplyEmail({
        subject: interpolate(autoReply.subject || "Thanks for your response", vars),
        bodyHtml: markdownToHtml(bodyMd),
        bodyText: bodyMd,
        formTitle: form.form_title,
        showPoweredBy: !doc.settings.branding?.hidePoweredBy,
      });
      try {
        // Replies reach the form's owner, where they gave us an address to use.
        const ownerReply = recipients[0];
        await sendMail(env, { to, ...msg, ...(ownerReply ? { replyTo: ownerReply } : {}) });
        sent++;
      } catch (err) {
        console.error("mail_autoreply_failed", job.responseId, err);
        errors.push(err);
      }
    }
  }

  if (errors.length > 0) throw errors[0];
  return sent;
}

/**
 * Where an auto-reply goes.
 *
 * The verified respondent identity first — a Google or email sign-in on the
 * form is an address somebody proved they control. Failing that, the first
 * answer to an `email` block, which is unverified but is the address they
 * typed when asked for one. No address means no auto-reply, silently: a form
 * that never asks for an email and has auto-reply switched on is a
 * misconfiguration to surface in the builder, not a queue failure.
 */
function respondentAddress(
  sub: SubmissionRow,
  doc: FormDoc,
  byRef: Map<string, unknown>,
): string | null {
  if (sub.respondent_email) return sub.respondent_email;
  for (const block of doc.blocks) {
    if (block.type !== "email") continue;
    const v = byRef.get(block.ref);
    if (typeof v === "string" && v.includes("@")) return v;
  }
  return null;
}

/**
 * What `{{...}}` may refer to in an auto-reply.
 *
 * Every block by its ref, plus `form.title` and `respondent.name`. Refs are
 * what the builder already shows next to each question and what the logic
 * editor already uses, so this adds a syntax rather than a second vocabulary.
 */
function interpolationVars(
  doc: FormDoc,
  byRef: Map<string, unknown>,
  formTitle: string,
  sub: SubmissionRow,
): Map<string, string> {
  const vars = new Map<string, string>();
  vars.set("form.title", formTitle);
  vars.set("respondent.name", sub.respondent_name ?? "");
  vars.set("respondent.email", sub.respondent_email ?? "");
  for (const block of doc.blocks) {
    if (!byRef.has(block.ref)) continue;
    vars.set(block.ref, displayAnswer(block as Block, byRef.get(block.ref)));
  }
  return vars;
}

/**
 * Replace `{{ref}}` with the answer.
 *
 * An unknown reference resolves to an empty string rather than being left as
 * literal braces: a respondent should never receive `{{q_name}}`, and a form
 * owner who mistypes a ref is better served by a gap than by leaking the
 * template. Whitespace inside the braces is tolerated because people type it.
 */
function interpolate(input: string, vars: Map<string, string>): string {
  return input.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_m, key: string) => vars.get(key) ?? "");
}

/**
 * The small subset of Markdown an auto-reply body may use.
 *
 * Escaping happens *first*, so nothing in the stored body can introduce a tag.
 * The body is written by the form's owner rather than a respondent, but it
 * reaches respondents' inboxes, and an owner who pastes something they were
 * sent should not be able to turn our domain into a delivery vehicle for it.
 *
 * A full Markdown dependency would be a larger bundle in a Worker and a larger
 * surface for exactly that problem, for headings nobody puts in an auto-reply.
 */
function markdownToHtml(md: string): string {
  const INK = "#3b3530";
  const blocks = escapeHtml(md.trim()).split(/\n{2,}/);
  return blocks
    .map((block) => {
      const lines = block.split("\n");
      const isList = lines.every((l) => /^\s*[-*]\s+/.test(l));
      if (isList) {
        const items = lines
          .map((l) => `<li style="margin:0 0 6px 0;">${inline(l.replace(/^\s*[-*]\s+/, ""))}</li>`)
          .join("");
        return `<ul style="margin:0 0 14px 0;padding-left:20px;font-size:15px;line-height:1.6;color:${INK};">${items}</ul>`;
      }
      return `<p style="margin:0 0 14px 0;font-size:15px;line-height:1.6;color:${INK};">${inline(lines.join("<br>"))}</p>`;
    })
    .join("\n");

  function inline(s: string): string {
    return (
      s
        // Links before emphasis: a URL containing an underscore would otherwise
        // be chewed up by the italic rule halfway through the href.
        .replace(
          /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
          `<a href="$2" style="color:${INK};">$1</a>`,
        )
        .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
        .replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>")
    );
  }
}

/** Re-exported so the queue consumer imports one module, not three. */
export type { MailJob, MailMessage };
