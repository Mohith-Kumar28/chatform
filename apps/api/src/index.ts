import type { Bindings } from "./env.js";
import { createApp } from "./app.js";
import { handleRequest } from "./mcp/oauth.js";
import { SessionDO } from "./do/session-do.js";
import {
  deliverOne,
  fanOutEvent,
  isDeliveryMessage,
  markDeadFromDlq,
  pruneWebhookDeliveries,
  sweepWebhookDeliveries,
  type WebhookMessage,
} from "./lib/webhooks.js";
import { expireImportTrials } from "./routes/import.js";
import { pruneTemplateDemos } from "./lib/template-demo-quota.js";
import { pruneOtpChallenges } from "./lib/respondent-auth.js";
import { pruneGateLog } from "./lib/gate-log.js";
import { pruneFormActivity } from "./lib/form-activity.js";
import { runExport, pruneExpiredExports, type ExportMessage } from "./lib/exports.js";
import { runMailJob } from "./lib/mail-jobs.js";
import { ingestSource } from "./lib/knowledge-service.js";
import {
  runFeedbackTriage,
  type BuilderFeedbackTriageMessage,
  type FeedbackTriageMessage,
} from "./lib/feedback-triage.js";
import { runBuilderFeedbackTriage } from "./lib/builder-feedback.js";
import { sweepDeletedFormFeedback } from "./lib/feedback-issues.js";
import { purgeDueForms, sweepPurgeNotices } from "./lib/form-archive.js";
import { purgeDeletedAccounts, sweepAccountDeletionNotices } from "./lib/account-deletion.js";
import { drainStoragePurges, pruneOrphanRespondents, prunePendingUploads, sweepUnusedAssets } from "./lib/storage-purges.js";
import { pruneMailDeliveries, recordMailDelivery, type MailJob } from "./lib/mail.js";
import {
  sweepExpiredResponses,
  sweepExpiredSessions,
  sweepPartialNotifications,
  sweepFollowUps,
  pruneTestData,
  pruneIdempotencyKeys,
  sweepDeletedFormKnowledge,
  sweepStuckKnowledgeIngest,
  sweepPaymentTokens,
} from "./lib/sweeps.js";
import { sweepPlanNotices } from "./lib/plan-notices.js";
import { rollupPlatformDaily, rollupFormStructure, backfillPlatformDaily, rollupTrafficDaily, utcDay } from "./lib/platform-rollup.js";

export { SessionDO };

const app = createApp();

/** `max_retries` for the `q-emails` consumer in `wrangler.jsonc`. */
const MAX_EMAIL_ATTEMPTS = 5;

