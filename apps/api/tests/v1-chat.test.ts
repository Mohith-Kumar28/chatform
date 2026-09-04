import { describe, it, expect, beforeAll } from "vitest";
import { env } from "cloudflare:test";
import { applySchema, seedTenant, seedKey, fetchApi, type Tenant } from "./helpers.js";

/**
 * The conversation, driven headlessly.
 *
 * The old implementation slept 50ms and diffed the transcript to guess what had
 * happened; it also hardcoded the ending and skipped every gate `/p` enforces.
 * These tests pin the replacements: a turn returns the events it produced, the
 * real ending comes back, actions exist at all, and the gates apply.
 */

let t: Tenant;
let key: string;
const VERSION_ID = "ver_v1chat";

const DOC = {
  schemaVersion: 4,
  title: "Headless",
  blocks: [
    { id: "blk_hcemail1", ref: "q_email", type: "email", title: "Email?", required: true },
    { id: "blk_hcname01", ref: "q_name", type: "short_text", title: "Name?", required: false, minLength: 0, maxLength: 80 },
  ],
  endings: [{ id: "end_hc00001", ref: "end_thanks", title: "All done!", bodyMd: "Thanks for that." }],
  logic: [], endingRules: [], variables: [], hiddenFields: [], layout: {},
  // Template mode keeps every turn deterministic and model-free.
  settings: { agent: { mode: "template" }, onComplete: { requireSubmit: false } },
  theme: {},
};

async function subscribePro(orgId: string): Promise<void> {
  const { PLANS } = await import("@repo/entitlements");
  const { invalidateEntitlements } = await import("../src/lib/entitlements.js");
  await env.DB.prepare(
    `INSERT INTO plans (id, slug, name, price_monthly_cents, price_yearly_cents, currency, features_json, limits_json, is_active, sort_order)
     VALUES ('pro', 'pro', 'Pro', ?, ?, 'USD', ?, ?, 1, 1) ON CONFLICT (id) DO NOTHING`,
  )
    .bind(PLANS.pro.priceMonthlyCents, PLANS.pro.priceYearlyCents, JSON.stringify(PLANS.pro.features), JSON.stringify(PLANS.pro.limits))
    .run();
  await env.DB.prepare(
    `INSERT INTO subscriptions (id, organization_id, plan_id, dodo_subscription_id, cycle, status,
                                current_period_start, current_period_end, seats, created_at, updated_at)
     VALUES (?, ?, 'pro', ?, 'monthly', 'active', ?, ?, 1, ?, ?) ON CONFLICT (dodo_subscription_id) DO NOTHING`,
  )
    .bind(`sub_hc_${orgId}`, orgId, `dodo_hc_${orgId}`, Date.now() - 1000, Date.now() + 86_400_000 * 20, Date.now(), Date.now())
    .run();
  await invalidateEntitlements(env as never, orgId);
}

const api = (path: string, init: RequestInit = {}) =>
  fetchApi(path, {
    ...init,
    headers: { "x-api-key": key, "content-type": "application/json", ...(init.headers as Record<string, string>) },
  });

