import { describe, it, expect, beforeAll } from "vitest";
import { env } from "cloudflare:test";
import { applySchema, seedTenant, fetchApi, type Tenant } from "./helpers.js";

/**
 * The respondent surface never counts a crowd.
 *
 * It used to refuse the ninth session opened from one address in a minute. An
 * address is a campus, an office, or a mobile carrier: at a registration event
 * that turned real people away. What is limited now is one conversation, not
 * one address. See `publicSessionLimit`.
 *
 * Every request sets `cf-connecting-ip`, because the limiter is inert without
 * one; a test that left it off would pass whatever the limiter did.
 */

let t: Tenant;
const SLUG = "ratelimited-form";

const DOC = {
  schemaVersion: 6,
  title: "Limited",
  blocks: [
    { id: "blk_prl00001", ref: "q_one", type: "short_text", title: "One?", required: true, minLength: 0, maxLength: 80 },
  ],
  endings: [{ id: "end_prl00001", ref: "end_thanks", title: "Done", bodyMd: "Thanks." }],
  logic: [],
  endingRules: [],
  variables: [],
  hiddenFields: [],
  layout: {},
  settings: { agent: { mode: "template" } },
  theme: {},
};

const open = (ip?: string) =>
  fetchApi(`/p/forms/${SLUG}/sessions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(ip ? { "cf-connecting-ip": ip } : {}),
    },
    body: "{}",
  });

/** A fresh address per test, so one test's spent window is not another's. */
let n = 0;
const nextIp = () => `203.0.113.${(n += 1)}`;

beforeAll(async () => {
  await applySchema();
  t = await seedTenant("publicrl");
  const doc = JSON.stringify(DOC);
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO form_versions (id, form_id, version, schema_json, checksum, published_at, created_by, created_at)
       VALUES ('ver_prl', ?1, 1, ?2, 'ck', ?3, ?4, ?3)`,
    ).bind(t.formId, doc, Date.now(), t.userId),
    env.DB.prepare(
      `UPDATE forms SET slug = ?1, status = 'published', working_schema = ?2, active_version_id = 'ver_prl' WHERE id = ?3`,
    ).bind(SLUG, doc, t.formId),
  ]);
});

describe("opening a session", () => {
  it("lets a whole room behind one address in", async () => {
    // Far past the old eight a minute, all from one address, as at an event.
    const ip = nextIp();
    const codes = await Promise.all(Array.from({ length: 40 }, () => open(ip).then((r) => r.status)));
    expect(codes.every((s) => s === 200)).toBe(true);
  });
});

describe("the blanket window", () => {
  it("never sets an empty policy header", async () => {
    // `tooMany` used to write `ratelimit-policy: ""` for every scope that was
    // not the burst limiter — a header present and blank, which a client
    // parsing it has to read as a policy of nothing rather than as no policy.
    const res = await open(nextIp());
    const policy = res.headers.get("ratelimit-policy");
    expect(policy === null || policy.length > 0).toBe(true);
  });
});
