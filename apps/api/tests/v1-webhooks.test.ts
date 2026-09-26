import { describe, it, expect, beforeAll } from "vitest";
import { env } from "cloudflare:test";
import { applySchema, seedTenant, seedKey, fetchApi, type Tenant } from "./helpers.js";

/**
 * Webhook management with an API key.
 *
 * These operations only existed behind a session, so the webhook:* scopes named
 * an ability no key actually had and the SDK's webhook methods answered 401 on
 * every call.
 */

let t: Tenant;
let key: string;

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
    .bind(`sub_wh_${orgId}`, orgId, `dodo_wh_${orgId}`, Date.now() - 1000, Date.now() + 86_400_000 * 20, Date.now(), Date.now())
    .run();
  await invalidateEntitlements(env as never, orgId);
}

const api = (path: string, init: RequestInit = {}) =>
  fetchApi(path, {
    ...init,
    headers: { "x-api-key": key, "content-type": "application/json", ...(init.headers as Record<string, string>) },
  });

beforeAll(async () => {
  await applySchema();
  t = await seedTenant("v1wh");
  await subscribePro(t.orgId);
  key = (await seedKey(t, "v1whkey", {
    scopes: { form: ["read"], webhook: ["read", "write"], session: ["create"] },
  })).raw;
});

describe("managing endpoints", () => {
  it("creates one and returns the secret exactly once", async () => {
    const res = await api("/v1/webhooks", {
      method: "POST",
      body: JSON.stringify({ url: "https://acme.example/hook", events: ["response.completed"] }),
    });
    expect(res.status).toBe(201);
    const created = (await res.json()) as { id: string; secret: string; secretPreview: string };
    expect(created.secret.startsWith("whsec_")).toBe(true);

    const list = (await (await api("/v1/webhooks")).json()) as { data: { id: string; secret?: string }[] };
    const listed = list.data.find((w) => w.id === created.id);
    expect(listed).toBeTruthy();
    // Only a preview afterwards — the same treatment an API key gets.
    expect(listed).not.toHaveProperty("secret");
  });

  /**
   * This route used to take any URL `new URL()` accepted — no scheme check, no
   * address check — while its dashboard twin required https. Both land in the
   * same column and are dialled by the same delivery worker, so a URL the
   * dashboard refused could be created here and then fetched from inside the
   * worker.
   */
  it.each([
    ["a private address", "http://10.0.0.1/hook"],
    ["the cloud metadata endpoint", "http://169.254.169.254/latest/meta-data/"],
    ["credentials in the URL", "https://user:pw@acme.example/hook"],
    ["a scheme that is not http", "ftp://acme.example/hook"],
  ])("refuses %s", async (_label, url) => {
    const res = await api("/v1/webhooks", {
      method: "POST",
      body: JSON.stringify({ url, events: ["response.completed"] }),
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: { code: "bad_url" } });
  });

  it("still allows loopback outside production, which is how integrations get built", async () => {
    // `ENVIRONMENT` is "test" here. In production the same URL is refused —
    // see tests/webhook-url.test.ts, which pins both halves of that rule.
    const res = await api("/v1/webhooks", {
      method: "POST",
      body: JSON.stringify({ url: "http://localhost:8787/hook", events: ["response.completed"] }),
    });
    expect(res.status).toBe(201);
  });

  it("refuses an event name we do not send", async () => {
    const res = await api("/v1/webhooks", {
      method: "POST",
      body: JSON.stringify({ url: "https://acme.example/hook", events: ["response.exploded"] }),
    });
    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: { code: string; known: string[] } };
    // Storing it silently means an endpoint that never fires and a customer who
    // cannot tell why.
    expect(body.error.code).toBe("unknown_event");
    expect(body.error.known).toContain("response.completed");
  });

  it("still accepts the older event names", async () => {
    const res = await api("/v1/webhooks", {
      method: "POST",
      body: JSON.stringify({ url: "https://acme.example/legacy", events: ["submission.completed"] }),
    });
    expect(res.status).toBe(201);
  });

  it("deletes one, and says not found the second time", async () => {
    const created = (await (
      await api("/v1/webhooks", {
        method: "POST",
        body: JSON.stringify({ url: "https://acme.example/gone", events: ["response.completed"] }),
      })
    ).json()) as { id: string };

    expect((await api(`/v1/webhooks/${created.id}`, { method: "DELETE" })).status).toBe(200);
    expect((await api(`/v1/webhooks/${created.id}`, { method: "DELETE" })).status).toBe(404);
  });
});

describe("scopes and tenancy", () => {
  it("refuses a key without webhook:write", async () => {
    const readOnly = (await seedKey(t, "v1whread", { scopes: { webhook: ["read"] } })).raw;
    const res = await fetchApi("/v1/webhooks", {
      method: "POST",
      headers: { "x-api-key": readOnly, "content-type": "application/json" },
      body: JSON.stringify({ url: "https://acme.example/nope", events: ["response.completed"] }),
    });
    expect(res.status).toBe(403);
    expect(((await res.json()) as { error: { required: string } }).error.required).toBe("webhook:write");
  });

  it("does not show another organization's endpoints", async () => {
    const other = await seedTenant("v1whb");
    await subscribePro(other.orgId);
    const otherKey = (await seedKey(other, "v1whbkey", { scopes: { webhook: ["read"] } })).raw;
    const list = (await (
      await fetchApi("/v1/webhooks", { headers: { "x-api-key": otherKey } })
    ).json()) as { data: unknown[] };
    expect(list.data).toHaveLength(0);
  });
});

