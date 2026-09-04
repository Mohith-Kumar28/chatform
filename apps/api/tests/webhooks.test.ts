import { describe, it, expect, beforeAll } from "vitest";
import { env } from "cloudflare:test";
import { applySchema, seedTenant, type Tenant } from "./helpers.js";
import { eventNames, retryFailedDeliveries } from "../src/lib/webhooks.js";

/**
 * Delivery, and the two bugs that made retries actively wrong.
 *
 * The sweep rebuilt a message from the delivery row and got it wrong twice: it
 * hardcoded `submission.completed` and dropped the submission id, so a retried
 * abandonment arrived as a completion with no payload. And every row was
 * inserted with attempt = 1 while the retry schedule was chosen by counting rows
 * whose payload string matched exactly.
 */

let t: Tenant;

beforeAll(async () => {
  await applySchema();
  t = await seedTenant("whooks");
});

describe("event names", () => {
  it("matches a subscription written against either namespace", () => {
    // An integration subscribed to submission.completed predates the rename and
    // has to keep firing.
    expect(eventNames("response.completed")).toContain("submission.completed");
    expect(eventNames("response.completed")).toContain("response.completed");
    expect(eventNames("response.abandoned")).toContain("submission.abandoned");
  });

  it("leaves a name with no alias alone", () => {
    expect(eventNames("response.partial")).toEqual(["response.partial"]);
    expect(eventNames("something.unknown")).toEqual(["something.unknown"]);
  });
});

describe("the retry sweep", () => {
  it("re-enqueues the original event, not a guess at it", async () => {
    const now = Date.now();
    await env.DB.prepare(
      `INSERT INTO webhooks (id, organization_id, form_id, url, secret, events, active, created_at)
       VALUES ('wh_retry', ?, ?, 'https://example.test/hook', 'whsec_x', ?, 1, ?)`,
    )
      .bind(t.orgId, t.formId, JSON.stringify(["response.abandoned"]), now)
      .run();

    const original = {
      event: "response.abandoned",
      organizationId: t.orgId,
      formId: t.formId,
      submissionId: "sbm_retry",
      attempt: 1,
    };
    await env.DB.prepare(
      `INSERT INTO webhook_deliveries (id, webhook_id, event_type, payload, message_json, attempt, status, next_retry_at, created_at)
       VALUES ('whd_retry', 'wh_retry', 'response.abandoned', '{}', ?, 1, 'failed', ?, ?)`,
    )
      .bind(JSON.stringify(original), now - 1000, now)
      .run();

    const sent: unknown[] = [];
    const fakeEnv = {
      ...env,
      Q_WEBHOOKS: { send: async (m: unknown) => void sent.push(m) },
    } as unknown as Parameters<typeof retryFailedDeliveries>[0];

    expect(await retryFailedDeliveries(fakeEnv)).toBe(1);
    const message = sent[0] as { event: string; submissionId: string; attempt: number };
    // Both of these were wrong before: the event was rewritten to a completion,
    // and the submission id was dropped entirely.
    expect(message.event).toBe("response.abandoned");
    expect(message.submissionId).toBe("sbm_retry");
    expect(message.attempt).toBe(1);
  });

  it("drops a delivery from before the message was stored rather than inventing one", async () => {
    const now = Date.now();
    await env.DB.prepare(
      `INSERT INTO webhooks (id, organization_id, form_id, url, secret, events, active, created_at)
       VALUES ('wh_legacy', ?, ?, 'https://example.test/hook', 'whsec_y', ?, 1, ?)`,
    )
      .bind(t.orgId, t.formId, JSON.stringify(["response.completed"]), now)
      .run();
    await env.DB.prepare(
      `INSERT INTO webhook_deliveries (id, webhook_id, event_type, payload, attempt, status, next_retry_at, created_at)
       VALUES ('whd_legacy', 'wh_legacy', 'response.completed', '{}', 1, 'failed', ?, ?)`,
    )
      .bind(now - 1000, now)
      .run();

    const sent: unknown[] = [];
    const fakeEnv = {
      ...env,
      Q_WEBHOOKS: { send: async (m: unknown) => void sent.push(m) },
    } as unknown as Parameters<typeof retryFailedDeliveries>[0];

    // Its event cannot be reconstructed honestly, so redelivering it as
    // something it might have been is worse than not redelivering it.
    expect(await retryFailedDeliveries(fakeEnv)).toBe(0);
    expect(sent).toHaveLength(0);
    expect(await env.DB.prepare(`SELECT id FROM webhook_deliveries WHERE id = 'whd_legacy'`).first()).toBeNull();
  });
});
