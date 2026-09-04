import type { Bindings } from "./env.js";
import { createApp } from "./app.js";
import { SessionDO } from "./do/session-do.js";
import { deliverWebhookEvent, retryFailedDeliveries, type WebhookEvent } from "./lib/webhooks.js";
import { pruneOtpChallenges } from "./lib/respondent-auth.js";
import { pruneGateLog } from "./lib/gate-log.js";
import { runExport, pruneExpiredExports, type ExportMessage } from "./lib/exports.js";
import {
  sweepExpiredResponses,
  sweepExpiredSessions,
  sweepPartialNotifications,
  pruneTestData,
  pruneIdempotencyKeys,
} from "./lib/sweeps.js";

export { SessionDO };

const app = createApp();

export default {
  fetch(request: Request, env: Bindings, ctx: ExecutionContext) {
    return app.fetch(request, env, ctx);
  },
  async queue(batch: MessageBatch, env: Bindings, _ctx: ExecutionContext): Promise<void> {
    for (const msg of batch.messages) {
      const body = msg.body as WebhookEvent & { retryOfDeliveryId?: string };
      if (batch.queue === "q-webhooks" && body.event) {
        try {
          await deliverWebhookEvent(env, body);
          msg.ack();
        } catch (err) {
          console.error("webhook_delivery_failed", err);
          msg.retry();
        }
      } else if (batch.queue === "q-exports") {
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
      } else {
        msg.ack();
      }
    }
  },
  async scheduled(controller: ScheduledController, env: Bindings, _ctx: ExecutionContext): Promise<void> {
    if (controller.cron === "*/5 * * * *") {
      const n = await retryFailedDeliveries(env);
      if (n > 0) console.log(`webhook_retries_requeued: ${n}`);
      // Spent and expired OTP rows have no reason to be kept; they are only
      // ever read by the challenge that created them.
      await pruneOtpChallenges(env).catch((err) => console.error("otp_prune_failed", err));
      // Unconverted gate denials are only interesting while they are recent; a converted
      // row is kept forever because it is the attribution for a sale.
      await pruneGateLog(env).catch((err) => console.error("gate_log_prune_failed", err));

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
      await pruneIdempotencyKeys(env).catch((err) => console.error("idempotency_prune_failed", err));
      await pruneTestData(env).catch((err) => console.error("test_data_prune_failed", err));
      // An export is a full copy of respondent data sitting in a bucket. It is
      // kept for a day, not forever.
      await pruneExpiredExports(env).catch((err) => console.error("export_prune_failed", err));
    }
  },
} satisfies ExportedHandler<Bindings>;
