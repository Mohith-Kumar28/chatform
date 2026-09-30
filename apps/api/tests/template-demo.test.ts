import { env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { applySchema, fetchApi, minimalDoc, seedTenant } from "./helpers.js";
import quotaSource from "../src/lib/template-demo-quota.ts?raw";
import routeSource from "../src/routes/template-demo.ts?raw";
import { ANON_DAILY_LIMIT, USER_DAILY_LIMIT, pruneTemplateDemos } from "../src/lib/template-demo-quota.js";

const SLUG = "demo-test-template";

const start = (body: unknown, headers: Record<string, string> = {}) =>
  fetchApi(`/api/templates/${SLUG}/demo-sessions`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });

async function seedTemplate(): Promise<void> {
  await env.DB.prepare(
    `INSERT OR IGNORE INTO form_templates (id, slug, title, category, description, tags, schema_json, official, usage_count, created_at)
     VALUES ('tpl_demotest', ?, 'Demo test', 'Form', 'A template for the try-it tests', '[]', ?, 1, 0, ?)`,
  )
    .bind(SLUG, JSON.stringify(minimalDoc("demo test")), Date.now())
    .run();
}

describe("POST /api/templates/:slug/demo-sessions", () => {
  beforeAll(async () => {
    await applySchema();
    await seedTemplate();
  });

  it("gives a signed-out device ten tries a day, then refuses with the daily-limit code", async () => {
    const deviceSignal = `device-${crypto.randomUUID()}`;
    for (let i = 1; i <= ANON_DAILY_LIMIT; i++) {
      const res = await start({ deviceSignal });
      expect(res.status, `try ${i}`).toBe(200);
      const body = (await res.json()) as { sessionId: string; remaining: number; limit: number };
      expect(body.remaining).toBe(ANON_DAILY_LIMIT - i);
      expect(body.limit).toBe(ANON_DAILY_LIMIT);
    }
    const over = await start({ deviceSignal });
    expect(over.status).toBe(429);
    const err = (await over.json()) as { error: { code: string; signedIn: boolean } };
    expect(err.error.code).toBe("demo_daily_limit");
    expect(err.error.signedIn).toBe(false);

    // Clicking again after the limit does not push the stored count past it.
    await start({ deviceSignal });
    const row = await env.DB.prepare(`SELECT MAX(count) AS c FROM template_demo_quota`).first<{ c: number }>();
    expect(row!.c).toBeLessThanOrEqual(USER_DAILY_LIMIT);
  });

  it("counts each device on its own, whatever address they share", async () => {
    const sharedIp = { "cf-connecting-ip": "203.0.113.7" };
    const a = `device-${crypto.randomUUID()}`;
    for (let i = 0; i < ANON_DAILY_LIMIT; i++) expect((await start({ deviceSignal: a }, sharedIp)).status).toBe(200);
    expect((await start({ deviceSignal: a }, sharedIp)).status).toBe(429);
    // A second person behind the same campus or carrier address is unaffected.
    expect((await start({ deviceSignal: `device-${crypto.randomUUID()}` }, sharedIp)).status).toBe(200);
  });

  it("refuses a signed-out browser that sent no device id, instead of counting it by address", async () => {
    const res = await start({});
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe("device_required");
  });

  it("gives a signed-in user twenty a day, whatever device they use", async () => {
    const tenant = await seedTenant(`demo_${crypto.randomUUID().slice(0, 8)}`);
    for (let i = 1; i <= USER_DAILY_LIMIT; i++) {
      const res = await start({ deviceSignal: `device-${crypto.randomUUID()}` }, { cookie: tenant.cookie });
      expect(res.status, `try ${i}`).toBe(200);
    }
    const over = await start({}, { cookie: tenant.cookie });
    expect(over.status).toBe(429);
    expect(((await over.json()) as { error: { signedIn: boolean } }).error.signedIn).toBe(true);
  });

  it("runs as a preview: the session lives in the demo org and writes no submission", async () => {
    const res = await start({ deviceSignal: `device-${crypto.randomUUID()}` });
    const { sessionId } = (await res.json()) as { sessionId: string };
    const row = await env.DB.prepare(`SELECT form_id, organization_id FROM chat_sessions WHERE id = ?`)
      .bind(sessionId)
      .first<{ form_id: string; organization_id: string }>();
    expect(row).toEqual({ form_id: "frm_template_demo", organization_id: "org_template_demos" });
    const subs = await env.DB.prepare(`SELECT COUNT(*) AS n FROM submissions WHERE form_id = 'frm_template_demo'`).first<{ n: number }>();
    expect(subs!.n).toBe(0);
  });

  it("404s a slug that is not an official template", async () => {
    const res = await fetchApi(`/api/templates/nope-${crypto.randomUUID().slice(0, 6)}/demo-sessions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ deviceSignal: `device-${crypto.randomUUID()}` }),
    });
    expect(res.status).toBe(404);
  });

  it("prunes spent day counters and old demo sessions", async () => {
    await env.DB.prepare(`INSERT INTO template_demo_quota (key_hash, day, count) VALUES ('old', '2000-01-01', 3)`).run();
    await pruneTemplateDemos(env as never);
    const left = await env.DB.prepare(`SELECT COUNT(*) AS n FROM template_demo_quota WHERE day = '2000-01-01'`).first<{ n: number }>();
    expect(left!.n).toBe(0);
  });
});

describe("template demo quota source", () => {
  it("never reads an IP address", () => {
    for (const [file, source] of Object.entries({ quotaSource, routeSource })) {
      expect(source, file).not.toMatch(/cf-connecting-ip|x-forwarded-for|ipHash\s*:(?!\s*null)/i);
    }
  });
});
