import { describe, it, expect, beforeAll } from "vitest";
import { env } from "cloudflare:test";
import { applySchema, seedTenant, type Tenant } from "./helpers.js";
import { finalizeResponse, type ResponseOwner } from "../src/lib/submissions.js";

/**
 * How long a response took, on the path where nobody was there to see it end.
 *
 * A conversation is not declared abandoned until its Durable Object has been
 * idle for thirty minutes. The clock for `duration_ms` used to stop when that
 * alarm fired rather than when the respondent did, so every partial abandoned
 * at the first question reported "took 30m 1s" — the timeout plus the alarm's
 * own latency, presented as effort. Identical on every row, which is what gave
 * it away in the responses drawer.
 *
 * `active_ms` accumulates across sittings and `duration_ms` is read from it, so
 * this was not only cosmetic: a respondent who came back and finished carried
 * each earlier sitting's phantom half hour into the completion-time analytics
 * a customer pays to read.
 */

const MINUTE = 60_000;

let t: Tenant;

const owner = (): ResponseOwner => ({
  env: env as never,
  formId: t.formId,
  formVersionId: "ver_abd",
  organizationId: t.orgId,
  sessionId: null,
  source: "chat",
});

/** A row that started `startedAt` and last heard from them at `lastActivityAt`. */
async function seed(id: string, startedAt: number, lastActivityAt: number): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO submissions (id, form_id, form_version_id, organization_id, status, source, is_test, started_at, updated_at)
     VALUES (?, ?, 'ver_abd', ?, 'in_progress', 'chat', 0, ?, ?)`,
  )
    .bind(id, t.formId, t.orgId, startedAt, lastActivityAt)
    .run();
}

const durationOf = async (id: string): Promise<number | null> =>
  (
    await env.DB.prepare(`SELECT duration_ms FROM submissions WHERE id = ?`)
      .bind(id)
      .first<{ duration_ms: number | null }>()
  )?.duration_ms ?? null;

beforeAll(async () => {
  await applySchema();
  t = await seedTenant("abandondur");
  // A version to hang the rows off: `submissions.form_version_id` is a foreign
  // key, and nothing here goes near the document itself.
  await env.DB.prepare(
    `INSERT OR REPLACE INTO form_versions (id, form_id, version, schema_json, checksum, published_at, created_at)
     VALUES ('ver_abd', ?, 1, '{}', 'ck', ?, ?)`,
  )
    .bind(t.formId, Date.now(), Date.now())
    .run();
});

describe("an abandoned response", () => {
  it("is measured to their last message, not to the alarm that noticed", async () => {
    const now = Date.now();
    // Opened, verified, said nothing, and the idle alarm fired half an hour on.
    await seed("sbm_abd01", now - 31 * MINUTE, now - 30 * MINUTE);

    const { durationMs } = await finalizeResponse(owner(), {
      responseId: "sbm_abd01",
      status: "abandoned",
      endingRef: null,
      abandonReason: "idle_timeout",
      answers: {},
      startedAt: now - 31 * MINUTE,
      collectedCount: 0,
      country: null,
    });

    // A minute of them, not thirty-one of them and the timer.
    expect(durationMs).toBeGreaterThan(0);
    expect(durationMs).toBeLessThan(2 * MINUTE);
    expect(await durationOf("sbm_abd01")).toBe(durationMs);
  });

  it("reports nothing rather than the timeout when they never got started", async () => {
    const now = Date.now();
    // Opened and closed the tab: started and last activity are the same moment.
    await seed("sbm_abd02", now - 30 * MINUTE, now - 30 * MINUTE);

    const { durationMs } = await finalizeResponse(owner(), {
      responseId: "sbm_abd02",
      status: "abandoned",
      endingRef: null,
      abandonReason: "idle_timeout",
      answers: {},
      startedAt: now - 30 * MINUTE,
      collectedCount: 0,
      country: null,
    });

    expect(durationMs).toBe(0);
  });
});

describe("a completed response", () => {
  it("is still measured to the moment it completed", async () => {
    const now = Date.now();
    // No gap between stopping and being noticed on this path, so `updated_at`
    // is irrelevant here and the clock runs to the completion itself.
    await seed("sbm_abd03", now - 5 * MINUTE, now - 5 * MINUTE);

    const { durationMs } = await finalizeResponse(owner(), {
      responseId: "sbm_abd03",
      status: "completed",
      endingRef: "end_thanks",
      answers: { q_one: "alpha" },
      startedAt: now - 5 * MINUTE,
      collectedCount: 1,
      country: null,
    });

    expect(durationMs).toBeGreaterThanOrEqual(5 * MINUTE);
    expect(durationMs).toBeLessThan(6 * MINUTE);
  });
});
