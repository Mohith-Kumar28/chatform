import type { Bindings } from "../env.js";

/**
 * Webhook delivery: HMAC-signed, exponential backoff, delivery log.
 * Queue message: { event, organizationId, formId, submissionId, sessionId }
 */

const RETRY_SCHEDULE_MS = [60_000, 300_000, 1_800_000, 7_200_000]; // 1m, 5m, 30m, 2h → dead
const MAX_ATTEMPTS = RETRY_SCHEDULE_MS.length + 1;

export interface WebhookEvent {
  event: "submission.completed" | "submission.abandoned" | "session.started" | "form.published";
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
    if (!events.includes(evt.event)) continue;

    const body = JSON.stringify(payload);
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = await hmac(hook.secret, `${timestamp}.${body}`);

    const deliveryId = `whd_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
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
          "x-chatform-signature": `t=${timestamp}, v1=${signature}`,
          "x-chatform-delivery": deliveryId,
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

    if (status === "failed") {
      const attemptRow = await env.DB.prepare(
        `SELECT COUNT(*) AS n FROM webhook_deliveries WHERE webhook_id = ? AND event_type = ? AND payload = ?`,
      )
        .bind(hook.id, evt.event, body)
        .first<{ n: number }>();
      const attempt = (attemptRow?.n ?? 0) + 1;
      if (attempt >= MAX_ATTEMPTS) {
        status = "dead";
      } else {
        nextRetryAt = Date.now() + (RETRY_SCHEDULE_MS[attempt - 1] ?? RETRY_SCHEDULE_MS[0]!);
      }
    }

    await env.DB.prepare(
      `INSERT INTO webhook_deliveries (id, webhook_id, event_type, payload, attempt, status, response_status, last_error, next_retry_at, created_at)
       VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, ?)`,
    )
      .bind(deliveryId, hook.id, evt.event, body, status, responseStatus, lastError, nextRetryAt, Date.now())
      .run();
  }
}

/** Retry sweep — cron re-enqueues failed deliveries past next_retry_at. */
export async function retryFailedDeliveries(env: Bindings): Promise<number> {
  const due = await env.DB.prepare(
    `SELECT d.id, d.webhook_id, w.organization_id, w.form_id FROM webhook_deliveries d
     JOIN webhooks w ON w.id = d.webhook_id
     WHERE d.status = 'failed' AND d.next_retry_at IS NOT NULL AND d.next_retry_at < ? LIMIT 50`,
  )
    .bind(Date.now())
    .all<{ id: string; webhook_id: string; organization_id: string; form_id: string | null }>();

  let n = 0;
  for (const d of due.results ?? []) {
    await env.DB.prepare(`DELETE FROM webhook_deliveries WHERE id = ?`).bind(d.id).run();
    await env.Q_WEBHOOKS.send({
      event: "submission.completed",
      organizationId: d.organization_id,
      formId: d.form_id ?? "",
      retryOfDeliveryId: d.id,
    });
    n++;
  }
  return n;
}
