import type { Bindings } from "./env.js";
import { createApp } from "./app.js";
import { SessionDO } from "./do/session-do.js";
import { deliverWebhookEvent, retryFailedDeliveries, type WebhookEvent } from "./lib/webhooks.js";

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
    }
  },
} satisfies ExportedHandler<Bindings>;
