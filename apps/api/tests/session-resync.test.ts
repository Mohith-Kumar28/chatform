import { describe, it, expect, beforeAll } from "vitest";
import { env } from "cloudflare:test";
import { applySchema, seedTenant, fetchApi, type Tenant } from "./helpers.js";

/**
 * "Tell me again where we are."
 *
 * The browser dedupes stream replay by sequence number, which is what makes a
 * reconnect invisible — and also what makes a reconnect useless for recovering
 * a state the page has already seen and then lost. Resync re-states the
 * current step under fresh sequence numbers, and its whole value depends on
 * two properties: it must reach the stream, and it must not move the
 * conversation. A recovery that quietly advanced the flow would turn a
 * cosmetic glitch into a lost answer.
 */

let t: Tenant;
let slug: string;

const DOC = {
  schemaVersion: 4,
  title: "Resync",
  blocks: [
    {
      id: "blk_rsplat01",
      ref: "q_platform",
      type: "single_select",
      title: "Platform?",
      required: true,
      options: [
        { id: "opt_ios", label: "iOS" },
        { id: "opt_web", label: "Web" },
      ],
    },
    { id: "blk_rsmail01", ref: "q_email", type: "email", title: "Email?", required: true },
  ],
  endings: [{ id: "end_rs00001", ref: "end_thanks", title: "All done!", bodyMd: "Thanks." }],
  logic: [],
  endingRules: [],
  variables: [],
  hiddenFields: [],
  layout: {},
  settings: { agent: { mode: "template" }, onComplete: { requireSubmit: true } },
  theme: {},
};

beforeAll(async () => {
  await applySchema();
  t = await seedTenant("resync");
  const now = Date.now();
  slug = "resync-form"; // the slug `seedTenant` gives its form
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO form_versions (id, form_id, version, schema_json, checksum, published_at, created_by, created_at)
       VALUES ('ver_resync', ?1, 1, ?2, 'ck', ?3, ?4, ?3)`,
    ).bind(t.formId, JSON.stringify(DOC), now, t.userId),
    env.DB.prepare(
      `UPDATE forms SET status = 'published', working_schema = ?1, active_version_id = 'ver_resync' WHERE id = ?2`,
    ).bind(JSON.stringify(DOC), t.formId),
  ]);
});

async function open(): Promise<{ sessionId: string; token: string }> {
  const res = await fetchApi(`/p/forms/${slug}/sessions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
  });
  const body = (await res.json()) as { sessionId: string; respondentToken: string };
  return { sessionId: body.sessionId, token: body.respondentToken };
}

const state = (s: { sessionId: string; token: string }) =>
  fetchApi(`/p/sessions/${s.sessionId}?t=${s.token}`).then(
    (r) => r.json() as Promise<{ currentRef: string | null; collected: number; awaitingSubmit: boolean; status: string }>,
  );

const resync = (s: { sessionId: string; token: string }) =>
  fetchApi(`/p/sessions/${s.sessionId}/resync`, {
    method: "POST",
    headers: { "x-respondent-token": s.token },
  });

describe("resync", () => {
  it("leaves the conversation exactly where it was", async () => {
    const s = await open();
    const before = await state(s);

    expect((await resync(s)).status).toBe(202);
    // Twice, because a stuck client retries: it has to be idempotent or the
    // recovery becomes its own bug.
    expect((await resync(s)).status).toBe(202);

    const after = await state(s);
    expect(after.currentRef).toBe(before.currentRef);
    expect(after.collected).toBe(before.collected);
    expect(after.status).toBe(before.status);
  });

  it("does not skip past a question that has been answered", async () => {
    const s = await open();
    await fetchApi(`/p/sessions/${s.sessionId}/messages`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-respondent-token": s.token },
      body: JSON.stringify({ type: "structured", ref: "q_platform", value: "opt_ios" }),
    });
    const before = await state(s);
    expect(before.currentRef).toBe("q_email");

    await resync(s);
    const after = await state(s);
    expect(after.currentRef).toBe("q_email");
    expect(after.collected).toBe(1);
  });

  it("is refused without the respondent token", async () => {
    const s = await open();
    const res = await fetchApi(`/p/sessions/${s.sessionId}/resync`, { method: "POST" });
    expect(res.status).toBe(401);
  });

  it("re-states a finished conversation rather than reopening it", async () => {
    const s = await open();
    for (const [ref, value] of [
      ["q_platform", "opt_web"],
      ["q_email", "done@example.com"],
    ] as const) {
      await fetchApi(`/p/sessions/${s.sessionId}/messages`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-respondent-token": s.token },
        body: JSON.stringify({ type: "structured", ref, value }),
      });
    }
    await fetchApi(`/p/sessions/${s.sessionId}/actions`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-respondent-token": s.token },
      body: JSON.stringify({ action: "submit" }),
    });

    expect((await resync(s)).status).toBe(202);
    const after = await state(s);
    expect(after.status).toBe("completed");
    expect(after.currentRef).toBeNull();
  });
});
