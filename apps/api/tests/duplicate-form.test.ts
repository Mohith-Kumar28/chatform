import { describe, it, expect, beforeAll } from "vitest";
import { applySchema, seedTenant, fetchApi, type Tenant } from "./helpers.js";

let alice: Tenant;
let bob: Tenant;

beforeAll(async () => {
  await applySchema();
  alice = await seedTenant("dup_alice");
  bob = await seedTenant("dup_bob");
});

const post = (t: Tenant, body: unknown) =>
  fetchApi("/api/forms", {
    method: "POST",
    headers: { cookie: t.cookie, "content-type": "application/json" },
    body: JSON.stringify(body),
  });

describe("POST /api/forms with duplicateOf", () => {
  it("copies the working document into a new draft under the new title", async () => {
    const source = await (await fetchApi(`/api/forms/${alice.formId}`, { headers: { cookie: alice.cookie } })).json<{
      workingSchema: { blocks: { ref: string; title: string }[] };
    }>();
    const res = await post(alice, { title: "My form (copy)", duplicateOf: alice.formId });
    expect(res.status).toBe(200);
    const copy = await res.json<{ id: string; status: string; workingSchema: { title: string; blocks: { ref: string; title: string }[] } }>();
    expect(copy.id).not.toBe(alice.formId);
    expect(copy.status).toBe("draft");
    expect(copy.workingSchema.title).toBe("My form (copy)");
    expect(copy.workingSchema.blocks.map((b) => [b.ref, b.title])).toEqual(source.workingSchema.blocks.map((b) => [b.ref, b.title]));
  });

  it("refuses another organization's form", async () => {
    const res = await post(bob, { title: "Stolen", duplicateOf: alice.formId });
    expect(res.status).toBe(404);
  });
});
