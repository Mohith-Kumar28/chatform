import { describe, it, beforeAll, expect } from "vitest";
import { env } from "cloudflare:test";
import { applySchema, seedTenant, fetchApi, type Tenant } from "./helpers.js";
import { canonicalZone } from "../src/lib/quiet-hours.js";

/**
 * Recording which clock the respondent is on.
 *
 * One field, on the one request that opens a session, for one purpose: holding
 * a follow-up reminder out of their night. The shape of every assertion here is
 * that a zone we cannot read is never worth failing a request over — the person
 * on the other end cannot fix their browser, and a form that refuses to open
 * over a time zone would be an absurd thing to ship.
 */

let t: Tenant;
const VERSION_ID = "ver_tz";
const SLUG = "tzform-form";

const DOC = {
  schemaVersion: 4,
  title: "Time zones",
  blocks: [{ id: "blk_tz000001", ref: "q_email", type: "email", title: "Email?", required: true }],
  endings: [{ id: "end_tz000001", ref: "end_thanks", title: "Thanks" }],
  logic: [],
  endingRules: [],
  variables: [],
  hiddenFields: [],
  layout: {},
  settings: { agent: { mode: "template" } },
  theme: {},
};

beforeAll(async () => {
  await applySchema();
  t = await seedTenant("tzform");
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO form_versions (id, form_id, version, schema_json, checksum, published_at, created_by, created_at)
       VALUES (?1, ?2, 1, ?3, 'ck', ?4, ?5, ?4)`,
    ).bind(VERSION_ID, t.formId, JSON.stringify(DOC), now, t.userId),
    env.DB.prepare(
      `UPDATE forms SET status = 'published', working_schema = ?1, active_version_id = ?2 WHERE id = ?3`,
    ).bind(JSON.stringify(DOC), VERSION_ID, t.formId),
  ]);
});

async function open(body: Record<string, unknown>): Promise<Response> {
  return fetchApi(`/p/forms/${SLUG}/sessions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function zoneOf(sessionId: string): Promise<string | null> {
  const row = await env.DB.prepare(`SELECT timezone FROM chat_sessions WHERE id = ?`)
    .bind(sessionId)
    .first<{ timezone: string | null }>();
  return row?.timezone ?? null;
}

describe("the respondent's time zone", () => {
  it("records what the browser reported, canonicalised", async () => {
    const res = await open({ timezone: "Asia/Calcutta" });
    expect(res.status).toBe(200);
    const { sessionId } = await res.json<{ sessionId: string }>();
    // Whatever this runtime's ICU calls that zone — the point is that the two
    // spellings of it cannot end up as two different stored values.
    expect(await zoneOf(sessionId)).toBe(canonicalZone("Asia/Kolkata"));
  });

  it("opens the form anyway when the zone is nonsense", async () => {
    const res = await open({ timezone: "Mars/Olympus" });
    expect(res.status).toBe(200);
    const { sessionId } = await res.json<{ sessionId: string }>();
    expect(await zoneOf(sessionId)).toBeNull();
  });

  it("records nothing when nobody said", async () => {
    // Miniflare serves no `cf` object, which is also what a request that never
    // went through Cloudflare looks like. Null, and the scheduler falls back to
    // the form's own zone.
    const res = await open({});
    expect(res.status).toBe(200);
    expect(await zoneOf((await res.json<{ sessionId: string }>()).sessionId)).toBeNull();
  });

  it("refuses a string too long to be a zone", async () => {
    // The one case where rejecting is right: this is a size bound on the body,
    // not an opinion about the zone.
    expect((await open({ timezone: "a".repeat(120) })).status).toBe(400);
  });
});
