import type { Bindings } from "../env.js";
import { sign as signStandard } from "./dodo-webhook.js";

/**
 * Webhook delivery: HMAC-signed, exponential backoff, delivery log.
 * Queue message: { event, organizationId, formId, submissionId, sessionId }
 */

const RETRY_SCHEDULE_MS = [60_000, 300_000, 1_800_000, 7_200_000]; // 1m, 5m, 30m, 2h → dead
const MAX_ATTEMPTS = RETRY_SCHEDULE_MS.length + 1;
/** Consecutive failures before an endpoint is switched off. */
const AUTO_DISABLE_AFTER = 20;

/**
 * `response.*` is the canonical namespace; `submission.*` is kept as an alias.
 *
 * The resource is called a response everywhere else in the product — the tab,
 * the plan features (`responses_per_month`, `partial_responses`), the API — so
 * a new `response.partial` event sitting next to `submission.completed` would
 * be the one place still using the other word. Rather than break every existing
 * subscription, one emitted event matches either name: a hook subscribed to
 * `submission.completed` keeps firing forever, and a new integration never has
 * to learn the old word.
 */
export const EVENT_ALIASES: Record<string, readonly string[]> = {
  "response.completed": ["response.completed", "submission.completed"],
  "response.abandoned": ["response.abandoned", "submission.abandoned"],
  "response.partial": ["response.partial"],
  "response.answer_recorded": ["response.answer_recorded"],
  "session.started": ["session.started"],
  "form.published": ["form.published"],
};

/** Every name a subscription may be written as, for one emitted event. */
export function eventNames(event: string): readonly string[] {
  return EVENT_ALIASES[event] ?? [event];
}

export type WebhookEventName =
  | "response.completed"
  | "response.abandoned"
  | "response.partial"
  | "response.answer_recorded"
  | "session.started"
  | "form.published";

export interface WebhookEvent {
  event: WebhookEventName | "submission.completed" | "submission.abandoned";
  /** Delivery attempts already made. Carried on the message, not counted. */
  attempt?: number;
  organizationId: string;
  formId: string;
  submissionId?: string;
  sessionId?: string;
  [k: string]: unknown;
}

