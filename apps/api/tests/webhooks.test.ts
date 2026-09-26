import { describe, it, expect, beforeAll, afterEach, vi } from "vitest";
import { env } from "cloudflare:test";
import { applySchema, seedTenant, type Tenant } from "./helpers.js";
import {
  eventNames,
  fanOutEvent,
  deliverOne,
  markDeadFromDlq,
  redeliver,
  retryAllFailed,
  sweepWebhookDeliveries,
  parseRetryAfter,
  retryDelayS,
  MAX_ATTEMPTS,
} from "../src/lib/webhooks.js";

/**
 * The delivery queue: one event fans out to one delivery per endpoint, and each
 * delivery retries on its own.
 *
 * Before this, a retry re-enqueued the whole event, so every endpoint that had
 * already accepted it got it again, and the failed row was deleted, so the
 * history of what went wrong went with it.
 */

let t: Tenant;

beforeAll(async () => {
  await applySchema();
  t = await seedTenant("whooks");
});

afterEach(() => {
  vi.restoreAllMocks();
});

type Sent = { body: unknown; delaySeconds?: number };

/** The env with a queue that records instead of sending. */
function queueEnv() {
  const sent: Sent[] = [];
  const fake = {
    ...env,
    Q_WEBHOOKS: {
      send: async (body: unknown, opts?: { delaySeconds?: number }) => void sent.push({ body, delaySeconds: opts?.delaySeconds }),
      sendBatch: async (ms: { body: unknown }[]) => void sent.push(...ms.map((m) => ({ body: m.body }))),
    },
  } as unknown as Parameters<typeof deliverOne>[0];
  return { fake, sent };
}

let hookSeq = 0;
async function hook(events = ["response.completed"], formId: string | null = t.formId): Promise<string> {
  const id = `wh_t${++hookSeq}`;
  await env.DB.prepare(
    `INSERT INTO webhooks (id, organization_id, form_id, url, secret, events, active, created_at)
     VALUES (?, ?, ?, ?, 'whsec_dGVzdHNlY3JldHRlc3RzZWNyZXQ=', ?, 1, ?)`,
  )
    .bind(id, t.orgId, formId, `https://hooks.acme.example/${id}`, JSON.stringify(events), Date.now())
    .run();
  return id;
}

async function pendingDelivery(webhookId: string, attempt = 0): Promise<string> {
  const id = `whd_t${++hookSeq}`;
  const now = Date.now();
  await env.DB.prepare(
    `INSERT INTO webhook_deliveries (id, webhook_id, event_id, event_type, payload, attempt, status, next_retry_at, created_at, updated_at)
     VALUES (?, ?, 'evt_fixed', 'response.completed', '{"event":"response.completed"}', ?, 'pending', ?, ?, ?)`,
  )
    .bind(id, webhookId, attempt, now, now, now)
    .run();
  return id;
}

const row = (id: string) =>
  env.DB.prepare(`SELECT status, attempt, response_status, last_error, next_retry_at, delivered_at FROM webhook_deliveries WHERE id = ?`)
    .bind(id)
    .first<{ status: string; attempt: number; response_status: number | null; last_error: string | null; next_retry_at: number | null; delivered_at: number | null }>();

function respond(status: number, headers: Record<string, string> = {}) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response("nope", { status, headers }));
}

describe("event names", () => {
  it("matches a subscription written against either namespace", () => {
    expect(eventNames("response.completed")).toContain("submission.completed");
    expect(eventNames("response.completed")).toContain("response.completed");
    expect(eventNames("response.abandoned")).toContain("submission.abandoned");
  });

  it("leaves a name with no alias alone", () => {
    expect(eventNames("response.partial")).toEqual(["response.partial"]);
    expect(eventNames("something.unknown")).toEqual(["something.unknown"]);
  });
});

