import type { Bindings } from "./env.js";
import { createApp } from "./app.js";
import { SessionDO } from "./do/session-do.js";
import { deliverWebhookEvent, retryFailedDeliveries, type WebhookEvent } from "./lib/webhooks.js";
import { pruneOtpChallenges } from "./lib/respondent-auth.js";
import { pruneGateLog } from "./lib/gate-log.js";

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
    }
  },
} satisfies ExportedHandler<Bindings>;
