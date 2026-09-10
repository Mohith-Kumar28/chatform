import { describe, it, expect, beforeAll } from "vitest";
import { env } from "cloudflare:test";
import { applySchema, seedTenant, fetchApi, minimalDoc, type Tenant } from "./helpers.js";

/**
 * Answers outlive the question that collected them.
 *
 * Deleting a block in the builder has never deleted its answers — nothing
 * joins `submission_answers` to a block — but for a long time it did delete
 * every way of reading them: the results table and the exports both built
 * their columns from the form's *current* document, so five "Team member N"
 * questions replaced by one repeating group took five columns of real
 * responses off the screen and out of every CSV.
 *
 * What is asserted here is the recovery, in the wording the question was asked
 * in and with the option labels it was asked with — a retired
 * `single_select` resolved from a bare title would export `opt_lead001`.
 */

let t: Tenant;

/** The question that gets deleted. Published, answered, then removed. */
const RETIRED_BLOCK = {
  id: "blk_retired01",
  ref: "q_team1",
  type: "single_select",
  title: "Team member 1 role",
  required: false,

  options: [
    { id: "opt_lead001", label: "Team lead" },
    { id: "opt_dev0001", label: "Developer" },
  ],
};

beforeAll(async () => {
  await applySchema();
  t = await seedTenant("retired");

  const now = Date.now();

  /**
   * Version 1 asked the question; the working document no longer does.
   *
   * This is exactly the shape of the edit the feature exists for: the block is
   * gone from `forms.working_schema`, and the only surviving record of what it
   * said is the published snapshot.
   */
  const published = minimalDoc("retired");
  published.blocks = [...published.blocks, RETIRED_BLOCK] as typeof published.blocks;

  await env.DB.prepare(
    `INSERT INTO form_versions (id, form_id, version, schema_json, checksum, published_at, created_by, created_at)
     VALUES ('ver_retired', ?, 1, ?, 'sum', ?, ?, ?)`,
  )
    .bind(t.formId, JSON.stringify(published), now, t.userId, now)
    .run();

  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO submissions (id, form_id, form_version_id, organization_id, status, started_at, completed_at, duration_ms)
       VALUES ('sbm_retired', ?, 'ver_retired', ?, 'completed', ?, ?, 3000)`,
    ).bind(t.formId, t.orgId, now - 3000, now),
    env.DB.prepare(
      `INSERT INTO submission_answers (id, submission_id, form_id, block_ref, block_type, value_json, updated_at)
       VALUES ('ans_live', 'sbm_retired', ?, 'q_email', 'email', ?, ?)`,
    ).bind(t.formId, JSON.stringify("ada@lovelace.dev"), now),
    env.DB.prepare(
      `INSERT INTO submission_answers (id, submission_id, form_id, block_ref, block_type, value_json, updated_at)
       VALUES ('ans_retired', 'sbm_retired', ?, 'q_team1', 'single_select', ?, ?)`,
    ).bind(t.formId, JSON.stringify("opt_lead001"), now),
    env.DB.prepare(
      `INSERT INTO submission_answers (id, submission_id, form_id, block_ref, block_type, value_json, updated_at)
       VALUES ('ans_orphan', 'sbm_retired', ?, 'q_never_published', 'short_text', ?, ?)`,
    ).bind(t.formId, JSON.stringify("answered against a draft"), now),
  ]);
});

const auth = () => ({ cookie: t.cookie });

interface ListBody {
  submissions: { id: string; answers: { blockRef: string; value: unknown }[] }[];
  retiredColumns: { ref: string; title: string; type: string; options?: { id: string; label: string }[] }[];
}

describe("questions removed from a form", () => {
  it("keeps the answers in the database", async () => {
    // The premise of everything below: the delete was never destructive, only
    // blinding.
    const row = await env.DB.prepare(
      `SELECT value_json FROM submission_answers WHERE submission_id = 'sbm_retired' AND block_ref = 'q_team1'`,
    ).first<{ value_json: string }>();
    expect(row?.value_json).toBe(JSON.stringify("opt_lead001"));
  });

  it("returns them as retired columns, in the wording they were asked in", async () => {
    const res = await fetchApi(`/api/forms/${t.formId}/submissions`, { headers: auth() });
    expect(res.status).toBe(200);
    const body = await res.json<ListBody>();

    const team = body.retiredColumns.find((c) => c.ref === "q_team1");
    expect(team?.title).toBe("Team member 1 role");
    expect(team?.type).toBe("single_select");
    // The whole block, not a label: without `options` the table renders ids.
    expect(team?.options?.map((o) => o.label)).toContain("Team lead");

    // The answer itself was already being sent; it just had no column.
    const row = body.submissions.find((s) => s.id === "sbm_retired");
    expect(row?.answers.some((a) => a.blockRef === "q_team1")).toBe(true);
  });

  it("never lists a question the form still asks", async () => {
    const res = await fetchApi(`/api/forms/${t.formId}/submissions`, { headers: auth() });
    const body = await res.json<ListBody>();
    expect(body.retiredColumns.some((c) => c.ref === "q_email")).toBe(false);
  });

  it("falls back to the ref for an answer no published version explains", async () => {
    // Answered against a draft that was never published. The column is still
    // worth having — dropping it is the behaviour being fixed.
    const res = await fetchApi(`/api/forms/${t.formId}/submissions`, { headers: auth() });
    const body = await res.json<ListBody>();
    const orphan = body.retiredColumns.find((c) => c.ref === "q_never_published");
    expect(orphan?.title).toBe("q_never_published");
    expect(orphan?.type).toBe("short_text");
  });

  it("exports them, marked, after the live columns", async () => {
    const res = await fetchApi(`/api/forms/${t.formId}/submissions/export`, { headers: auth() });
    expect(res.status).toBe(200);
    const csv = await res.text();
    const [header, ...rows] = csv.split("\n");

    expect(header).toContain("Team member 1 role (q_team1) [removed]");
    // After the live ones: the current form is what the author reads the sheet
    // against, and its history belongs at the far end.
    expect(header!.indexOf("q_email")).toBeLessThan(header!.indexOf("q_team1"));

    // The label, not the option id — the point of carrying the whole block.
    expect(rows.join("\n")).toContain("Team lead");
  });
});