describe("deliveries", () => {
  it("lists attempts and replays one", async () => {
    const created = (await (
      await api("/v1/webhooks", {
        method: "POST",
        body: JSON.stringify({ url: "https://acme.example/replay", events: ["response.completed"] }),
      })
    ).json()) as { id: string };

    const message = { event: "response.completed", organizationId: t.orgId, formId: t.formId, submissionId: "sbm_x" };
    await env.DB.prepare(
      `INSERT INTO webhook_deliveries (id, webhook_id, event_type, payload, message_json, attempt, status, created_at)
       VALUES ('whd_v1', ?, 'response.completed', '{}', ?, 1, 'failed', ?)`,
    )
      .bind(created.id, JSON.stringify(message), Date.now())
      .run();

    const listed = (await (await api(`/v1/webhooks/${created.id}/deliveries`)).json()) as { data: unknown[] };
    expect(listed.data).toHaveLength(1);

    expect((await api(`/v1/webhooks/${created.id}/deliveries/whd_v1/replay`, { method: "POST" })).status).toBe(200);
  });

  it("replays a delivery from before the message was stored, from the payload it sent", async () => {
    const created = (await (
      await api("/v1/webhooks", {
        method: "POST",
        body: JSON.stringify({ url: "https://acme.example/old", events: ["response.completed"] }),
      })
    ).json()) as { id: string };
    await env.DB.prepare(
      `INSERT INTO webhook_deliveries (id, webhook_id, event_type, payload, attempt, status, created_at)
       VALUES ('whd_old', ?, 'response.completed', '{"event":"response.completed"}', 6, 'dead', ?)`,
    )
      .bind(created.id, Date.now())
      .run();

    // The payload is on the row; the event does not have to be reconstructed.
    expect((await api(`/v1/webhooks/${created.id}/deliveries/whd_old/replay`, { method: "POST" })).status).toBe(200);
    const row = await env.DB.prepare(`SELECT status, attempt, event_id FROM webhook_deliveries WHERE id = 'whd_old'`).first<{
      status: string;
      attempt: number;
      event_id: string;
    }>();
    expect(row?.status === "pending" || row?.status === "sending" || row?.status === "success" || row?.status === "dead").toBe(true);
    expect(row?.event_id).toBe("whd_old");
  });

  it("refuses to replay a test send", async () => {
    const created = (await (
      await api("/v1/webhooks", {
        method: "POST",
        body: JSON.stringify({ url: "https://acme.example/test-row", events: ["response.completed"] }),
      })
    ).json()) as { id: string };
    await env.DB.prepare(
      `INSERT INTO webhook_deliveries (id, webhook_id, event_type, payload, attempt, status, created_at)
       VALUES ('whd_testrow', ?, 'test', '{}', 1, 'dead', ?)`,
    )
      .bind(created.id, Date.now())
      .run();
    const res = await api(`/v1/webhooks/${created.id}/deliveries/whd_testrow/replay`, { method: "POST" });
    expect(res.status).toBe(422);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe("not_replayable");
  });

  it("reports queue status and turns an endpoint back on", async () => {
    const created = (await (
      await api("/v1/webhooks", {
        method: "POST",
        body: JSON.stringify({ url: "https://acme.example/stats", events: ["response.completed"] }),
      })
    ).json()) as { id: string };
    const now = Date.now();
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO webhook_deliveries (id, webhook_id, event_type, payload, attempt, status, delivered_at, created_at)
         VALUES ('whd_s1', ?1, 'response.completed', '{}', 1, 'success', ?2, ?2),
                ('whd_s2', ?1, 'response.completed', '{}', 6, 'dead', NULL, ?2),
                ('whd_s3', ?1, 'response.completed', '{}', 2, 'pending', NULL, ?2),
                ('whd_s4', ?1, 'test', '{}', 1, 'dead', NULL, ?2)`,
      ).bind(created.id, now),
      env.DB.prepare(`UPDATE webhooks SET active = 0, consecutive_failures = 20 WHERE id = ?`).bind(created.id),
    ]);

    const stats = (await (await api(`/v1/webhooks/stats`)).json()) as {
      endpoints: { webhookId: string; pending: number; failed: number; delivered24h: number }[];
    };
    // The test send is not part of the queue.
    expect(stats.endpoints.find((e) => e.webhookId === created.id)).toMatchObject({ pending: 1, failed: 1, delivered24h: 1 });

    const failed = (await (await api(`/v1/webhooks/${created.id}/deliveries?status=failed`)).json()) as { data: { id: string; status: string }[] };
    expect(failed.data.map((d) => d.id).sort()).toEqual(["whd_s2", "whd_s4"]);
    expect(failed.data.every((d) => d.status === "failed")).toBe(true);

    const on = await api(`/v1/webhooks/${created.id}`, { method: "PATCH", body: JSON.stringify({ active: true }) });
    expect(on.status).toBe(200);
    expect((await on.json()) as { active: boolean; consecutiveFailures: number }).toMatchObject({ active: true, consecutiveFailures: 0 });
  });
});
