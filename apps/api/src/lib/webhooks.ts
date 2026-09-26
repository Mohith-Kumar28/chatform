import { displayAnswer, readFormDoc, type Block } from "@repo/form-schema";
import type { Bindings } from "../env.js";
import { deliverableUrl } from "./webhook-url.js";
import { parseMeta, readRespondentContext } from "./respondent-context.js";
import { sign as signStandard } from "./dodo-webhook.js";

/**
 * Webhook delivery, as a queue of deliveries rather than a loop over endpoints.
 *
 * Two kinds of message ride `q-webhooks`:
 *
 * 1. An **event** (`{ event, organizationId, formId, submissionId, ... }`), which
 *    is what every producer sends. Its consumer builds the payload once, writes
 *    one `webhook_deliveries` row per matching endpoint and enqueues each.
 * 2. A **delivery** (`{ kind: "deliver", deliveryId }`), one endpoint and one
 *    attempt. A failure schedules its own retry on the queue, with a delay, and
 *    touches no other endpoint.
 *
 * D1 is the record, the queue only carries work. A delivery that runs out of
 * retries is `dead`: that is the failed list the Integrate tab shows and lets
 * an admin retry. The cron sweep re-queues anything the queue dropped.
 *
 * Modelled on Svix, Stripe and the Standard Webhooks spec: a stable
 * `webhook-id` per event, the payload frozen at the first attempt, 2xx as the
 * only success, 410 as "stop sending", and `Retry-After` honoured.
 */

/** Seconds to wait before each retry: 1m, 5m, 30m, 2h, 8h. Then the delivery is dead. */
export const RETRY_DELAYS_S = [60, 300, 1_800, 7_200, 28_800];
/** The first attempt plus one per retry. */
export const MAX_ATTEMPTS = RETRY_DELAYS_S.length + 1;
/** Consecutive failures before an endpoint is switched off. */
const AUTO_DISABLE_AFTER = 20;
/** How long an endpoint gets to answer. */
const TIMEOUT_MS = 15_000;
/** How long a claimed delivery is left alone before the sweep presumes the worker died. */
const LEASE_MS = 60_000;
/** A queue delay cannot be longer than a day. */
const MAX_DELAY_S = 86_400;
/** Delivered and failed deliveries are kept this long. */
const RETENTION_MS = 30 * 24 * 3_600_000;

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
  // New, so it has no `submission.*` twin to keep working — nothing was ever
  // subscribed to one.
  "response.disqualified": ["response.disqualified"],
  "response.partial": ["response.partial"],
  "response.answer_recorded": ["response.answer_recorded"],
  "session.started": ["session.started"],
  /**
   * A respondent came back through a follow-up link and the response is live
   * again. Worth its own event rather than left to be inferred: an integrator
   * will now legitimately see `response.abandoned` followed hours later by
   * `response.completed` for the same submission, and anything treating
   * abandonment as terminal needs a way to know that changed.
   */
  "response.resumed": ["response.resumed"],
  "followup.sent": ["followup.sent"],
  "form.published": ["form.published"],
};

/** Every name a subscription may be written as, for one emitted event. */
export function eventNames(event: string): readonly string[] {
  return EVENT_ALIASES[event] ?? [event];
}

export type WebhookEventName =
  | "response.completed"
  | "response.abandoned"
  | "response.disqualified"
  | "response.partial"
  | "response.answer_recorded"
  | "session.started"
  | "response.resumed"
  | "followup.sent"
  | "form.published";