async function publish(doc: unknown, versionId: string, formId: string, userId: string) {
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO form_versions (id, form_id, version, schema_json, checksum, published_at, created_by, created_at)
       VALUES (?1, ?2, 1, ?3, 'ck', ?4, ?5, ?4) ON CONFLICT (id) DO NOTHING`,
    ).bind(versionId, formId, JSON.stringify(doc), now, userId),
    env.DB.prepare(
      `UPDATE forms SET status = 'published', working_schema = ?1, active_version_id = ?2 WHERE id = ?3`,
    ).bind(JSON.stringify(doc), versionId, formId),
  ]);
}

const openSession = () =>
  api(`/v1/forms/${t.formId}/sessions`, { method: "POST", body: "{}" });

beforeAll(async () => {
  await applySchema();
  t = await seedTenant("v1chat");
  await subscribePro(t.orgId);
  key = (await seedKey(t, "v1chatkey")).raw;
  await publish(DOC, VERSION_ID, t.formId, t.userId);
});

describe("opening a session", () => {
  it("returns a scoped respondent token and the first question", async () => {
    const res = await openSession();
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      sessionId: string;
      respondentToken: string;
      expiresAt: number;
      streamUrl: string;
      question: { ref: string } | null;
    };
    expect(body.sessionId).toMatch(/^chs_/);
    // The token, not the key, is what a browser gets — one session, and it dies.
    expect(body.respondentToken).toBeTruthy();
    expect(body.expiresAt).toBeGreaterThan(Date.now());
    expect(body.question?.ref).toBe("q_email");

    const row = await env.DB.prepare(`SELECT expires_at, source FROM chat_sessions WHERE id = ?`)
      .bind(body.sessionId)
      .first<{ expires_at: number; source: string }>();
    // chat_sessions.expires_at has existed since the first migration and nothing
    // ever wrote it, so a respondent token never expired.
    expect(row!.expires_at).toBeGreaterThan(Date.now());
    expect(row!.source).toBe("api");
  });

  it("still answers at the original path", async () => {
    // Integrations were written against this shape before the rename.
    const res = await api(`/v1/forms/${t.formId}/chat/sessions`, { method: "POST", body: "{}" });
    expect(res.status).toBe(200);
  });
});

describe("turns", () => {
  it("returns the turn's own events, with no sleeping and no transcript diffing", async () => {
    const { sessionId } = (await (await openSession()).json()) as { sessionId: string };

    const res = await api(`/v1/sessions/${sessionId}/messages`, {
      method: "POST",
      body: JSON.stringify({ type: "structured", ref: "q_email", value: "maya@northwind.co" }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      accepted: boolean;
      question: { ref: string } | null;
      events: { type: string }[];
      answers: Record<string, unknown>;
      assistantMessages: string[];
    };

    expect(body.accepted).toBe(true);
    // The events the stream would have carried, delivered over the same request.
    expect(body.events.map((e) => e.type)).toContain("answer_recorded");
    expect(body.events.map((e) => e.type)).toContain("question");
    expect(body.question?.ref).toBe("q_name");
    expect(body.answers.q_email).toBe("maya@northwind.co");
    // Rebuilt from the token deltas, so a caller with no stream sees the same
    // prose a streaming client saw.
    expect(body.assistantMessages.length).toBeGreaterThan(0);
  });

  it("reports a rejected answer rather than pretending it landed", async () => {
    const { sessionId } = (await (await openSession()).json()) as { sessionId: string };
    const res = await api(`/v1/sessions/${sessionId}/messages`, {
      method: "POST",
      body: JSON.stringify({ type: "structured", ref: "q_email", value: "not-an-email" }),
    });
    const body = (await res.json()) as { validation: { ref: string; code: string } | null; question: { ref: string } };
    expect(body.validation?.ref).toBe("q_email");
    expect(body.validation?.code).toBe("invalid_email");
    // Still on the same question.
    expect(body.question.ref).toBe("q_email");
  });

  it("completes with the real ending, not a placeholder", async () => {
    const { sessionId } = (await (await openSession()).json()) as { sessionId: string };
    await api(`/v1/sessions/${sessionId}/messages`, {
      method: "POST",
      body: JSON.stringify({ type: "structured", ref: "q_email", value: "done@x.co" }),
    });
    const res = await api(`/v1/sessions/${sessionId}/messages`, {
      method: "POST",
      body: JSON.stringify({ type: "structured", ref: "q_name", value: "Maya" }),
    });
    const body = (await res.json()) as { complete: boolean; ending: { title: string; bodyMd?: string } | null };
    expect(body.complete).toBe(true);
    // The old implementation hardcoded {title:"Complete"}, so a headless caller
    // could never render the real ending, its CTA or its redirect.
    expect(body.ending?.title).toBe("All done!");
  });
});

describe("actions", () => {
  it("can skip a question", async () => {
    const { sessionId } = (await (await openSession()).json()) as { sessionId: string };
    await api(`/v1/sessions/${sessionId}/messages`, {
      method: "POST",
      body: JSON.stringify({ type: "structured", ref: "q_email", value: "skip@x.co" }),
    });
    const res = await api(`/v1/sessions/${sessionId}/actions`, {
      method: "POST",
      body: JSON.stringify({ action: "skip" }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { complete: boolean };
    expect(body.complete).toBe(true);
  });

  it("can submit a form that parks on a review step", async () => {
    // requireSubmit defaults to true. Without an actions endpoint such a form
    // could never be completed over the API at all.
    const other = await seedTenant("v1chatsub");
    await subscribePro(other.orgId);
    const otherKey = (await seedKey(other, "v1chatsubkey")).raw;
    await publish(
      { ...DOC, settings: { agent: { mode: "template" }, onComplete: { requireSubmit: true } } },
      "ver_v1chatsub",
      other.formId,
      other.userId,
    );

    const opened = await fetchApi(`/v1/forms/${other.formId}/sessions`, {
      method: "POST",
      headers: { "x-api-key": otherKey, "content-type": "application/json" },
      body: "{}",
    });
    const { sessionId } = (await opened.json()) as { sessionId: string };

    for (const [ref, value] of [["q_email", "review@x.co"], ["q_name", "Rev"]] as const) {
      await fetchApi(`/v1/sessions/${sessionId}/messages`, {
        method: "POST",
        headers: { "x-api-key": otherKey, "content-type": "application/json" },
        body: JSON.stringify({ type: "structured", ref, value }),
      });
    }

    const parked = await fetchApi(`/v1/sessions/${sessionId}`, { headers: { "x-api-key": otherKey } });
    expect(((await parked.json()) as { awaitingSubmit: boolean }).awaitingSubmit).toBe(true);

    const submitted = await fetchApi(`/v1/sessions/${sessionId}/actions`, {
      method: "POST",
      headers: { "x-api-key": otherKey, "content-type": "application/json" },
      body: JSON.stringify({ action: "submit" }),
    });
    expect(((await submitted.json()) as { complete: boolean }).complete).toBe(true);
  });
});

describe("events", () => {
  it("pulls durable events from a sequence number", async () => {
    const { sessionId } = (await (await openSession()).json()) as { sessionId: string };
    await api(`/v1/sessions/${sessionId}/messages`, {
      method: "POST",
      body: JSON.stringify({ type: "structured", ref: "q_email", value: "evt@x.co" }),
    });

    const res = await api(`/v1/sessions/${sessionId}/events?since=0`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { events: { seq: number; type: string }[]; latest_seq: number };
    expect(body.events.length).toBeGreaterThan(0);
    expect(body.events[0]!.seq).toBe(1);
    expect(body.latest_seq).toBeGreaterThanOrEqual(body.events.length);
  });

  it("refuses a nonsense sequence number", async () => {
    const { sessionId } = (await (await openSession()).json()) as { sessionId: string };
    expect((await api(`/v1/sessions/${sessionId}/events?since=banana`)).status).toBe(400);
  });
});

describe("token rotation", () => {
  it("issues a new token and kills the old one", async () => {
    const opened = (await (await openSession()).json()) as { sessionId: string; respondentToken: string };

    const rotated = await api(`/v1/sessions/${opened.sessionId}/token/rotate`, { method: "POST" });
    const { respondentToken } = (await rotated.json()) as { respondentToken: string };
    expect(respondentToken).not.toBe(opened.respondentToken);

    // The old token is a respondent credential, so it is checked on /p.
    const stale = await fetchApi(`/p/sessions/${opened.sessionId}`, {
      headers: { "x-respondent-token": opened.respondentToken },
    });
    expect(stale.status).toBe(401);
    const fresh = await fetchApi(`/p/sessions/${opened.sessionId}`, {
      headers: { "x-respondent-token": respondentToken },
    });
    expect(fresh.status).toBe(200);
  });
});

describe("gates", () => {
  it("refuses a session on a closed form, as /p does", async () => {
    const closed = await seedTenant("v1chatclosed");
    await subscribePro(closed.orgId);
    const closedKey = (await seedKey(closed, "v1chatclosedkey")).raw;
    await publish(
      {
        ...DOC,
        settings: {
          agent: { mode: "template" },
          closeRules: { closeAt: new Date(Date.now() - 86_400_000).toISOString() },
        },
      },
      "ver_v1chatclosed",
      closed.formId,
      closed.userId,
    );

    const res = await fetchApi(`/v1/forms/${closed.formId}/sessions`, {
      method: "POST",
      headers: { "x-api-key": closedKey, "content-type": "application/json" },
      body: "{}",
    });
    // The headless path used to skip every one of these.
    expect(res.status).toBe(403);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe("form_closed");
  });

  it("meters a response, so headless traffic counts against the plan", async () => {
    const before = await env.DB.prepare(
      `SELECT used FROM usage_counters WHERE organization_id = ? AND metric = 'responses'`,
    )
      .bind(t.orgId)
      .first<{ used: number }>();
    await openSession();
    const after = await env.DB.prepare(
      `SELECT used FROM usage_counters WHERE organization_id = ? AND metric = 'responses'`,
    )
      .bind(t.orgId)
      .first<{ used: number }>();
    expect(after!.used).toBeGreaterThan(before?.used ?? 0);
  });

  it("does not meter a test-mode session", async () => {
    const testKey = (await seedKey(t, "v1chattest", { type: "sk_test" })).raw;
    const before = await env.DB.prepare(
      `SELECT used FROM usage_counters WHERE organization_id = ? AND metric = 'responses'`,
    )
      .bind(t.orgId)
      .first<{ used: number }>();

    const res = await fetchApi(`/v1/forms/${t.formId}/sessions`, {
      method: "POST",
      headers: { "x-api-key": testKey, "content-type": "application/json" },
      body: "{}",
    });
    expect(res.status).toBe(200);
    const { sessionId } = (await res.json()) as { sessionId: string };

    const after = await env.DB.prepare(
      `SELECT used FROM usage_counters WHERE organization_id = ? AND metric = 'responses'`,
    )
      .bind(t.orgId)
      .first<{ used: number }>();
    // Rehearsing an integration must not spend the customer's month.
    expect(after!.used).toBe(before?.used ?? 0);

    const row = await env.DB.prepare(`SELECT is_test FROM chat_sessions WHERE id = ?`)
      .bind(sessionId)
      .first<{ is_test: number }>();
    expect(row!.is_test).toBe(1);
  });
});
