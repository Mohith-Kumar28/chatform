import { describe, it, expect, beforeAll } from "vitest";
import { env } from "cloudflare:test";
import { applySchema, seedTenant, fetchApi, type Tenant } from "./helpers.js";

/**
 * The respondent surface, limited by address.
 *
 * `/p` is the one surface with no API key, so the per-key windows the rest of
 * the API leans on do not apply to it — and until these bindings existed there
 * was nothing at all between a script and a form that opens a durable object
 * and calls a model on every turn.
 *
 * The limiter is deliberately inert without `cf-connecting-ip`, which is why
 * every request here sets one: off the Cloudflare edge there is no address, and
 * bucketing the whole test suite under a single constant would 429 the first
 * test that opened a ninth session. That rule is what lets the bindings be
 * declared in `wrangler.jsonc` — which Miniflare reads — without every other
 * test file having to know they exist. It is asserted below, not assumed.
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

const hasBinding = !!(env as unknown as { RATE_LIMIT_P_START?: unknown }).RATE_LIMIT_P_START;

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
  it("lets a person through", async () => {
    expect((await open(nextIp())).status).toBe(200);
  });

  /**
   * One spray, every assertion about it.
   *
   * Deliberately not split into "it refuses" and "it says how long to wait":
   * each spray is ten requests, and `ratelimit.test.ts` is meanwhile firing a
   * hundred and forty of its own at a limiter whose window is wall-clock. Two
   * sprays here were enough extra contention to push that one past its ten
   * seconds and make it flake. Assertions are cheap; requests are not.
   */
  it.skipIf(!hasBinding)("stops a script, and says how long to wait", async () => {
    const ip = nextIp();
    const codes: number[] = [];
    let refused: Response | null = null;
    for (let i = 0; i < 10; i += 1) {
      const res = await open(ip);
      codes.push(res.status);
      if (res.status === 429 && !refused) refused = res;
    }

    // Eight through, then refusals — the exact count is the binding's, not
    // ours, so this asserts the shape rather than an index.
    expect(codes.filter((s) => s === 200).length).toBeLessThanOrEqual(8);
    expect(refused, "the limiter never refused").not.toBeNull();
    expect(refused!.headers.get("retry-after")).toBe("60");
    expect(refused!.headers.get("ratelimit-policy")).toBe("8;w=60");
    expect(await refused!.json()).toMatchObject({
      error: { code: "rate_limited", scope: "ip" },
    });
  });

  it("does not count a caller it cannot identify", async () => {
    // The rule the rest of the test suite depends on. Without an address the
    // limiter must pass everything through, or 56 other test files start
    // failing the moment they open a few sessions. Ten is two past the window
    // it would be spending if it counted these, which is the whole claim.
    const codes: number[] = [];
    for (let i = 0; i < 10; i += 1) codes.push((await open()).status);
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
