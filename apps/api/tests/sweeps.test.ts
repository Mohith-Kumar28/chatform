import { describe, it, expect, beforeAll } from "vitest";
import { env } from "cloudflare:test";
import { applySchema, seedTenant, type Tenant } from "./helpers.js";
import {
  sweepExpiredResponses,
  sweepExpiredSessions,
  sweepPartialNotifications,
  pruneTestData,
} from "../src/lib/sweeps.js";

/**
 * The cron's share of the work.
 *
 * A conversation is abandoned by its session object's idle alarm. A programmatic
 * response has no object watching it, so everything that alarm would have done
 * has to happen here instead — which is also why the boundary between the two
 * matters: two writers finishing one response means two webhooks for it.
 */

let t: Tenant;
const VERSION_ID = "ver_sweeps";

async function seedResponse(id: string, over: Partial<Record<string, unknown>> = {}) {
  const now = Date.now();
  const row = {
    status: "in_progress",
    source: "api",
    is_test: 0,
    started_at: now - 10_000,
    updated_at: now - 10_000,
    expires_at: null as number | null,
    partial_notified_at: null as number | null,
    ...over,
  };
  await env.DB.prepare(
    `INSERT INTO submissions (id, form_id, form_version_id, organization_id, status, source, is_test,
                              started_at, updated_at, expires_at, partial_notified_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id, t.formId, VERSION_ID, t.orgId, row.status, row.source, row.is_test,
      row.started_at, row.updated_at, row.expires_at, row.partial_notified_at,
    )
    .run();
}

beforeAll(async () => {
  await applySchema();
  t = await seedTenant("sweeps");
  const now = Date.now();
  await env.DB.prepare(
    `INSERT INTO form_versions (id, form_id, version, schema_json, checksum, published_at, created_by, created_at)
     VALUES (?1, ?2, 1, '{}', 'ck', ?3, ?4, ?3)`,
  )
    .bind(VERSION_ID, t.formId, now, t.userId)
    .run();
});

describe("expired responses", () => {
  it("abandons one past its deadline, and only once", async () => {
    await seedResponse("sbm_swexp", { expires_at: Date.now() - 1000 });

    expect(await sweepExpiredResponses(env as never)).toBeGreaterThan(0);
    const row = await env.DB.prepare(`SELECT status, meta FROM submissions WHERE id = 'sbm_swexp'`).first<{
      status: string;
      meta: string;
    }>();
    expect(row!.status).toBe("abandoned");
    expect(JSON.parse(row!.meta).abandonReason).toBe("expired");

    // A second pass must not enqueue a second webhook for the same response.
    const again = await sweepExpiredResponses(env as never);
    expect(again).toBe(0);
  });

  it("leaves a conversation alone — its own object owns that decision", async () => {
    await seedResponse("sbm_swchat", { source: "chat", expires_at: Date.now() - 1000 });
    await sweepExpiredResponses(env as never);
    const row = await env.DB.prepare(`SELECT status FROM submissions WHERE id = 'sbm_swchat'`).first<{
      status: string;
    }>();
    expect(row!.status).toBe("in_progress");
  });

  it("leaves a response with no deadline alone", async () => {
    await seedResponse("sbm_swnodl");
    await sweepExpiredResponses(env as never);
    const row = await env.DB.prepare(`SELECT status FROM submissions WHERE id = 'sbm_swnodl'`).first<{
      status: string;
    }>();
    expect(row!.status).toBe("in_progress");
  });
});

describe("partial notifications", () => {
  it("fires once for a settled partial, then not again", async () => {
    await seedResponse("sbm_swpart", { updated_at: Date.now() - 120_000 });

    expect(await sweepPartialNotifications(env as never)).toBeGreaterThan(0);
    const first = await env.DB.prepare(
      `SELECT partial_notified_at FROM submissions WHERE id = 'sbm_swpart'`,
    ).first<{ partial_notified_at: number }>();
    expect(first!.partial_notified_at).toBeGreaterThan(0);

    // Nothing changed since, so there is nothing new to say.
    const second = await sweepPartialNotifications(env as never);
    expect(second).toBe(0);
  });

  it("says nothing about a response still being written to", async () => {
    await seedResponse("sbm_swfresh", { updated_at: Date.now() });
    // A caller mid-append is not interesting yet — that is what "settled" means.
    await sweepPartialNotifications(env as never);
    const row = await env.DB.prepare(
      `SELECT partial_notified_at FROM submissions WHERE id = 'sbm_swfresh'`,
    ).first<{ partial_notified_at: number | null }>();
    expect(row!.partial_notified_at).toBeNull();
  });

  it("fires again after the response is answered into once more", async () => {
    // The real sequence, with the clock written out: notified ten minutes ago,
    // answered again five minutes ago, swept now. The answer is newer than the
    // notification and old enough to have settled, so there is something new to
    // say.
    await seedResponse("sbm_swagain", {
      partial_notified_at: Date.now() - 600_000,
      updated_at: Date.now() - 300_000,
    });
    expect(await sweepPartialNotifications(env as never)).toBeGreaterThan(0);
  });

  it("never notifies about test data", async () => {
    await seedResponse("sbm_swtest", { is_test: 1, updated_at: Date.now() - 120_000 });
    await sweepPartialNotifications(env as never);
    const row = await env.DB.prepare(
      `SELECT partial_notified_at FROM submissions WHERE id = 'sbm_swtest'`,
    ).first<{ partial_notified_at: number | null }>();
    expect(row!.partial_notified_at).toBeNull();
  });
});

describe("expired sessions", () => {
  it("marks a session whose token has outlived its deadline", async () => {
    await env.DB.prepare(
      `INSERT INTO chat_sessions (id, form_id, organization_id, respondent_token_hash, status, created_at, last_activity_at, expires_at)
       VALUES ('chs_swold', ?, ?, 'hash_swold', 'active', ?, ?, ?)`,
    )
      .bind(t.formId, t.orgId, Date.now() - 100_000, Date.now() - 100_000, Date.now() - 1000)
      .run();

    expect(await sweepExpiredSessions(env as never)).toBeGreaterThan(0);
    const row = await env.DB.prepare(`SELECT status FROM chat_sessions WHERE id = 'chs_swold'`).first<{
      status: string;
    }>();
    expect(row!.status).toBe("expired");
  });
});

describe("test data retention", () => {
  it("drops test rows past the retention window and keeps recent ones", async () => {
    const old = Date.now() - 40 * 24 * 60 * 60 * 1000;
    await seedResponse("sbm_swtestold", { is_test: 1, started_at: old, updated_at: old, status: "completed" });
    await seedResponse("sbm_swtestnew", { is_test: 1, status: "completed" });

    await pruneTestData(env as never);
    expect(await env.DB.prepare(`SELECT id FROM submissions WHERE id = 'sbm_swtestold'`).first()).toBeNull();
    expect(await env.DB.prepare(`SELECT id FROM submissions WHERE id = 'sbm_swtestnew'`).first()).toBeTruthy();
  });
});