export default {
  fetch(request: Request, env: Bindings, ctx: ExecutionContext) {
    // MCP OAuth (discovery, token, registration, and the token check on `/mcp`) wraps the app.
    return handleRequest(app.fetch, request, env, ctx);
  },
  async queue(batch: MessageBatch, env: Bindings, _ctx: ExecutionContext): Promise<void> {
    /**
     * Webhooks, side by side rather than in turn: each message is one endpoint
     * (or one event's fan-out), and a slow endpoint must not hold up the rest
     * of the batch. An HTTP failure is not a throw; `deliverOne` schedules its
     * own retry. A throw here is our fault (D1, a bug), and the queue's own
     * retries and then `q-webhooks-dlq` handle it.
     */
    if (batch.queue === "q-webhooks") {
      await Promise.all(
        batch.messages.map(async (msg) => {
          const body = msg.body as WebhookMessage;
          try {
            if (isDeliveryMessage(body)) await deliverOne(env, body.deliveryId);
            else if (body.event) await fanOutEvent(env, body, msg.id);
            msg.ack();
          } catch (err) {
            console.error("webhook_message_failed", { error: err instanceof Error ? err.message : String(err) });
            msg.retry();
          }
        }),
      );
      return;
    }
    if (batch.queue === "q-webhooks-dlq") {
      for (const msg of batch.messages) {
        await markDeadFromDlq(env, msg.body).catch((err: unknown) =>
          console.error("webhook_dlq_mark_failed", { error: err instanceof Error ? err.message : String(err) }),
        );
        msg.ack();
      }
      return;
    }
    for (const msg of batch.messages) {
      if (batch.queue === "q-exports") {
        /**
         * The producer half lives in `lib/exports.ts`. This consumer has been
         * declared since the beginning and acked everything it was handed —
         * which was nothing, because nothing ever sent.
         *
         * `runExport` claims its row with `WHERE status = 'queued'`, so an
         * at-least-once redelivery is a no-op rather than a second run.
         */
        const { exportId } = msg.body as ExportMessage;
        try {
          await runExport(env, exportId);
          msg.ack();
        } catch (err) {
          console.error("export_failed", exportId, err);
          // The row is already marked failed with a reader-facing message;
          // retrying is for a transient D1 or R2 error.
          msg.retry();
        }
      } else if (batch.queue === "q-feedback") {
        /*
          Bug-report triage, strictly one at a time — `max_concurrency: 1` in
          wrangler.jsonc, and messages within a batch in order, here. Every step
          degrades on its own and never throws, so a message is acked once it has
          run: retrying a report whose model call failed would pay for the same
          failure again, and an unmatched report is still mailed.
        */
        const body = msg.body as Partial<FeedbackTriageMessage | BuilderFeedbackTriageMessage>;
        if (body.kind === "feedback_triage" && body.feedbackId) {
          await runFeedbackTriage(env, body as FeedbackTriageMessage).catch((err: unknown) =>
            console.error("feedback_triage_failed", { feedbackId: body.feedbackId, err: String(err) }),
          );
        } else if (body.kind === "builder_feedback_triage" && body.feedbackId) {
          await runBuilderFeedbackTriage(env, body as BuilderFeedbackTriageMessage).catch((err: unknown) =>
            console.error("builder_feedback_triage_failed", { feedbackId: body.feedbackId, err: String(err) }),
          );
        }
        msg.ack();
      } else if (batch.queue === "q-knowledge") {
        /**
         * One source per message, and `ingestSource` swallows the failures that
         * are about the document rather than about us — a corrupt PDF becomes a
         * `failed` row with a reason, not three retries of the same corrupt
         * PDF. What reaches the catch here is infrastructure, which is exactly
         * what a retry is for.
         */
        const { sourceId } = msg.body as { sourceId?: string };
        if (!sourceId) {
          msg.ack();
        } else {
          try {
            await ingestSource(env, sourceId);
            msg.ack();
          } catch (err) {
            console.error("knowledge_ingest_message_failed", sourceId, err);
            msg.retry();
          }
        }
      } else if (batch.queue === "q-emails") {
        /**
         * One job can be several messages — see `runMailJob`. A retry re-sends
         * the whole job, so the five-retry ceiling is also the ceiling on how
         * many duplicates a persistently failing recipient can cause.
         */
        const job = msg.body as MailJob;
        try {
          const result = await runMailJob(env, job);
          /**
           * Recorded on every outcome, because a delivery rate needs its
           * denominator. `msg.attempts` is the queue's own counter, so a
           * failure at the ceiling is distinguishable from one that went on to
           * succeed — the first is a message in the dead-letter queue, the
           * second is a blip.
           *
           * `skipped` rather than `sent` when the job ran and mailed nobody —
           * a form with no notification addresses, a follow-up whose step the
           * author deleted. Both used to be written down as deliveries, which
           * is how "the notification email never arrives" could look, from
           * here, exactly like a form that had never been configured at all.
           */
          await recordMailDelivery(env, job, {
            status: result.messages > 0 ? "sent" : "skipped",
            attempt: msg.attempts,
            result,
          });
          msg.ack();
        } catch (err) {
          console.error("mail_job_failed", job.kind, err);
          await recordMailDelivery(env, job, { status: "failed", attempt: msg.attempts, error: err });
          /**
           * A follow-up that has run out of retries is about to disappear into
           * the dead-letter queue, where the author who configured it will
           * never look. Record the ending on the row itself, which is what the
           * results table reads — otherwise a reminder that failed every attempt
           * still reads as `queued`, which is exactly the lie this pass exists
           * to remove.
           *
           * `MAX_EMAIL_ATTEMPTS` must track `max_retries` for `q-emails` in
           * `wrangler.jsonc`; being wrong costs a mislabelled row, not a lost
           * message.
           */
          if (job.kind === "followup" && msg.attempts >= MAX_EMAIL_ATTEMPTS) {
            await env.DB.prepare(
              `UPDATE followups SET status = 'failed', reason = ?2 WHERE id = ?1 AND status = 'queued'`,
            )
              .bind(job.followupId, String(err).slice(0, 200))
              .run()
              .catch((e: unknown) => console.error("followup_fail_mark_failed", job.followupId, e));
          }
          msg.retry();
        }
      } else {
        msg.ack();
      }
    }
  },
  async scheduled(controller: ScheduledController, env: Bindings, _ctx: ExecutionContext): Promise<void> {
    if (controller.cron === "*/5 * * * *") {
      const n = await sweepWebhookDeliveries(env).catch((err: unknown) => {
        console.error("webhook_sweep_failed", { error: err instanceof Error ? err.message : String(err) });
        return 0;
      });
      if (n > 0) console.log(`webhook_deliveries_requeued: ${n}`);
      // Spent and expired OTP rows have no reason to be kept; they are only
      // ever read by the challenge that created them.
      await pruneOtpChallenges(env).catch((err) => console.error("otp_prune_failed", err));
      /**
       * The knowledge base's housekeeping.
       *
       * `sweepStuckKnowledgeIngest` is the safety net under the ingest queue —
       * a send that failed, a worker that died mid-extract, and the seeded
       * knowledge that templates and the demo form deliberately defer, since
       * seed SQL cannot embed anything. `sweepDeletedFormKnowledge` is what
       * makes a deleted form's knowledge go away with it, a week later.
       */
      const requeued = await sweepStuckKnowledgeIngest(env).catch((err) => {
        console.error("knowledge_ingest_sweep_failed", err);
        return 0;
      });
      if (requeued > 0) console.log(`knowledge_ingest_requeued: ${requeued}`);
      await sweepDeletedFormKnowledge(env).catch((err) => console.error("knowledge_delete_sweep_failed", err));
      // A deleted form's bug reports, their vectors and any issue they leave empty — the same week later.
      await sweepDeletedFormFeedback(env).catch((err) => console.error("feedback_delete_sweep_failed", err));
      /**
       * The Archive. A deleted form is kept for thirty days, with warnings three days and
       * one day out (sent in one morning hour, so a batch is one email), then purged here,
       * after the two sweeps above have cleared what it kept outside D1.
       */
      await sweepPurgeNotices(env).catch((err) => console.error("purge_notice_sweep_failed", { error: err instanceof Error ? err.message : String(err) }));
      await purgeDueForms(env).catch((err) => console.error("form_purge_sweep_failed", { error: err instanceof Error ? err.message : String(err) }));
      // Deleted accounts: the three-day and one-day warnings, then the erase itself.
      await sweepAccountDeletionNotices(env).catch((err) => console.error("account_notice_sweep_failed", { error: err instanceof Error ? err.message : String(err) }));
      await purgeDeletedAccounts(env).catch((err) => console.error("account_purge_sweep_failed", { error: err instanceof Error ? err.message : String(err) }));
      /**
       * What deleted rows left outside D1: R2 objects, knowledge vectors and
       * conversation objects, queued by the database's own delete triggers. After
       * every purge above, so what they just deleted goes on the same tick.
       */
      await drainStoragePurges(env).catch((err) => console.error("storage_purge_sweep_failed", { error: err instanceof Error ? err.message : String(err) }));

      /**
       * The API path's housekeeping.
       *
       * A conversation is abandoned by its session object's idle alarm; a
       * programmatic response has no object watching it, so its deadline is a
       * column and this is what enforces it. The partial sweep is also where
       * `response.partial` comes from — the cron interval is the throttle.
       */
      await sweepExpiredResponses(env).catch((err) => console.error("response_sweep_failed", err));
      await sweepExpiredSessions(env).catch((err) => console.error("session_sweep_failed", err));
      await sweepPartialNotifications(env).catch((err) => console.error("partial_sweep_failed", err));
      /**
       * Nudges for responses somebody walked away from. The five-minute cron is
       * the resolution of the whole feature: a delay configured in hours does
       * not need better than that, and a row that comes due between ticks is
       * simply picked up on the next one.
       */
      await sweepFollowUps(env).catch((err) => console.error("followup_sweep_failed", err));
    }
    /**
     * Hourly: housekeeping nobody waits on, and the console's numbers.
     *
     * Split from the five-minute tick because each of these reads its table
     * whatever there is to do, and 288 runs a day of that was most of the
     * database's reads (D1 insights, 2026-10-03).
     */
    if (controller.cron === "10 * * * *") {
      await pruneWebhookDeliveries(env).catch((err) => console.error("webhook_prune_failed", err));
      // Imported trial forms nobody claimed within a day, and spent daily import counters.
      await expireImportTrials(env).catch((err) => console.error("import_trial_sweep_failed", { error: err instanceof Error ? err.message : String(err) }));
      await prunePendingUploads(env).catch((err) => console.error("pending_upload_prune_failed", err));
      await sweepUnusedAssets(env).catch((err) => console.error("unused_asset_sweep_failed", { error: err instanceof Error ? err.message : String(err) }));
      await pruneOrphanRespondents(env).catch((err) => console.error("respondent_prune_failed", { error: err instanceof Error ? err.message : String(err) }));
      // Plan emails: a failed payment, a plan ending within the week, and the switch to
      // Free. Gifts and cancellations lapse the same way, so they are one sweep.
      await sweepPlanNotices(env).catch((err) => console.error("plan_notice_sweep_failed", { error: err instanceof Error ? err.message : String(err) }));
      await pruneIdempotencyKeys(env).catch((err) => console.error("idempotency_prune_failed", err));
      /**
       * Gateway OAuth tokens on accounts nobody has charged on lately. A Cashfree access token
       * lasts a day, so without this a quiet form's first payment of the week always pays for a
       * refresh — and a refresh token left unused for ninety days is gone for good.
       */
      await sweepPaymentTokens(env).catch((err) => console.error("payment_token_sweep_failed", err));
      // An export is a full copy of respondent data sitting in a bucket. It is
      // kept for a day, not forever.
      await pruneExpiredExports(env).catch((err) => console.error("export_prune_failed", err));

      /**
       * The platform's own numbers, for the super-admin console.
       *
       * Today's counters, recounted hourly. Every five minutes was 288 recounts a
       * day of a console read a handful of times, and each one also emptied the
       * overview cache.
       */
      await rollupPlatformDaily(env).catch((err) => console.error("platform_rollup_failed", err));
      /**
       * The form-structure walk, which pages itself across ticks and marks the
       * day done when it finishes.
       *
       * Not pinned to a quiet hour, though the work is heavier. Pinning it means
       * the Product page shows nothing at all for up to a day after a deploy —
       * and the "done" sentinel already makes this a no-op for the rest of the
       * day once the pass completes, so a fixed hour buys nothing that the
       * cursor does not already give.
       */
      await rollupFormStructure(env).catch((err) => console.error("form_structure_rollup_failed", err));
    }
    /**
     * Daily, at 00:20 UTC: retention, history, and the previous day's traffic.
     */
    if (controller.cron === "20 0 * * *") {
      // Unconverted gate denials are only interesting while they are recent; a converted
      // row is kept forever because it is the attribution for a sale.
      await pruneGateLog(env).catch((err) => console.error("gate_log_prune_failed", err));
      // Spent template-try counters and the session rows the tries left behind.
      await pruneTemplateDemos(env).catch((err) => console.error("template_demo_sweep_failed", { error: err instanceof Error ? err.message : String(err) }));
      // A row per message sent. Kept long enough to explain last week's outage,
      // not long enough to become the largest table in the database.
      await pruneMailDeliveries(env).catch((err) => console.error("mail_prune_failed", err));
      await pruneTestData(env).catch((err) => console.error("test_data_prune_failed", err));
      /**
       * A form's history, bounded. Entries that shipped in a version are kept for two
       * years because they are that version's changelog; entries still marked
       * unpublished describe a draft that was long since published or abandoned, and
       * are kept for four months.
       */
      await pruneFormActivity(env).catch((err) => console.error("form_activity_prune_failed", err));
      // Yesterday's final count: the last hourly run of the day was at 23:10.
      await rollupPlatformDaily(env, utcDay(Date.now() - 24 * 60 * 60 * 1000)).catch((err) =>
        console.error("platform_rollup_failed", err),
      );
      /**
       * History, a few days per run, oldest gap first. Also the repair path: a
       * day the worker was down for has no rows and is picked up the next night.
       */
      await backfillPlatformDaily(env).catch((err) => console.error("platform_backfill_failed", err));
      /**
       * Traffic history, copied out of Analytics Engine a finished day at a
       * time before its three months are up. Its own guard skips anything
       * before 00:10 UTC, which is why the daily cron fires at 00:20.
       */
      await rollupTrafficDaily(env).catch((err) =>
        console.error("traffic_rollup_failed", { error: err instanceof Error ? err.message : String(err) }),
      );
    }
  },
} satisfies ExportedHandler<Bindings>;
