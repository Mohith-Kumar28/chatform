import {
  readFormDoc,
  displayAnswer,
  progressOf,
  DEFAULT_CONFIRMATION_BODY,
  DEFAULT_CONFIRMATION_SUBJECT,
  type AnswerMap,
  type Block,
  type FormDoc,
} from "@repo/form-schema";
import type { Bindings } from "../env.js";
import { sendMail, type MailJob, type MailMessage } from "./mail.js";
import {
  autoReplyEmail,
  escapeHtml,
  followUpEmail,
  invitationEmail,
  otpEmail,
  passwordResetEmail,
  submissionNotificationEmail,
  type AnswerLine,
} from "./mail-templates.js";
import { webOrigins } from "./origins.js";
import { resolveRespondentAddress } from "./respondent-address.js";
import { mintEmailToken } from "./signed-url.js";
import { RESUME_TTL_DAYS, UNSUB_TTL_DAYS } from "./followups.js";
import { meter } from "./entitlements.js";

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
      const msg = otpEmail({ code: job.code, purpose: job.purpose, formTitle: job.formTitle });
      await sendMail(env, { to: job.to, ...msg });
      return 1;
    }

    case "submission":
      return runSubmissionJob(env, job);

    case "followup":
      return runFollowUpJob(env, job);
  }
}

interface FollowUpRow {
  id: string;
  submission_id: string;
  form_id: string;
  organization_id: string;
  address: string;
  step: number;
  status: string;
  respondent_email: string | null;
  respondent_name: string | null;
  hidden_fields: string | null;
  sub_status: string;
  form_title: string;
  schema_json: string;
}

/**
 * One nudge, rendered and sent.
 *
 * Reads the *published* document for the same reason the auto-reply does: the
 * settings live when the response came in are the ones that applied to that
 * respondent. The step's copy is read now rather than snapshotted at scheduling
 * time, so an author who fixes a typo in the sequence fixes it for mail that
 * has not gone out yet — which is what they expect.
 */
/**
 * Settle a follow-up row that will not be sent after all.
 *
 * Each of the gates below used to `return 0`, which acked the queue message and
 * left the row reading `queued` forever — indistinguishable, to the results
 * table, from one still waiting its turn. Never throws: the decision not to
 * send has already been taken correctly, and failing here would retry a message
 * we have just decided nobody should receive.
 */
async function settleFollowUp(
  env: Bindings,
  followupId: string,
  status: "skipped" | "sent" | "failed",
  reason: string | null,
): Promise<void> {
  try {
    await env.DB.prepare(
      `UPDATE followups SET status = ?2, reason = ?3, sent_at = CASE WHEN ?2 = 'sent' THEN ?4 ELSE sent_at END
        WHERE id = ?1`,
    )
      .bind(followupId, status, reason, Date.now())
      .run();
  } catch (err) {
    console.error("followup_settle_failed", followupId, status, err);
  }
}

