import { describe, it, expect, beforeAll } from "vitest";
import { env } from "cloudflare:test";
import { applySchema, seedTenant, fetchApi, minimalDoc, type Tenant } from "./helpers.js";
import { SCHEMA_VERSION } from "@repo/form-schema";

let t: Tenant;

beforeAll(async () => {
  await applySchema();
  t = await seedTenant("migrate");
});

const auth = (extra: HeadersInit = {}) => ({ cookie: t.cookie, ...extra });

describe("docs are migrated on read", () => {
  it("a v1 row comes back at the current schema version with new defaults", async () => {
    // The seeded form is written as a raw v1 document.
    const res = await fetchApi(`/api/forms/${t.formId}`, { headers: auth() });
    const body = await res.json<{ workingSchema: Record<string, any> }>();
    expect(body.workingSchema.schemaVersion).toBe(SCHEMA_VERSION);
    expect(body.workingSchema.settings.agent.guardrails.maxTurns).toBe(60);
    expect(body.workingSchema.settings.agent.knowledge).toEqual([]);
    expect(body.workingSchema.blocks[0].agentHints).toBeNull();
    expect(body.workingSchema.blocks[0].media).toBeNull();
    expect(body.workingSchema.settings.agent.rephraseQuestions).toBe(true);
  });

  it("stored rows are not rewritten by a read", async () => {
    const row = await env.DB.prepare(`SELECT working_schema FROM forms WHERE id = ?`)
      .bind(t.formId)
      .first<{ working_schema: string }>();
    expect(JSON.parse(row!.working_schema).schemaVersion).toBe(1);
  });
});

describe("form passwords are hashed at rest", () => {
  it("a plaintext password is converted on save and never echoed back", async () => {
    const doc = {
      ...minimalDoc("migrate"),
      settings: { password: { enabled: true, value: "hunter2" } },
    };
    const put = await fetchApi(`/api/forms/${t.formId}/doc`, {
      method: "PUT",
      headers: auth({ "content-type": "application/json" }),
      body: JSON.stringify({ doc }),
    });
    expect(put.status).toBe(200);

    const row = await env.DB.prepare(`SELECT working_schema FROM forms WHERE id = ?`)
      .bind(t.formId)
      .first<{ working_schema: string }>();
    const stored = JSON.parse(row!.working_schema).settings.password.value as string;
    expect(stored).not.toBe("hunter2");
    expect(stored).toMatch(/^pbkdf2\$\d+\$[0-9a-f]+\$[0-9a-f]+$/);
  });

  it("saving again does not double-hash", async () => {
    const before = await env.DB.prepare(`SELECT working_schema FROM forms WHERE id = ?`)
      .bind(t.formId)
      .first<{ working_schema: string }>();
    const hash = JSON.parse(before!.working_schema).settings.password.value;

    const res = await fetchApi(`/api/forms/${t.formId}`, { headers: auth() });
    const { workingSchema } = await res.json<{ workingSchema: unknown }>();
    await fetchApi(`/api/forms/${t.formId}/doc`, {
      method: "PUT",
      headers: auth({ "content-type": "application/json" }),
      body: JSON.stringify({ doc: workingSchema }),
    });

    const after = await env.DB.prepare(`SELECT working_schema FROM forms WHERE id = ?`)
      .bind(t.formId)
      .first<{ working_schema: string }>();
    expect(JSON.parse(after!.working_schema).settings.password.value).toBe(hash);
  });
});
