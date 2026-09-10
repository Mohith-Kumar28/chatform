import { describe, it, expect, beforeAll } from "vitest";
import { applySchema, seedTenant, fetchApi, minimalDoc, type Tenant } from "./helpers.js";

/**
 * The autosave endpoint's two new guarantees, and the message it gives when it
 * refuses.
 *
 * All three used to be absent in the same place: the write was unconditional, so
 * two tabs overwrote each other in silence; and a document the schema rejected
 * came back as `settings.onComplete.notificationEmails.0: Invalid email address`,
 * a JSON path shown to whoever was typing in the box.
 */

let org: Tenant;

const auth = (t: Tenant) => ({ cookie: t.cookie, "content-type": "application/json" });

const save = (doc: unknown, baseRevision?: number) =>
  fetchApi(`/api/forms/${org.formId}/doc`, {
    method: "PUT",
    headers: auth(org),
    body: JSON.stringify(baseRevision === undefined ? { doc } : { doc, baseRevision }),
  });

const read = () =>
  fetchApi(`/api/forms/${org.formId}`, { headers: auth(org) }).then((r) =>
    r.json<{ workingRevision: number; title: string }>(),
  );

const titled = (title: string) => ({ ...minimalDoc("ds"), title });

beforeAll(async () => {
  await applySchema();
  org = await seedTenant("docsave");
});

describe("revisions", () => {
  it("hands back the revision it produced", async () => {
    const res = await save(titled("First"));
    expect(res.status).toBe(200);
    const body = await res.json<{ ok: boolean; revision: number }>();
    expect(body.ok).toBe(true);
    expect(typeof body.revision).toBe("number");
    expect((await read()).workingRevision).toBe(body.revision);
  });

  it("accepts a save that states the revision it was made against", async () => {
    const at = (await read()).workingRevision;
    const res = await save(titled("Second"), at);
    expect(res.status).toBe(200);
    expect((await res.json<{ revision: number }>()).revision).toBe(at + 1);
  });

  it("refuses a save made against a revision that has moved, and keeps the winner's work", async () => {
    // Two editors open the same form at the same revision.
    const shared = (await read()).workingRevision;

    const first = await save(titled("Tab A"), shared);
    expect(first.status).toBe(200);

    // The second still believes it is at `shared`, because nothing told it.
    const second = await save(titled("Tab B"), shared);
    expect(second.status).toBe(409);
    const body = await second.json<{ error: { code: string; message: string; revision?: number } }>();
    expect(body.error.code).toBe("revision_conflict");
    // The message is for a person, so it names neither a column nor a number.
    expect(body.error.message).not.toMatch(/working_revision|\d/);

    // The point of the whole exercise: A's work is still there.
    expect((await read()).title).toBe("Tab A");
  });

  it("applies a save that states no revision at all, so an older tab still works", async () => {
    const before = (await read()).workingRevision;
    const res = await save(titled("No revision stated"));
    expect(res.status).toBe(200);
    expect((await read()).workingRevision).toBe(before + 1);
    expect((await read()).title).toBe("No revision stated");
  });

  it("does not advance the revision when it refuses", async () => {
    const at = (await read()).workingRevision;
    await save(titled("Rejected"), at - 1);
    expect((await read()).workingRevision).toBe(at);
  });
});

describe("a document the schema will not hold", () => {
  const withBadEmail = () => {
    const doc = minimalDoc("ds") as { settings: { onComplete: Record<string, unknown> } };
    doc.settings.onComplete = { ...doc.settings.onComplete, notificationEmails: ["mu"] };
    return doc;
  };

  it("explains itself without a JSON path in the message", async () => {
    const res = await save(withBadEmail());
    expect(res.status).toBe(422);
    const body = await res.json<{ error: { code: string; message: string; issues?: unknown[] } }>();
    expect(body.error.code).toBe("invalid_doc");
    // The exact string the builder used to put in a toast.
    expect(body.error.message).not.toContain("settings.onComplete.notificationEmails.0");
    expect(body.error.message).toMatch(/email address/i);
    expect(body.error.message).toMatch(/Notification emails/);
  });

  it("keeps the path in `issues`, where the builder can use it", async () => {
    const res = await save(withBadEmail());
    const body = await res.json<{ error: { issues: { path: string; message: string }[] } }>();
    expect(body.error.issues).toHaveLength(1);
    expect(body.error.issues[0]!.path).toBe("settings.onComplete.notificationEmails.0");
  });

  it("says a required string is empty rather than describing the predicate", async () => {
    const res = await save({ ...minimalDoc("ds"), title: "" });
    const body = await res.json<{ error: { message: string } }>();
    expect(body.error.message).toMatch(/cannot be empty/i);
    expect(body.error.message).not.toMatch(/expected|>=|too_small/i);
  });

  it("names one field and counts the rest", async () => {
    const doc = minimalDoc("ds") as { title: string; settings: { onComplete: Record<string, unknown> } };
    doc.title = "";
    doc.settings.onComplete = { ...doc.settings.onComplete, notificationEmails: ["mu"] };
    const body = await (await save(doc)).json<{ error: { message: string; issues: unknown[] } }>();
    expect(body.error.issues).toHaveLength(2);
    expect(body.error.message).toMatch(/and 1 other field/);
  });

  it("changes nothing when it refuses", async () => {
    const before = await read();
    await save(withBadEmail());
    expect(await read()).toEqual(before);
  });
});

describe("the save limiter", () => {
  /*
    Inert off the Cloudflare edge, which is where the tests run.

    `vitest.config.ts` points Miniflare at the same `wrangler.jsonc` the worker
    deploys with, so the binding exists here. `limited` declines to count a
    request with no `cf-connecting-ip`, and that is the only thing standing
    between this suite and 429s on its own fixtures.
  */
  it("does not fire on a burst without a client address", async () => {
    const results: number[] = [];
    for (let i = 0; i < 40; i++) results.push((await save(titled(`Burst ${i}`))).status);
    expect(results.every((s) => s === 200)).toBe(true);
  });
});