describe("fan-out", () => {
  it("writes one delivery per matching endpoint and queues each", async () => {
    const a = await hook(["response.completed"]);
    const b = await hook(["submission.completed"], null);
    const other = await hook(["response.partial"]);
    const { fake, sent } = queueEnv();

    const n = await fanOutEvent(fake, { event: "response.completed", organizationId: t.orgId, formId: t.formId }, "msg-1");
    expect(n).toBeGreaterThanOrEqual(2);
    const rows = await env.DB.prepare(`SELECT webhook_id, event_id, status, payload FROM webhook_deliveries WHERE webhook_id IN (?, ?, ?)`)
      .bind(a, b, other)
      .all<{ webhook_id: string; event_id: string; status: string; payload: string }>();
    expect(rows.results.map((r) => r.webhook_id).sort()).toEqual([a, b].sort());
    // One event, one id, one frozen body, across every endpoint.
    expect(new Set(rows.results.map((r) => r.event_id)).size).toBe(1);
    expect(new Set(rows.results.map((r) => r.payload)).size).toBe(1);
    expect(rows.results.every((r) => r.status === "pending")).toBe(true);
    expect(sent.every((s) => (s.body as { kind: string }).kind === "deliver")).toBe(true);
  });

  it("does not duplicate deliveries when the queue redelivers the event", async () => {
    const a = await hook(["response.abandoned"]);
    const { fake } = queueEnv();
    const evt = { event: "response.abandoned" as const, organizationId: t.orgId, formId: t.formId };
    await fanOutEvent(fake, evt, "msg-dup");
    await fanOutEvent(fake, evt, "msg-dup");
    const count = await env.DB.prepare(`SELECT COUNT(*) AS n FROM webhook_deliveries WHERE webhook_id = ?`).bind(a).first<{ n: number }>();
    expect(count?.n).toBe(1);
  });

  it("never delivers a test response", async () => {
    await hook(["response.disqualified"]);
    const { fake, sent } = queueEnv();
    expect(
      await fanOutEvent(fake, { event: "response.disqualified", organizationId: t.orgId, formId: t.formId, isTest: true }, "msg-test"),
    ).toBe(0);
    expect(sent).toHaveLength(0);
  });
});

