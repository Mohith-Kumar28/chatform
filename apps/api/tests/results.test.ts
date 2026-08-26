import { describe, it, expect, beforeAll } from "vitest";
import { env } from "cloudflare:test";
import { applySchema, seedTenant, fetchApi, minimalDoc, type Tenant } from "./helpers.js";

/**
 * The submissions list and its status filter.
 *
 * The filter regressed when the status was moved out of an interpolated string
 * into a bound parameter: mixing `?` with `?1` makes SQLite renumber the
 * placeholders, so the statement wanted two bindings while three were supplied
 * and every request 500'd. The tenancy suite only asserted the 404 path, so
 * nothing caught it.
 */

let t: Tenant;

beforeAll(async () => {
  await applySchema();
  t = await seedTenant("results");

  const now = Date.now();
  // submissions.form_version_id is a real FK — a published version must exist.
  await env.DB.prepare(
    `INSERT INTO form_versions (id, form_id, version, schema_json, checksum, published_at, created_by, created_at)
     VALUES ('ver_x', ?, 1, ?, 'sum', ?, ?, ?)`,
  )
    .bind(t.formId, JSON.stringify(minimalDoc("results")), now, t.userId, now)
    .run();

  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO submissions (id, form_id, form_version_id, organization_id, session_id, status, started_at, completed_at, duration_ms)
       VALUES (?, ?, 'ver_x', ?, 'chs_done', 'completed', ?, ?, 4200)`,
    ).bind("sbm_done", t.formId, t.orgId, now - 5000, now),
    env.DB.prepare(
      `INSERT INTO submissions (id, form_id, form_version_id, organization_id, session_id, status, started_at)
       VALUES (?, ?, 'ver_x', ?, 'chs_part', 'in_progress', ?)`,
    ).bind("sbm_partial", t.formId, t.orgId, now - 2000),
    env.DB.prepare(
      `INSERT INTO submission_answers (id, submission_id, form_id, block_ref, block_type, value_json, updated_at)
       VALUES ('ans_1', 'sbm_done', ?, 'q_email', 'email', ?, ?)`,
    ).bind(t.formId, JSON.stringify("grace@hopper.dev"), now),
  ]);
});

const auth = () => ({ cookie: t.cookie });

interface Row {
  id: string;
  status: string;
  answers: { blockRef: string; value: unknown }[];
  transcript: unknown[];
}

describe("submissions list", () => {
  it("returns rows with their answers", async () => {
    const res = await fetchApi(`/api/forms/${t.formId}/submissions`, { headers: auth() });
    expect(res.status).toBe(200);
    const rows = await res.json<Row[]>();
    expect(rows.length).toBeGreaterThan(0);
    const done = rows.find((r) => r.id === "sbm_done");
    expect(done?.answers[0]?.value).toBe("grace@hopper.dev");
  });

  it("filters by status", async () => {
    const completed = await fetchApi(`/api/forms/${t.formId}/submissions?status=completed`, {
      headers: auth(),
    });
    expect(completed.status).toBe(200);
    const rows = await completed.json<Row[]>();
    expect(rows.every((r) => r.status === "completed")).toBe(true);
    expect(rows.some((r) => r.id === "sbm_done")).toBe(true);
    expect(rows.some((r) => r.id === "sbm_partial")).toBe(false);
  });

  it("status=all returns both", async () => {
    const res = await fetchApi(`/api/forms/${t.formId}/submissions?status=all`, { headers: auth() });
    const rows = await res.json<Row[]>();
    expect(rows.some((r) => r.id === "sbm_done")).toBe(true);
    expect(rows.some((r) => r.id === "sbm_partial")).toBe(true);
  });

  it("analytics responds", async () => {
    const res = await fetchApi(`/api/forms/${t.formId}/analytics`, { headers: auth() });
    expect(res.status).toBe(200);
    const a = await res.json<{ completed: number }>();
    expect(a.completed).toBeGreaterThanOrEqual(1);
  });

  it("CSV export responds with rows", async () => {
    const res = await fetchApi(`/api/forms/${t.formId}/submissions/export`, { headers: auth() });
    expect(res.status).toBe(200);
    const csv = await res.text();
    expect(csv).toContain("grace@hopper.dev");
  });
});
