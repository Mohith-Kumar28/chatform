import { describe, it, expect, beforeAll } from "vitest";
import { env } from "cloudflare:test";
import { applySchema, seedTenant, type Tenant } from "./helpers.js";
import { emitWebhookEvent, fanOutEvent, type WebhookEvent } from "../src/lib/webhooks.js";
import { recordAnswerRow } from "../src/lib/submissions.js";

/**
 * `response.answer_recorded`, `session.started` and `form.published` were
 * accepted in a subscription and never sent: nothing put them on the queue. They
 * are sent now, and only queued when an endpoint actually wants them, because
 * an answer happens far too often to cost a queue message for nobody.
 */

let t: Tenant;

beforeAll(async () => {
  await applySchema();
  t = await seedTenant("whevents");
});

/** The env with a queue that records instead of sending. */
function queueEnv() {
  const sent: WebhookEvent[] = [];
  const fake = {
    ...env,
    Q_WEBHOOKS: {
      send: async (body: WebhookEvent) => void sent.push(body),
      sendBatch: async () => {},
    },
  } as unknown as typeof env;
  return { fake, sent };
}

let seq = 0;
async function subscribe(events: string[], formId: string | null = t.formId): Promise<string> {
  const id = `wh_ev${++seq}`;
  await env.DB.prepare(
    `INSERT INTO webhooks (id, organization_id, form_id, url, secret, events, active, created_at)
     VALUES (?, ?, ?, ?, 'whsec_dGVzdHNlY3JldHRlc3RzZWNyZXQ=', ?, 1, ?)`,
  )
    .bind(id, t.orgId, formId, `https://hooks.acme.example/${id}`, JSON.stringify(events), Date.now())
    .run();
  return id;
}

async function unsubscribeAll(): Promise<void> {
  await env.DB.prepare(`DELETE FROM webhooks WHERE organization_id = ?`).bind(t.orgId).run();
}

describe("emitWebhookEvent", () => {
  it("queues nothing when no endpoint subscribes to the event", async () => {
    await unsubscribeAll();
    await subscribe(["response.completed"]);
    const { fake, sent } = queueEnv();
    await emitWebhookEvent(fake, { event: "session.started", organizationId: t.orgId, formId: t.formId });
    expect(sent).toHaveLength(0);
  });

  it("queues the event when a form or org-wide endpoint subscribes", async () => {
    await unsubscribeAll();
    await subscribe(["session.started"], null);
    const { fake, sent } = queueEnv();
    await emitWebhookEvent(fake, {
      event: "session.started",
      organizationId: t.orgId,
      formId: t.formId,
      data: { sessionId: "chs_1", source: "chat" },
    });
    expect(sent.map((e) => e.event)).toEqual(["session.started"]);
  });

  it("never queues a test event", async () => {
    await unsubscribeAll();
    await subscribe(["form.published"]);
    const { fake, sent } = queueEnv();
    await emitWebhookEvent(fake, { event: "form.published", organizationId: t.orgId, formId: t.formId, isTest: true });
    expect(sent).toHaveLength(0);
  });

  it("does not match a name that merely contains the event name", async () => {
    await unsubscribeAll();
    await subscribe(["response.answer_recorded_v2"]);
    const { fake, sent } = queueEnv();
    await emitWebhookEvent(fake, { event: "response.answer_recorded", organizationId: t.orgId, formId: t.formId });
    expect(sent).toHaveLength(0);
  });
});

describe("the events themselves", () => {
  it("records an answer and queues response.answer_recorded naming the question", async () => {
    await unsubscribeAll();
    await subscribe(["response.answer_recorded"]);
    const responseId = "sbm_evans1";
    await env.DB.prepare(
      `INSERT INTO submissions (id, form_id, form_version_id, organization_id, status, source, is_test, started_at, updated_at)
       VALUES (?, ?, NULL, ?, 'in_progress', 'api', 0, ?, ?)`,
    )
      .bind(responseId, t.formId, t.orgId, Date.now(), Date.now())
      .run();
    const { fake, sent } = queueEnv();
    await recordAnswerRow(
      { env: fake, formId: t.formId, formVersionId: "ver_ev", organizationId: t.orgId, sessionId: null, source: "api" },
      { responseId, block: { ref: "q_email", type: "email" }, value: "maya@northwind.co" },
    );
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({
      event: "response.answer_recorded",
      submissionId: responseId,
      data: { ref: "q_email" },
    });
  });

  it("delivers `data` in the payload", async () => {
    await unsubscribeAll();
    await subscribe(["form.published"]);
    const { fake } = queueEnv();
    const n = await fanOutEvent(fake as never, {
      event: "form.published",
      organizationId: t.orgId,
      formId: t.formId,
      data: { version: 4, versionId: "ver_x", note: null },
    });
    expect(n).toBe(1);
    const row = await env.DB.prepare(
      `SELECT payload FROM webhook_deliveries WHERE event_type = 'form.published' ORDER BY created_at DESC LIMIT 1`,
    ).first<{ payload: string }>();
    expect(JSON.parse(row!.payload)).toMatchObject({ event: "form.published", data: { version: 4, versionId: "ver_x" } });
  });
});