describe("one delivery", () => {
  it("marks a 2xx delivered and logs the attempt with the stable event id", async () => {
    const h = await hook();
    const d = await pendingDelivery(h);
    const spy = respond(202);
    const { fake, sent } = queueEnv();
    await deliverOne(fake, d);

    expect(await row(d)).toMatchObject({ status: "success", attempt: 1, response_status: 202 });
    const headers = new Headers((spy.mock.calls[0]![1] as RequestInit).headers);
    expect(headers.get("webhook-id")).toBe("evt_fixed");
    expect(headers.get("x-chatform-delivery")).toBe(d);
    expect(headers.get("webhook-signature")).toMatch(/^v1,/);
    expect(sent).toHaveLength(0);
    const attempts = await env.DB.prepare(`SELECT attempt, response_status FROM webhook_attempts WHERE delivery_id = ?`).bind(d).all();
    expect(attempts.results).toEqual([{ attempt: 1, response_status: 202 }]);
  });

  it("schedules a retry on the queue after a 500, and keeps the attempt", async () => {
    const h = await hook();
    const d = await pendingDelivery(h);
    respond(500);
    const { fake, sent } = queueEnv();
    await deliverOne(fake, d);

    const r = await row(d);
    expect(r).toMatchObject({ status: "pending", attempt: 1, response_status: 500, last_error: "HTTP 500" });
    expect(r!.next_retry_at).toBeGreaterThan(Date.now());
    expect(sent).toHaveLength(1);
    // About a minute, with jitter.
    expect(sent[0]!.delaySeconds).toBeGreaterThanOrEqual(48);
    expect(sent[0]!.delaySeconds).toBeLessThanOrEqual(72);
  });

  it("honours Retry-After on a 429", async () => {
    const h = await hook();
    const d = await pendingDelivery(h);
    respond(429, { "retry-after": "600" });
    const { fake, sent } = queueEnv();
    await deliverOne(fake, d);
    expect(sent[0]!.delaySeconds).toBe(600);
  });

  it("gives up at once on a 410 and turns the endpoint off", async () => {
    const h = await hook();
    const d = await pendingDelivery(h);
    respond(410);
    const { fake, sent } = queueEnv();
    await deliverOne(fake, d);
    expect((await row(d))?.status).toBe("dead");
    expect(sent).toHaveLength(0);
    const w = await env.DB.prepare(`SELECT active FROM webhooks WHERE id = ?`).bind(h).first<{ active: number }>();
    expect(w?.active).toBe(0);
  });

  it("goes to the failed list after the last retry", async () => {
    const h = await hook();
    const d = await pendingDelivery(h, MAX_ATTEMPTS - 1);
    respond(503);
    const { fake, sent } = queueEnv();
    await deliverOne(fake, d);
    expect(await row(d)).toMatchObject({ status: "dead", attempt: MAX_ATTEMPTS, next_retry_at: null });
    expect(sent).toHaveLength(0);
  });

  it("ignores a duplicate message: the claim lets one through", async () => {
    const h = await hook();
    const d = await pendingDelivery(h);
    const spy = respond(200);
    const { fake } = queueEnv();
    await Promise.all([deliverOne(fake, d), deliverOne(fake, d)]);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("parks a delivery for an endpoint that was switched off", async () => {
    const h = await hook();
    const d = await pendingDelivery(h);
    await env.DB.prepare(`UPDATE webhooks SET active = 0 WHERE id = ?`).bind(h).run();
    const spy = respond(200);
    const { fake } = queueEnv();
    await deliverOne(fake, d);
    expect(spy).not.toHaveBeenCalled();
    expect(await row(d)).toMatchObject({ status: "dead", last_error: "Endpoint is turned off" });
  });
});

describe("recovery", () => {
  it("retries a failed delivery on the same row, and copies a delivered one", async () => {
    const h = await hook();
    const failed = await pendingDelivery(h);
    const delivered = await pendingDelivery(h);
    await env.DB.batch([
      env.DB.prepare(`UPDATE webhook_deliveries SET status = 'dead', attempt = 6 WHERE id = ?`).bind(failed),
      env.DB.prepare(`UPDATE webhook_deliveries SET status = 'success', attempt = 1 WHERE id = ?`).bind(delivered),
    ]);
    const { fake, sent } = queueEnv();

    expect(await redeliver(fake, t.orgId, h, failed)).toBe("queued");
    expect(await row(failed)).toMatchObject({ status: "pending", attempt: 0 });

    expect(await redeliver(fake, t.orgId, h, delivered)).toBe("queued");
    expect((await row(delivered))?.status).toBe("success");
    const copies = await env.DB.prepare(`SELECT event_id FROM webhook_deliveries WHERE webhook_id = ? AND status = 'pending'`)
      .bind(h)
      .all<{ event_id: string }>();
    expect(copies.results).toHaveLength(2);
    // Same event id, so a receiver that de-duplicates recognises it.
    expect(copies.results.every((c) => c.event_id === "evt_fixed")).toBe(true);
    expect(sent).toHaveLength(2);

    expect(await redeliver(fake, "org_someone_else", h, failed)).toBe("not_found");
  });

  it("retries every failed delivery of an endpoint", async () => {
    const h = await hook();
    const a = await pendingDelivery(h);
    const b = await pendingDelivery(h);
    await env.DB.prepare(`UPDATE webhook_deliveries SET status = 'dead' WHERE id IN (?, ?)`).bind(a, b).run();
    const { fake, sent } = queueEnv();
    expect(await retryAllFailed(fake, t.orgId, h)).toBe(2);
    expect(sent).toHaveLength(2);
    expect(await retryAllFailed(fake, "org_someone_else", h)).toBe(0);
  });

  it("marks a crashed message dead from the dead-letter queue", async () => {
    const h = await hook();
    const d = await pendingDelivery(h);
    await markDeadFromDlq(env as never, { kind: "deliver", deliveryId: d });
    expect(await row(d)).toMatchObject({ status: "dead", last_error: "Delivery kept crashing" });
  });

  it("the sweep re-queues a lost retry and an abandoned claim", async () => {
    const h = await hook();
    const lost = await pendingDelivery(h);
    const stuck = await pendingDelivery(h);
    const past = Date.now() - 10 * 60_000;
    await env.DB.batch([
      env.DB.prepare(`UPDATE webhook_deliveries SET next_retry_at = ? WHERE id = ?`).bind(past, lost),
      env.DB.prepare(`UPDATE webhook_deliveries SET status = 'sending', lease_until = ? WHERE id = ?`).bind(past, stuck),
    ]);
    const { fake, sent } = queueEnv();
    await sweepWebhookDeliveries(fake);
    const ids = sent.map((s) => (s.body as { deliveryId: string }).deliveryId);
    expect(ids).toContain(lost);
    expect(ids).toContain(stuck);
    expect((await row(stuck))?.status).toBe("pending");
  });
});

describe("backoff", () => {
  it("follows the schedule with jitter", () => {
    expect(retryDelayS(1, null, () => 0.5)).toBe(60);
    expect(retryDelayS(5, null, () => 0.5)).toBe(28_800);
    expect(retryDelayS(1, null, () => 0)).toBe(48);
    expect(retryDelayS(1, null, () => 1)).toBe(72);
  });

  it("reads Retry-After as seconds or a date, capped at a day", () => {
    expect(parseRetryAfter("30")).toBe(30);
    expect(parseRetryAfter("999999")).toBe(86_400);
    const now = Date.parse("2026-01-01T00:00:00Z");
    expect(parseRetryAfter("Thu, 01 Jan 2026 00:02:00 GMT", now)).toBe(120);
    expect(parseRetryAfter("soon")).toBeNull();
  });
});