export interface WebhookEvent {
  kind?: "event";
  event: WebhookEventName | "submission.completed" | "submission.abandoned";
  /** A response from the builder's preview. Never delivered. */
  isTest?: boolean;
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

/** The form's blocks by ref, or none when the doc is missing or unreadable. */
function formBlocks(schemaJson: string | null | undefined): Map<string, Block> {
  if (!schemaJson) return new Map();
  try {
    return new Map(readFormDoc(JSON.parse(schemaJson)).blocks.map((b) => [b.ref, b]));
  } catch {
    return new Map();
  }
}

/**
 * One answer, readable without the form in hand.
 *
 * `value` is the stored shape (option ids, not labels), so an integrator used
 * to need the form doc to know what "opt_x1" meant. The question, its choices
 * and the answer as text now travel with it. `question` and `options` are null
 * when the question has since been deleted from the form.
 */
export function describeAnswer(
  a: { block_ref: string; block_type: string; value_json: string },
  block: Block | undefined,
) {
  const value = JSON.parse(a.value_json) as unknown;
  const options =
    block && "options" in block && Array.isArray(block.options)
      ? block.options.map((o: { id: string; label: string }) => ({ id: o.id, label: o.label }))
      : null;
  let display: string | null = null;
  if (block) {
    try {
      display = displayAnswer(block, value);
    } catch {
      display = null;
    }
  }
  return {
    ref: a.block_ref,
    type: a.block_type,
    question: block?.title ?? null,
    options,
    value,
    display,
  };
}

/** One endpoint, one attempt. The row carries everything else. */
export interface WebhookDeliveryMessage {
  kind: "deliver";
  deliveryId: string;
}

export type WebhookMessage = WebhookEvent | WebhookDeliveryMessage;

export function isDeliveryMessage(m: unknown): m is WebhookDeliveryMessage {
  return typeof m === "object" && m !== null && (m as { kind?: unknown }).kind === "deliver";
}

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

const randomId = (prefix: string, len: number) => `${prefix}${crypto.randomUUID().replace(/-/g, "").slice(0, len)}`;

/** Chunks of a hundred, the queue's `sendBatch` ceiling. */
async function enqueueDeliveries(env: Bindings, ids: string[]): Promise<void> {
  for (let i = 0; i < ids.length; i += 100) {
    await env.Q_WEBHOOKS.sendBatch(
      ids.slice(i, i + 100).map((deliveryId) => ({ body: { kind: "deliver", deliveryId } satisfies WebhookDeliveryMessage })),
    );
  }
}

/**
 * Turn one event into one delivery per matching endpoint.
 *
 * `messageId` is the queue message's own id, which stays the same when the
 * queue redelivers it. The event id and every delivery id are derived from it,
 * and inserted with `OR IGNORE`, so a redelivered event cannot send twice: the
 * rows already exist, and the claim in `deliverOne` drops the second message.
 */
export async function fanOutEvent(env: Bindings, evt: WebhookEvent, messageId?: string): Promise<number> {
  if (evt.isTest === true) return 0;
  const eventId = messageId ? `evt_${(await sha256Hex(messageId)).slice(0, 20)}` : randomId("evt_", 20);

  /**
   * The payload and the endpoints in one round trip.
   *
   * The response, its answers and the matching webhooks are three independent
   * reads; awaited in turn they were three hops to D1 before the first delivery
   * left.
   */
  const [hooksRes, subRes, answersRes, docRes] = (await env.DB.batch([
    // Form-specific and org-wide, in one list.
    env.DB
      .prepare(
        `SELECT id, url, events FROM webhooks WHERE organization_id = ? AND active = 1 AND (form_id = ? OR form_id IS NULL)`,
      )
      .bind(evt.organizationId, evt.formId),
    ...(evt.submissionId
      ? [
          env.DB
            .prepare(
              `SELECT id, status, source, started_at, completed_at, duration_ms, hidden_fields, meta, is_test FROM submissions WHERE id = ?`,
            )
            .bind(evt.submissionId),
          env.DB
            .prepare(`SELECT block_ref, block_type, value_json FROM submission_answers WHERE submission_id = ?`)
            .bind(evt.submissionId),
          /**
           * The questions the response was answered against: its own version,
           * else the live one, else the draft (a preview response).
           */
          env.DB
            .prepare(
              `SELECT COALESCE(
                 (SELECT fv.schema_json FROM submissions s JOIN form_versions fv ON fv.id = s.form_version_id WHERE s.id = ?),
                 (SELECT COALESCE(fv.schema_json, f.working_schema) FROM forms f LEFT JOIN form_versions fv ON fv.id = f.active_version_id WHERE f.id = ?)
               ) AS schema_json`,
            )
            .bind(evt.submissionId, evt.formId),
        ]
      : []),
  ])) as [
    D1Result<{ id: string; url: string; events: string }>,
    D1Result<Record<string, unknown>>?,
    D1Result<{ block_ref: string; block_type: string; value_json: string }>?,
    D1Result<{ schema_json: string | null }>?,
  ];

  const names = eventNames(evt.event);
  const hooks = (hooksRes.results ?? []).filter((hook) => {
    const events = JSON.parse(hook.events) as string[];
    if (!events.some((e) => names.includes(e))) return false;
    /**
     * The address check, at the moment it matters.
     *
     * Rows created before the create routes agreed on a rule are still here,
     * and one of them may point at `http://10.0.0.1/`. Skipped rather than
     * queued: a private address will not become public on the fourth attempt.
     */
    if (!deliverableUrl(env, hook.url)) {
      console.warn("webhook_url_refused", { hookId: hook.id, event: evt.event });
      return false;
    }
    return true;
  });
  if (hooks.length === 0) return 0;

  const payload: Record<string, unknown> = { id: eventId, event: evt.event, formId: evt.formId, timestamp: Date.now() };
  if (evt.submissionId) {
    const { is_test: isTest, ...submission } = (subRes?.results ?? [])[0] ?? {};
    // A preview response, whatever the producer said. The schema has always
    // promised these never reach an endpoint.
    if (isTest === 1 || isTest === true) return 0;
    const found = Object.keys(submission).length > 0 ? submission : null;
    payload.submission = found;
    /*
      Who filled it in and from where, as a parsed object. `submission.meta`
      stays the raw string it has always been, because endpoints in the wild
      parse it; this is the readable twin.
    */
    payload.metadata = found ? readRespondentContext(parseMeta(found.meta), found.source as string | null) : null;
    const blocks = formBlocks(docRes?.results?.[0]?.schema_json);
    payload.answers = (answersRes?.results ?? []).map((a) => describeAnswer(a, blocks.get(a.block_ref)));
  }

  // Frozen here. Every attempt and every replay sends exactly these bytes.
  const body = JSON.stringify(payload);
  const now = Date.now();
  const ids: string[] = [];
  const inserts: D1PreparedStatement[] = [];
  for (const hook of hooks) {
    const deliveryId = `whd_${(await sha256Hex(`${eventId}:${hook.id}`)).slice(0, 16)}`;
    ids.push(deliveryId);
    inserts.push(
      env.DB
        .prepare(
          `INSERT OR IGNORE INTO webhook_deliveries
             (id, webhook_id, event_id, event_type, payload, message_json, attempt, status, next_retry_at, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, 0, 'pending', ?, ?, ?)`,
        )
        .bind(deliveryId, hook.id, eventId, evt.event, body, JSON.stringify(evt), now, now, now),
    );
  }
  await env.DB.batch(inserts);
  await enqueueDeliveries(env, ids);
  return ids.length;
}

export interface SendResult {
  ok: boolean;
  status: number | null;
  error: string | null;
  /** The first KB of the response, for the attempt log. */
  responseBody: string | null;
  durationMs: number;
  /** Seconds the endpoint asked us to wait, from `Retry-After`. */
  retryAfterS: number | null;
}

/** Read at most `limit` bytes of a body, and let go of the rest. */
async function readHead(res: Response, limit = 1024): Promise<string | null> {
  if (!res.body) return null;
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (size < limit) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      size += value.byteLength;
    }
  } catch {
    // A body that breaks off mid-read still tells us something.
  } finally {
    reader.cancel().catch(() => {});
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const c of chunks) {
    bytes.set(c, offset);
    offset += c.byteLength;
  }
  const text = new TextDecoder().decode(bytes.slice(0, limit)).trim();
  return text.length > 0 ? text : null;
}

