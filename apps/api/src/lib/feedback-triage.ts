import type { Bindings } from "../env.js";
import { assignIssue } from "./feedback-issues.js";
import { tagFeedback } from "./feedback-tags.js";
import { enqueueMail } from "./mail.js";

/**
 * What happens to a bug report after the respondent is told it reached us.
 *
 * One message on `q-feedback` per report: classify it, match it to its issue,
 * then hand the founders' mail to the email queue — in that order, so the mail
 * can name both. The queue is strictly serial, which is what makes matching safe
 * (see `feedback-issues.ts`); the mail itself goes back to `q-emails` so it keeps
 * that queue's parallelism and retries.
 *
 * `mail: false` is the rebuild: re-matching every stored report must not mail
 * the founders once per report ever filed.
 */
export interface FeedbackTriageMessage {
  kind: "feedback_triage";
  feedbackId: string;
  mail?: boolean;
}

/**
 * Hand a new report to triage.
 *
 * Never throws. If the queue will not take it, the mail is sent straight to the
 * email queue instead — it tags on its own when it has to — because a report the
 * founders never hear about is the failure this whole feature exists to prevent,
 * and an unmatched one is not.
 */
export async function enqueueFeedbackTriage(env: Bindings, feedbackId: string): Promise<void> {
  try {
    await env.Q_FEEDBACK.send({ kind: "feedback_triage", feedbackId } satisfies FeedbackTriageMessage);
  } catch (err) {
    console.error("feedback_triage_enqueue_failed", { feedbackId, err: String(err) });
    await enqueueMail(env, { kind: "respondent_feedback", feedbackId });
  }
}

/** The consumer's work for one message. Never throws: every step inside degrades on its own. */
export async function runFeedbackTriage(env: Bindings, message: FeedbackTriageMessage): Promise<void> {
  await tagFeedback(env, message.feedbackId);
  await assignIssue(env, message.feedbackId);
  if (message.mail !== false) {
    await enqueueMail(env, { kind: "respondent_feedback", feedbackId: message.feedbackId });
  }
}