async function runFollowUpJob(
  env: Bindings,
  job: Extract<MailJob, { kind: "followup" }>,
): Promise<number> {
  const row = await env.DB.prepare(
    `SELECT fu.id, fu.submission_id, fu.form_id, fu.organization_id, fu.address, fu.step, fu.status,
            s.respondent_email, s.respondent_name, s.hidden_fields, s.status AS sub_status,
            f.title AS form_title, fv.schema_json
       FROM followups fu
       JOIN submissions s ON s.id = fu.submission_id
       JOIN forms f ON f.id = fu.form_id
       JOIN form_versions fv ON fv.id = f.active_version_id
      WHERE fu.id = ?`,
  )
    .bind(job.followupId)
    .first<FollowUpRow>();
  // Deleted between the sweep and delivery — a real possibility with a retrying
  // queue and a customer exercising their delete button. Ack rather than retry.
  if (!row) return 0;

  /**
   * The last gate, and the one that matters most.
   *
   * The sweep checked all of this before enqueueing, but a queue retry can run
   * minutes later and the respondent may have finished in between. Mailing
   * somebody "you didn't finish" after they finished is the single most
   * embarrassing thing this feature can do, so it is checked twice.
   */
  if (row.sub_status !== "abandoned" && row.sub_status !== "in_progress") {
    await settleFollowUp(env, row.id, "skipped", "response_settled");
    return 0;
  }

  let doc: FormDoc;
  try {
    doc = readFormDoc(JSON.parse(row.schema_json));
  } catch (err) {
    console.error("followup_doc_unreadable", row.form_id, err);
    await settleFollowUp(env, row.id, "skipped", "unreadable");
    return 0;
  }

  const cfg = doc.settings.followUp;
  const step = cfg?.steps[row.step - 1];
  // The author shortened the sequence after this was scheduled. Their most
  // recent intent wins.
  if (!cfg?.enabled || !step) {
    await settleFollowUp(env, row.id, "skipped", cfg?.enabled ? "step_removed" : "disabled");
    return 0;
  }

  const answers = await env.DB.prepare(
    `SELECT block_ref, value_json FROM submission_answers WHERE submission_id = ?`,
  )
    .bind(row.submission_id)
    .all<AnswerRow>();
  const byRef = new Map<string, unknown>();
  for (const a of answers.results ?? []) {
    try {
      byRef.set(a.block_ref, JSON.parse(a.value_json));
    } catch {
      // one unparseable answer must not stop the message
    }
  }

  const hidden = parseHiddenFields(row.hidden_fields);
  /**
   * `progressOf` replays the stored answers through the same flow resolver the
   * conversation uses, so "4 of 7" counts the questions this respondent will
   * actually be asked — branches they skipped are not in the denominator.
   */
  const progress = cfg.showProgress
    ? progressOf(doc, Object.fromEntries(byRef) as AnswerMap, hidden ?? {})
    : null;
  const resolved = resolveRespondentAddress(doc, {
    respondentEmail: row.respondent_email,
    byRef,
    hiddenFields: hidden,
    ...(cfg.addressField ? { addressField: cfg.addressField } : {}),
  });

  const origin = webOrigins(env)[0]!;
  const [resumeToken, unsubToken] = await Promise.all([
    mintEmailToken(env, "resume", row.submission_id, RESUME_TTL_DAYS),
    mintEmailToken(env, "unsub", `${row.organization_id}:${row.address}`, UNSUB_TTL_DAYS),
  ]);

  const vars = interpolationVars(doc, byRef, row.form_title, {
    respondent_name: row.respondent_name,
    respondent_email: row.respondent_email,
  });
  // `{{remaining}}` is the one variable this template adds beyond the shared
  // set, because "you're N questions from finishing" is the subject line the
  // evidence actually supports.
  if (progress) {
    vars.set("remaining", String(Math.max(progress.totalEstimate - progress.answered, 0)));
  }
  const bodyMd = interpolate(step.bodyMd ?? "", vars);

  const org = await env.DB.prepare(`SELECT postal_address FROM organizations WHERE id = ?`)
    .bind(row.organization_id)
    .first<{ postal_address: string | null }>()
    .catch(() => null);

  const msg = followUpEmail({
    subject: interpolate(step.subject, vars),
    bodyHtml: bodyMd ? markdownToHtml(bodyMd) : "",
    bodyText: bodyMd,
    formTitle: row.form_title,
    /**
     * `fu` is which message this link came out of, so the recovery report can
     * say *which* reminder worked rather than only that some of them did.
     *
     * It rides in the URL rather than in the token because the token is a
     * signed statement about a response, minted once per send and deliberately
     * about nothing else; widening its payload to carry a per-message id would
     * put analytics inside the thing that decides who may resume a stranger's
     * half-finished form. The id on its own grants nothing — `recordFollowUpClick`
     * only accepts it alongside the resume token for the same response.
     */
    resumeUrl: `${origin}/f/${encodeURIComponent(await slugOf(env, row.form_id))}?resume=${resumeToken}&fu=${row.id}`,
    unsubscribeUrl: `${origin}/p/unsubscribe/${unsubToken}`,
    ...(progress ? { progress: { answered: progress.answered, total: progress.totalEstimate } } : {}),
    /*
      Passed whether or not the author shows a progress line, because what the
      message may truthfully claim cannot depend on a display setting — with
      `showProgress` off and nothing answered, the copy used to promise them
      answers that were waiting.
    */
    answered: byRef.size,
    ...(resolved?.firstName ? { firstName: resolved.firstName } : {}),
    ...(org?.postal_address ? { postalAddress: org.postal_address } : {}),
    showPoweredBy: !doc.settings.branding?.hidePoweredBy,
  });

  await sendMail(env, {
    to: row.address,
    ...msg,
    // Never the transactional binding. See `MailClass`.
    class: "marketing",
    ...(cfg.replyTo ? { replyTo: cfg.replyTo } : {}),
    /**
     * RFC 8058 one-click. Gmail and Yahoo surface this as an unsubscribe
     * control beside the sender's name, which is the difference between
     * somebody opting out and somebody reporting us.
     */
    headers: {
      "List-Unsubscribe": `<${origin}/p/unsubscribe/${unsubToken}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
  });

  // The send returned. Only now is this row honestly `sent`.
  await settleFollowUp(env, row.id, "sent", null);

  await meterEmail(env, row.organization_id);
  /**
   * Counted separately from `emails_sent` because it is a deliverability
   * control rather than a pricing one — it is what keeps the sum of everybody's
   * nudges under the bulk-sender threshold that Google applies to our whole
   * domain. Metered unconditionally so the usage page can show it; only
   * *enforced* while the customer is still sending from our domain.
   */
  try {
    await meter(env, row.organization_id, "followups_shared_domain");
  } catch (err) {
    console.error("followup_meter_failed", row.organization_id, err);
  }

  // After the send, so an integrator's "we nudged them" record cannot exist for
  // a message that never left.
  await env.Q_WEBHOOKS.send({
    event: "followup.sent",
    organizationId: row.organization_id,
    formId: row.form_id,
    submissionId: row.submission_id,
    step: row.step,
    isTest: false,
  }).catch((err: unknown) => console.error("followup_webhook_failed", row.id, err));

  return 1;
}

/**
 * Count one sent message against the org's allowance.
 *
 * `emails_per_month` and the `emails_sent` metric have been declared in the
 * entitlements catalogue since the beginning and nothing ever called `meter()`
 * for them, so the limit shown on the billing page was decorative. Follow-ups
 * are the first feature where an unmetered send path is actually dangerous —
 * it is the one that sends on a schedule, to people who did not ask — so this
 * is where it gets wired.
 *
 * Deliberately not applied to invitations, OTPs or password resets. Nobody
 * should be locked out of their account because a form was popular.
 */
async function meterEmail(env: Bindings, orgId: string, n = 1): Promise<void> {
  try {
    await meter(env, orgId, "emails_sent", n);
  } catch (err) {
    // The message is already gone. Failing the job here would re-send it.
    console.error("email_meter_failed", orgId, err);
  }
}

/** The form's public slug, for the resume link. */
async function slugOf(env: Bindings, formId: string): Promise<string> {
  const row = await env.DB.prepare(`SELECT slug FROM forms WHERE id = ?`)
    .bind(formId)
    .first<{ slug: string }>();
  return row?.slug ?? "";
}

function parseHiddenFields(raw: string | null): Record<string, string> | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw);
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, string>) : null;
  } catch {
    return null;
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
    /**
     * Shared with follow-ups — see `respondent-address.ts`. No address means no
     * auto-reply, silently: a form that never asks for an email and has
     * auto-reply switched on is a misconfiguration to surface in the builder,
     * not a queue failure.
     */
    const to = resolveRespondentAddress(doc, { respondentEmail: sub.respondent_email, byRef })?.address;
    if (to) {
      const vars = interpolationVars(doc, byRef, form.form_title, sub);
      const bodyMd = interpolate(autoReply.bodyMd || DEFAULT_CONFIRMATION_BODY, vars);
      const msg = autoReplyEmail({
        subject: interpolate(autoReply.subject || DEFAULT_CONFIRMATION_SUBJECT, vars),
        bodyHtml: markdownToHtml(bodyMd),
        bodyText: bodyMd,
        formTitle: form.form_title,
        /**
         * The same lines the owner's notification carries, from the same list.
         * `includeAnswers` is the author's switch for the forms whose answers a
         * respondent would not want sitting in an inbox.
         */
        ...(autoReply.includeAnswers ? { answers: lines } : {}),
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
  if (sent > 0) await meterEmail(env, job.organizationId, sent);
  return sent;
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
  /** Only the two fields it reads, so a follow-up row fits as well as a submission. */
  sub: { respondent_name: string | null; respondent_email: string | null },
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