/** `Retry-After` as seconds: either a number of seconds or an HTTP date. */
export function parseRetryAfter(header: string | null, now = Date.now()): number | null {
  if (!header) return null;
  const secs = Number(header);
  if (Number.isFinite(secs) && secs >= 0) return Math.min(Math.ceil(secs), MAX_DELAY_S);
  const at = Date.parse(header);
  if (Number.isNaN(at)) return null;
  return Math.min(Math.max(0, Math.ceil((at - now) / 1000)), MAX_DELAY_S);
}

/**
 * One signed POST. Shared by real deliveries and the "Test connection" button,
 * so a test proves exactly what a delivery will send.
 */
export async function sendSigned(
  hook: { url: string; secret: string },
  msg: { eventId: string; deliveryId: string; eventType: string; body: string },
): Promise<SendResult> {
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = await hmac(hook.secret, `${timestamp}.${msg.body}`);
  // Signed over id.timestamp.payload, which is what makes the id part of what
  // is authenticated: a replayed body with a different id fails.
  const standardSignature = await signStandard(hook.secret, msg.eventId, String(timestamp), msg.body);
  const started = Date.now();
  try {
    const res = await fetch(hook.url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "user-agent": "Chatform-Webhooks/1.0",
        "x-chatform-event": msg.eventType,
        "x-chatform-delivery": msg.deliveryId,
        /**
         * Two signature schemes, deliberately.
         *
         * The Standard Webhooks headers are what an integrator's existing
         * library already verifies. `webhook-id` is the event, the same on
         * every retry, so a receiver can drop a duplicate. The legacy header
         * stays because endpoints in the wild are verifying it today.
         */
        "webhook-id": msg.eventId,
        "webhook-timestamp": String(timestamp),
        "webhook-signature": `v1,${standardSignature}`,
        "x-chatform-signature": `t=${timestamp}, v1=${signature}`,
      },
      body: msg.body,
      // A redirect is a misconfigured URL, not a delivery. Following it would
      // also send the payload somewhere the admin never typed.
      redirect: "manual",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const responseBody = await readHead(res);
    const ok = res.status >= 200 && res.status < 300;
    return {
      ok,
      status: res.status,
      error: ok ? null : `HTTP ${res.status}`,
      responseBody,
      durationMs: Date.now() - started,
      retryAfterS: res.status === 429 || res.status === 503 ? parseRetryAfter(res.headers.get("retry-after")) : null,
    };
  } catch (err) {
    const timedOut = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
    return {
      ok: false,
      status: null,
      error: timedOut ? `Timed out after ${TIMEOUT_MS / 1000}s` : err instanceof Error ? err.message : "Could not reach the URL",
      responseBody: null,
      durationMs: Date.now() - started,
      retryAfterS: null,
    };
  }
}

