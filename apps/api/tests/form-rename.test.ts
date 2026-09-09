import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { applySchema, seedTenant, fetchApi, minimalDoc, type Tenant } from "./helpers.js";
import type { Bindings } from "../src/env.js";

const DB = () => env as unknown as Bindings;

let org: Tenant;

const auth = (t: Tenant) => ({ cookie: t.cookie, "content-type": "application/json" });

const save = (doc: unknown) =>
  fetchApi(`/api/forms/${org.formId}/doc`, { method: "PUT", headers: auth(org), body: JSON.stringify({ doc }) });

const rename = (title: string) => save({ ...minimalDoc("rename"), title });

const row = () =>
  DB()
    .DB.prepare(`SELECT title, slug FROM forms WHERE id = ?`)
    .bind(org.formId)
    .first<{ title: string; slug: string }>();

beforeAll(async () => {
  await applySchema();
  org = await seedTenant("rename");
});

beforeEach(async () => {
  await DB().DB.prepare(`DELETE FROM form_versions WHERE form_id = ?`).bind(org.formId).run();
  await DB()
    .DB.prepare(`UPDATE forms SET status = 'draft', active_version_id = NULL, title = ?, slug = ? WHERE id = ?`)
    .bind("rename form", "rename-form", org.formId)
    .run();
  await save(minimalDoc("rename"));
});

/**
 * The name is a document field, and the forms row carries a copy of it for the
 * lists that never load a document. A rename that updated only one of the two
 * would give the same form two names — the builder header showing one and the
 * dashboard the other — which is exactly the state the product used to be in,
 * because nothing could rename a form at all.
 */
describe("renaming a form", () => {
  it("renames the row when the document's title changes", async () => {
    expect((await rename("Beta waitlist")).status).toBe(200);
    expect((await row())!.title).toBe("Beta waitlist");

    const read = await (await fetchApi(`/api/forms/${org.formId}`, { headers: auth(org) })).json<{ title: string }>();
    expect(read.title).toBe("Beta waitlist");
  });

  it("shows the new name in the dashboard list", async () => {
    await rename("Beta waitlist");
    const list = await (await fetchApi(`/api/forms`, { headers: auth(org) })).json<{ id: string; title: string }[]>();
    expect(list.find((f) => f.id === org.formId)?.title).toBe("Beta waitlist");
  });

  it("leaves the public link alone", async () => {
    await rename("Beta waitlist");
    // A rename is not a re-address: whatever is already out there keeps working.
    expect((await row())!.slug).toBe("rename-form");
  });

  it("refuses an empty name rather than storing one", async () => {
    const res = await rename("");
    expect(res.status).toBe(422);
    expect((await row())!.title).toBe("rename form");
  });

  it("restores the name a version was published under", async () => {
    await rename("First name");
    await fetchApi(`/api/forms/${org.formId}/publish`, { method: "POST", headers: auth(org) });
    await rename("Second name");
    expect((await row())!.title).toBe("Second name");

    await fetchApi(`/api/forms/${org.formId}/versions/1/restore`, { method: "POST", headers: auth(org) });
    expect((await row())!.title).toBe("First name");
  });
});
