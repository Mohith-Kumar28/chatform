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
 * Every request sets `cf-ray`, the request id Cloudflare's edge stamps on
 * everything, because the limiter is inert off the edge; a test that left it
 * off would pass whatever the limiter did. No request carries an address.
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

const open = (ray?: string) =>
  fetchApi(`/p/forms/${SLUG}/sessions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(ray ? { "cf-ray": ray } : {}),
    },
    body: "{}",
  });

let n = 0;
const nextRay = () => `ray${(n += 1)}`;

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
    // Far past the old eight a minute, as at an event where everyone shares one network.
    const codes = await Promise.all(Array.from({ length: 40 }, () => open(nextRay()).then((r) => r.status)));
    expect(codes.every((s) => s === 200)).toBe(true);
  });
});

describe("the blanket window", () => {
  it("never sets an empty policy header", async () => {
    // `tooMany` used to write `ratelimit-policy: ""` for every scope that was
    // not the burst limiter — a header present and blank, which a client
    // parsing it has to read as a policy of nothing rather than as no policy.
    const res = await open(nextRay());
    const policy = res.headers.get("ratelimit-policy");
    expect(policy === null || policy.length > 0).toBe(true);
  });
});

describe("sign-in attempts", () => {
  /**
   * Better Auth's own limiter counted by address and is switched off; sign-in
   * is capped per account instead. Twelve tries a minute on one email, from
   * anywhere, then 429. A different account on the same network is untouched.
   */
  it("caps attempts per account, never per network", async () => {
    const attempt = (email: string) =>
      fetchApi("/api/auth/sign-in/email", {
        method: "POST",
        headers: { "content-type": "application/json", "cf-ray": nextRay() },
        body: JSON.stringify({ email, password: "wrong-password-123" }),
      }).then((r) => r.status);
    const target = `target-${n}@example.com`;
    const codes: number[] = [];
    for (let i = 0; i < 13; i++) codes.push(await attempt(target));
    expect(codes.slice(0, 12).every((s) => s !== 429)).toBe(true);
    expect(codes[12]).toBe(429);
    expect(await attempt(`someone-else-${n}@example.com`)).not.toBe(429);
  });
});