/** The wait before retry number `attempt` (1-based), with ±20% jitter so retries do not arrive in step. */
export function retryDelayS(attempt: number, retryAfterS: number | null = null, random = Math.random): number {
  if (retryAfterS != null) return Math.min(Math.max(retryAfterS, 1), MAX_DELAY_S);
  const base = RETRY_DELAYS_S[attempt - 1] ?? RETRY_DELAYS_S[RETRY_DELAYS_S.length - 1]!;
  return Math.min(Math.round(base * (0.8 + random() * 0.4)), MAX_DELAY_S);
}

/**
 * Make one attempt at one delivery.
 *
 * The claim comes first: a row moves from `pending` to `sending` exactly once,
 * so a message the queue delivers twice, or one the sweep re-queued while the
 * original was still in flight, finds nothing to do.
 */
export async function deliverOne(env: Bindings, deliveryId: string): Promise<void> {
  const now = Date.now();
  const claimed = await env.DB.prepare(
    `UPDATE webhook_deliveries SET status = 'sending', lease_until = ?, updated_at = ?
      WHERE id = ? AND status = 'pending'`,
  )
    .bind(now + LEASE_MS, now, deliveryId)
    .run();
  if (!claimed.meta.changes) return;

  const row = await env.DB.prepare(
    `SELECT d.id, d.webhook_id, d.event_id, d.event_type, d.payload, d.attempt, w.url, w.secret, w.active
       FROM webhook_deliveries d JOIN webhooks w ON w.id = d.webhook_id
      WHERE d.id = ?`,
  )
    .bind(deliveryId)
    .first<{
      id: string;
      webhook_id: string;
      event_id: string | null;
      event_type: string;
      payload: string;
      attempt: number;
      url: string;
      secret: string;
      active: number;
    }>();
  if (!row) return;

  /**
   * An endpoint switched off while this waited. Parked in the failed list
   * rather than dropped, so turning the endpoint back on and pressing
   * "Retry all" recovers everything it missed.
   */
  const refusal =
    row.active !== 1 ? "Endpoint is turned off" : !deliverableUrl(env, row.url) ? "Address is not allowed" : null;
  if (refusal) {
    await env.DB.prepare(
      `UPDATE webhook_deliveries SET status = 'dead', last_error = ?, lease_until = NULL, next_retry_at = NULL, updated_at = ? WHERE id = ?`,
    )
      .bind(refusal, Date.now(), row.id)
      .run();
    return;
  }

  const eventId = row.event_id ?? row.id;
  const result = await sendSigned(row, { eventId, deliveryId: row.id, eventType: row.event_type, body: row.payload });
  const attempt = row.attempt + 1;
  const at = Date.now();

  // 410 Gone is the receiver saying "stop", in the spec's words. Anything else
  // that is not a 2xx may be fixed by the time the next retry comes round.
  const gone = result.status === 410;
  const dead = !result.ok && (gone || attempt >= MAX_ATTEMPTS);
  const delayS = !result.ok && !dead ? retryDelayS(attempt, result.retryAfterS) : null;
  const status = result.ok ? "success" : dead ? "dead" : "pending";

  const writes: D1PreparedStatement[] = [
    env.DB
      .prepare(
        `INSERT INTO webhook_attempts (id, delivery_id, attempt, response_status, error, response_body, duration_ms, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(randomId("wha_", 16), row.id, attempt, result.status, result.error, result.responseBody, result.durationMs, at),
    env.DB
      .prepare(
        `UPDATE webhook_deliveries
            SET status = ?, attempt = ?, response_status = ?, last_error = ?, next_retry_at = ?,
                lease_until = NULL, delivered_at = ?, updated_at = ?
          WHERE id = ?`,
      )
      .bind(
        status,
        attempt,
        result.status,
        result.error,
        delayS != null ? at + delayS * 1000 : null,
        result.ok ? at : null,
        at,
        row.id,
      ),
  ];
  if (result.ok) {
    writes.push(env.DB.prepare(`UPDATE webhooks SET consecutive_failures = 0 WHERE id = ?`).bind(row.webhook_id));
  } else {
    /**
     * The increment has to land before the statement that reads it, which is
     * why they are appended in this order. An endpoint that has failed twenty
     * attempts in a row is not coming back on its own; retrying every event
     * forever is how a dead integration turns into an outage report.
     */
    writes.push(
      env.DB.prepare(`UPDATE webhooks SET consecutive_failures = consecutive_failures + 1 WHERE id = ?`).bind(row.webhook_id),
      env.DB
        .prepare(`UPDATE webhooks SET active = 0 WHERE id = ? AND (consecutive_failures >= ? OR ? = 1)`)
        .bind(row.webhook_id, AUTO_DISABLE_AFTER, gone ? 1 : 0),
    );
  }
  await env.DB.batch(writes);

  // After the write, so a failed send leaves a pending row the sweep will find.
  if (delayS != null) {
    await env.Q_WEBHOOKS.send({ kind: "deliver", deliveryId: row.id } satisfies WebhookDeliveryMessage, {
      delaySeconds: delayS,
    });
  }
}

/**
 * The queue's own dead-letter queue: a message that crashed the consumer on
 * every one of its retries (a D1 outage, a bug). The delivery goes to the
 * failed list so it is visible and can be retried, instead of vanishing.
 */
export async function markDeadFromDlq(env: Bindings, body: unknown): Promise<void> {
  if (isDeliveryMessage(body)) {
    await env.DB.prepare(
      `UPDATE webhook_deliveries SET status = 'dead', last_error = COALESCE(last_error, 'Delivery kept crashing'),
              lease_until = NULL, next_retry_at = NULL, updated_at = ?
        WHERE id = ? AND status IN ('pending', 'sending')`,
    )
      .bind(Date.now(), body.deliveryId)
      .run();
    return;
  }
  // An event that never fanned out has no row to park on. Log enough to find it.
  const evt = body as Partial<WebhookEvent>;
  console.error("webhook_event_dead_lettered", {
    event: evt.event,
    organizationId: evt.organizationId,
    formId: evt.formId,
    submissionId: evt.submissionId,
  });
}

/**
 * Send a delivery again, now.
 *
 * A failed one starts a fresh round of retries on the same row, so its history
 * stays in one place. A delivered one is copied, because its record of having
 * arrived is true and should stay true; the copy carries the same event id, so
 * a receiver that de-duplicates will know it has seen it.
 */
export async function redeliver(
  env: Bindings,
  orgId: string,
  webhookId: string,
  deliveryId: string,
): Promise<"queued" | "not_found" | "not_replayable"> {
  const row = await env.DB.prepare(
    `SELECT d.id, d.event_id, d.event_type, d.payload, d.message_json, d.status FROM webhook_deliveries d
       JOIN webhooks w ON w.id = d.webhook_id
      WHERE d.id = ? AND d.webhook_id = ? AND w.organization_id = ?`,
  )
    .bind(deliveryId, webhookId, orgId)
    .first<{ id: string; event_id: string | null; event_type: string; payload: string; message_json: string | null; status: string }>();
  if (!row) return "not_found";
  // A "Test connection" row: there is nothing real to send again.
  if (row.event_type === "test") return "not_replayable";

  const now = Date.now();
  let target = row.id;
  if (row.status === "success") {
    target = randomId("whd_", 16);
    await env.DB.prepare(
      `INSERT INTO webhook_deliveries
         (id, webhook_id, event_id, event_type, payload, message_json, attempt, status, next_retry_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 0, 'pending', ?, ?, ?)`,
    )
      .bind(target, webhookId, row.event_id ?? row.id, row.event_type, row.payload, row.message_json, now, now, now)
      .run();
  } else if (row.status === "sending") {
    // Already on its way.
    return "queued";
  } else {
    await env.DB.prepare(
      `UPDATE webhook_deliveries SET status = 'pending', attempt = 0, next_retry_at = ?, lease_until = NULL,
              event_id = COALESCE(event_id, id), updated_at = ?
        WHERE id = ?`,
    )
      .bind(now, now, row.id)
      .run();
  }
  await enqueueDeliveries(env, [target]);
  return "queued";
}

/** Every failed delivery of one endpoint, back in the queue. Returns how many. */
export async function retryAllFailed(env: Bindings, orgId: string, webhookId: string): Promise<number> {
  const now = Date.now();
  const res = await env.DB.prepare(
    `UPDATE webhook_deliveries SET status = 'pending', attempt = 0, next_retry_at = ?, lease_until = NULL,
            event_id = COALESCE(event_id, id), updated_at = ?
      WHERE id IN (
        SELECT d.id FROM webhook_deliveries d JOIN webhooks w ON w.id = d.webhook_id
         WHERE d.webhook_id = ? AND w.organization_id = ? AND d.status = 'dead' AND d.event_type != 'test'
         ORDER BY d.created_at LIMIT 500
      )
      RETURNING id`,
  )
    .bind(now, now, webhookId, orgId)
    .all<{ id: string }>();
  const ids = (res.results ?? []).map((r) => r.id);
  await enqueueDeliveries(env, ids);
  return ids.length;
}

export interface WebhookQueueCounts {
  /** Queued, in flight, or waiting for a retry. */
  pending: number;
  /** Gave up: the failed (dead-letter) list. */
  failed: number;
  delivered24h: number;
  lastDeliveredAt: number | null;
}

/** Queue status per endpoint, and in total, for an org or one form's endpoints. */
export async function webhookQueueStats(
  env: Bindings,
  orgId: string,
  formId?: string | null,
): Promise<{ total: WebhookQueueCounts; endpoints: (WebhookQueueCounts & { webhookId: string })[] }> {
  const since = Date.now() - 24 * 3_600_000;
  const res = await env.DB.prepare(
    `SELECT w.id AS webhook_id,
            COALESCE(SUM(CASE WHEN d.status IN ('pending', 'sending') THEN 1 ELSE 0 END), 0) AS pending,
            COALESCE(SUM(CASE WHEN d.status = 'dead' THEN 1 ELSE 0 END), 0) AS failed,
            COALESCE(SUM(CASE WHEN d.status = 'success' AND d.delivered_at >= ? THEN 1 ELSE 0 END), 0) AS delivered24h,
            MAX(d.delivered_at) AS last_delivered_at
       FROM webhooks w
       LEFT JOIN webhook_deliveries d ON d.webhook_id = w.id AND d.event_type != 'test'
      WHERE w.organization_id = ? ${formId ? "AND (w.form_id = ? OR w.form_id IS NULL)" : ""}
      GROUP BY w.id`,
  )
    .bind(...(formId ? [since, orgId, formId] : [since, orgId]))
    .all<{ webhook_id: string; pending: number; failed: number; delivered24h: number; last_delivered_at: number | null }>();
  const endpoints = (res.results ?? []).map((r) => ({
    webhookId: r.webhook_id,
    pending: r.pending,
    failed: r.failed,
    delivered24h: r.delivered24h,
    lastDeliveredAt: r.last_delivered_at,
  }));
  const total = endpoints.reduce<WebhookQueueCounts>(
    (t, e) => ({
      pending: t.pending + e.pending,
      failed: t.failed + e.failed,
      delivered24h: t.delivered24h + e.delivered24h,
      lastDeliveredAt: Math.max(t.lastDeliveredAt ?? 0, e.lastDeliveredAt ?? 0) || null,
    }),
    { pending: 0, failed: 0, delivered24h: 0, lastDeliveredAt: null },
  );
  return { total, endpoints };
}

/** Grace past a retry's due time before the sweep assumes its queue message was lost. */
const SWEEP_GRACE_MS = 2 * 60_000;

/**
 * The safety net under the queue, run by cron.
 *
 * The queue carries every retry with its own delay, so this normally finds
 * nothing. It re-queues a pending delivery whose message never arrived (a send
 * that failed after the row was written) and a claimed one whose worker died
 * mid-attempt. A duplicate it causes is harmless: the claim drops it. It also
 * forgets finished deliveries past the retention window.
 */
export async function sweepWebhookDeliveries(env: Bindings): Promise<number> {
  const now = Date.now();
  const due = await env.DB.prepare(
    `SELECT id FROM webhook_deliveries
      WHERE (status = 'pending' AND next_retry_at IS NOT NULL AND next_retry_at < ?)
         OR (status = 'sending' AND lease_until < ?)
      LIMIT 200`,
  )
    .bind(now - SWEEP_GRACE_MS, now)
    .all<{ id: string }>();
  const ids = (due.results ?? []).map((r) => r.id);
  if (ids.length > 0) {
    // A lost attempt goes back to pending before it is re-queued, or the claim would refuse it.
    await env.DB.prepare(
      `UPDATE webhook_deliveries SET status = 'pending', lease_until = NULL, updated_at = ?
        WHERE status = 'sending' AND id IN (${ids.map(() => "?").join(",")})`,
    )
      .bind(now, ...ids)
      .run();
    await enqueueDeliveries(env, ids);
  }

  const expired = `SELECT id FROM webhook_deliveries WHERE created_at < ? AND status IN ('success', 'dead') ORDER BY id LIMIT 500`;
  await env.DB.batch([
    env.DB.prepare(`DELETE FROM webhook_attempts WHERE delivery_id IN (${expired})`).bind(now - RETENTION_MS),
    env.DB.prepare(`DELETE FROM webhook_deliveries WHERE id IN (${expired})`).bind(now - RETENTION_MS),
  ]);
  return ids.length;
}

export type DeliveryFilter = "pending" | "failed" | "success";

const FILTER_SQL: Record<DeliveryFilter, string> = {
  pending: `AND d.status IN ('pending', 'sending')`,
  failed: `AND d.status = 'dead'`,
  success: `AND d.status = 'success'`,
};

/**
 * One endpoint's recent deliveries, newest first, each with its attempts.
 * Null when the endpoint is not the org's.
 */
export async function listDeliveries(
  env: Bindings,
  orgId: string,
  webhookId: string,
  opts: { status?: DeliveryFilter; limit?: number; withPayload?: boolean } = {},
) {
  const owned = await env.DB.prepare(`SELECT id FROM webhooks WHERE id = ? AND organization_id = ?`)
    .bind(webhookId, orgId)
    .first();
  if (!owned) return null;
  const limit = Math.min(Math.max(opts.limit ?? 25, 1), 100);
  const rows = await env.DB.prepare(
    `SELECT d.id, d.event_id, d.event_type, d.status, d.attempt, d.response_status, d.last_error,
            d.next_retry_at, d.delivered_at, d.created_at, d.updated_at${opts.withPayload ? ", d.payload" : ""}
       FROM webhook_deliveries d
      WHERE d.webhook_id = ? ${opts.status ? FILTER_SQL[opts.status] : ""}
      ORDER BY d.created_at DESC LIMIT ?`,
  )
    .bind(webhookId, limit)
    .all<{
      id: string;
      event_id: string | null;
      event_type: string;
      status: string;
      attempt: number;
      response_status: number | null;
      last_error: string | null;
      next_retry_at: number | null;
      delivered_at: number | null;
      created_at: number;
      updated_at: number | null;
      payload?: string;
    }>();
  const deliveries = rows.results ?? [];
  const attempts = new Map<string, { attempt: number; status: number | null; error: string | null; responseBody: string | null; durationMs: number | null; at: number }[]>();
  if (deliveries.length > 0) {
    const res = await env.DB.prepare(
      `SELECT delivery_id, attempt, response_status, error, response_body, duration_ms, created_at FROM webhook_attempts
        WHERE delivery_id IN (${deliveries.map(() => "?").join(",")}) ORDER BY created_at`,
    )
      .bind(...deliveries.map((d) => d.id))
      .all<{ delivery_id: string; attempt: number; response_status: number | null; error: string | null; response_body: string | null; duration_ms: number | null; created_at: number }>();
    for (const a of res.results ?? []) {
      const list = attempts.get(a.delivery_id) ?? [];
      list.push({ attempt: a.attempt, status: a.response_status, error: a.error, responseBody: a.response_body, durationMs: a.duration_ms, at: a.created_at });
      attempts.set(a.delivery_id, list);
    }
  }
  return deliveries.map((d) => ({
    id: d.id,
    eventId: d.event_id,
    event: d.event_type,
    /** `sending` reads as pending from outside: it is still on its way. */
    status: d.status === "sending" ? "pending" : d.status === "dead" ? "failed" : d.status,
    attempt: d.attempt,
    maxAttempts: MAX_ATTEMPTS,
    responseStatus: d.response_status,
    lastError: d.last_error,
    nextAttemptAt: d.status === "pending" ? d.next_retry_at : null,
    deliveredAt: d.delivered_at,
    createdAt: d.created_at,
    attempts: attempts.get(d.id) ?? [],
    ...(opts.withPayload ? { payload: d.payload } : {}),
  }));
}