export async function hmac(secret: string, payload: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(payload));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Deliver one event to all matching webhooks. Called per queue message. */
export async function deliverWebhookEvent(env: Bindings, evt: WebhookEvent): Promise<void> {
  // resolve payload once
  let payload: Record<string, unknown> = { event: evt.event, formId: evt.formId, timestamp: Date.now() };
  if (evt.submissionId) {
    const sub = await env.DB.prepare(
      `SELECT id, status, started_at, completed_at, duration_ms, hidden_fields, meta FROM submissions WHERE id = ?`,
    )
      .bind(evt.submissionId)
      .first<Record<string, unknown>>();
    const answers = await env.DB.prepare(
      `SELECT block_ref, block_type, value_json FROM submission_answers WHERE submission_id = ?`,
    )
      .bind(evt.submissionId)
      .all<{ block_ref: string; block_type: string; value_json: string }>();
    payload.submission = sub;
    payload.answers = (answers.results ?? []).map((a) => ({
      ref: a.block_ref,
      type: a.block_type,
      value: JSON.parse(a.value_json),
    }));
  }

  // find matching webhooks (form-specific first, then org-wide)
  const hooks = await env.DB.prepare(
    `SELECT id, url, secret, events FROM webhooks WHERE organization_id = ? AND active = 1 AND (form_id = ? OR form_id IS NULL)`,
  )
    .bind(evt.organizationId, evt.formId)
    .all<{ id: string; url: string; secret: string; events: string }>();

  for (const hook of hooks.results ?? []) {
    const events = JSON.parse(hook.events) as string[];
    const names = eventNames(evt.event);
    if (!events.some((e) => names.includes(e))) continue;

    const body = JSON.stringify(payload);
    const timestamp = Math.floor(Date.now() / 1000);
    const deliveryId = `whd_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
    const signature = await hmac(hook.secret, `${timestamp}.${body}`);
    // Signed over id.timestamp.payload, which is what makes the delivery id part
    // of what is authenticated — a replayed body with a fresh id fails.
    const standardSignature = await signStandard(hook.secret, deliveryId, String(timestamp), body);
    let status = "success";
    let responseStatus: number | null = null;
    let lastError: string | null = null;
    let nextRetryAt: number | null = null;

    try {
      const res = await fetch(hook.url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-chatform-event": evt.event,
          "x-chatform-delivery": deliveryId,
          /**
           * Two signature schemes, deliberately.
           *
           * The Standard Webhooks headers are what an integrator's existing
           * library already verifies — the same scheme we verify inbound Dodo
           * deliveries with, so there is no new crypto here. The legacy header
           * stays because endpoints in the wild are verifying it today and a
           * silent change would look like an attack to every one of them.
           */
          "webhook-id": deliveryId,
          "webhook-timestamp": String(timestamp),
          "webhook-signature": `v1,${standardSignature}`,
          "x-chatform-signature": `t=${timestamp}, v1=${signature}`,
        },
        body,
        signal: AbortSignal.timeout(10_000),
      });
      responseStatus = res.status;
      if (res.status >= 400) {
        status = "failed";
        lastError = `HTTP ${res.status}`;
      }
    } catch (err) {
      status = "failed";
      lastError = err instanceof Error ? err.message : "fetch failed";
    }

    /**
     * The attempt number, carried forward rather than counted.
     *
     * It used to be derived by counting rows whose payload string matched
     * exactly — while every row was inserted with `attempt` hardcoded to 1, so
     * the column said nothing and the count was a full-text comparison over a
     * growing table.
     */
    const attempt = (evt.attempt ?? 0) + 1;
    if (status === "failed") {
      if (attempt >= MAX_ATTEMPTS) {
        status = "dead";
      } else {
        nextRetryAt = Date.now() + (RETRY_SCHEDULE_MS[attempt - 1] ?? RETRY_SCHEDULE_MS[0]!);
      }
    }

    await env.DB.prepare(
      `INSERT INTO webhook_deliveries (id, webhook_id, event_type, payload, message_json, attempt, status, response_status, last_error, next_retry_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        deliveryId,
        hook.id,
        evt.event,
        body,
        // The message verbatim, so a retry re-sends what was actually sent.
        JSON.stringify({ ...evt, attempt }),
        attempt,
        status,
        responseStatus,
        lastError,
        nextRetryAt,
        Date.now(),
      )
      .run();

    if (status === "failed" || status === "dead") {
      await env.DB.prepare(
        `UPDATE webhooks SET consecutive_failures = consecutive_failures + 1 WHERE id = ?`,
      )
        .bind(hook.id)
        .run();
      /**
       * Stop delivering to an endpoint that has been gone for a day.
       *
       * Not a courtesy to us — it is a courtesy to them: an endpoint that has
       * failed this many times in a row is not coming back on its own, and
       * continuing to retry every event forever is how a dead integration turns
       * into an outage report.
       */
      await env.DB.prepare(
        `UPDATE webhooks SET active = 0 WHERE id = ? AND consecutive_failures >= ?`,
      )
        .bind(hook.id, AUTO_DISABLE_AFTER)
        .run();
    } else {
      await env.DB.prepare(`UPDATE webhooks SET consecutive_failures = 0 WHERE id = ?`).bind(hook.id).run();
    }
  }
}

/** Retry sweep — cron re-enqueues failed deliveries past next_retry_at. */
export async function retryFailedDeliveries(env: Bindings): Promise<number> {
  const due = await env.DB.prepare(
    `SELECT d.id, d.webhook_id, d.message_json, w.organization_id, w.form_id FROM webhook_deliveries d
     JOIN webhooks w ON w.id = d.webhook_id
     WHERE d.status = 'failed' AND d.next_retry_at IS NOT NULL AND d.next_retry_at < ? LIMIT 50`,
  )
    .bind(Date.now())
    .all<{ id: string; webhook_id: string; message_json: string | null; organization_id: string; form_id: string | null }>();

  let n = 0;
  for (const d of due.results ?? []) {
    /**
     * Re-enqueue the original message.
     *
     * This used to rebuild one from the delivery row and get it wrong twice
     * over: it hardcoded `submission.completed` and dropped the submission id,
     * so a retried abandonment was redelivered as a completion with no payload
     * at all. `message_json` is the message that was actually sent.
     */
    const message = d.message_json ? (JSON.parse(d.message_json) as WebhookEvent) : null;
    await env.DB.prepare(`DELETE FROM webhook_deliveries WHERE id = ?`).bind(d.id).run();
    if (!message) {
      // A delivery from before message_json existed. Its event cannot be
      // reconstructed honestly, so it is dropped rather than redelivered as
      // something it was not.
      continue;
    }
    await env.Q_WEBHOOKS.send({ ...message, retryOfDeliveryId: d.id });
    n++;
  }
  return n;
}
