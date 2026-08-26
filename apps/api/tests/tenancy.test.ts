import { describe, it, expect, beforeAll } from "vitest";
import { applySchema, seedTenant, fetchApi, type Tenant } from "./helpers.js";

/**
 * Regression suite for the cross-tenant data leak.
 *
 * Before the guards module every `/api/forms/:id...` route trusted the id in
 * the URL. Any signed-in user could read, edit, publish or delete any other
 * tenant's form, read their submissions and analytics, and drive their chat
 * sessions through `/v1`. Each case below is one of those holes.
 */

let alice: Tenant;
let bob: Tenant;

beforeAll(async () => {
  await applySchema();
  alice = await seedTenant("alice");
  bob = await seedTenant("bob");
});

const auth = (t: Tenant, extra: HeadersInit = {}) => ({ cookie: t.cookie, ...extra });

describe("form routes are org-scoped", () => {
  it("owner can read their own form", async () => {
    const res = await fetchApi(`/api/forms/${alice.formId}`, { headers: auth(alice) });
    expect(res.status).toBe(200);
    expect((await res.json<{ id: string }>()).id).toBe(alice.formId);
  });

  it("another tenant gets 404, not the form", async () => {
    const res = await fetchApi(`/api/forms/${alice.formId}`, { headers: auth(bob) });
    expect(res.status).toBe(404);
  });

  it("another tenant cannot overwrite the working doc", async () => {
    const res = await fetchApi(`/api/forms/${alice.formId}/doc`, {
      method: "PUT",
      headers: auth(bob, { "content-type": "application/json" }),
      body: JSON.stringify({ doc: { schemaVersion: 1, title: "pwned", blocks: [], endings: [] } }),
    });
    expect(res.status).toBe(404);

    const still = await fetchApi(`/api/forms/${alice.formId}`, { headers: auth(alice) });
    expect((await still.json<{ title: string }>()).title).not.toBe("pwned");
  });

  it("another tenant cannot publish", async () => {
    const res = await fetchApi(`/api/forms/${alice.formId}/publish`, { method: "POST", headers: auth(bob) });
    expect(res.status).toBe(404);
  });

  it("another tenant cannot delete", async () => {
    const res = await fetchApi(`/api/forms/${alice.formId}`, { method: "DELETE", headers: auth(bob) });
    expect(res.status).toBe(404);

    const still = await fetchApi(`/api/forms/${alice.formId}`, { headers: auth(alice) });
    expect(still.status).toBe(200);
  });

  it("another tenant cannot read submissions or analytics", async () => {
    for (const path of [`/api/forms/${alice.formId}/submissions`, `/api/forms/${alice.formId}/analytics`]) {
      expect((await fetchApi(path, { headers: auth(bob) })).status).toBe(404);
    }
  });

  it("another tenant cannot start a preview session against the draft", async () => {
    const res = await fetchApi(`/api/forms/${alice.formId}/preview/sessions`, { method: "POST", headers: auth(bob) });
    expect(res.status).toBe(404);
  });

  it("list only returns the caller's own forms", async () => {
    const res = await fetchApi("/api/forms", { headers: auth(bob) });
    const rows = await res.json<{ id: string }[]>();
    expect(rows.some((r) => r.id === alice.formId)).toBe(false);
  });
});

describe("unauthenticated access", () => {
  it("templates require a session", async () => {
    // This router previously had no middleware at all.
    expect((await fetchApi("/api/templates")).status).toBe(401);
  });

  it("forms require a session", async () => {
    expect((await fetchApi("/api/forms")).status).toBe(401);
  });
});

describe("/v1 API keys are org-scoped", () => {
  it("a key cannot read another org's form", async () => {
    const res = await fetchApi(`/v1/forms/${alice.formId}`, {
      headers: { authorization: `Bearer ${bob.apiKeyRaw}` },
    });
    expect(res.status).toBe(404);
  });

  it("a key cannot drive a chat session it does not own", async () => {
    const res = await fetchApi(`/v1/chat/sessions/chs_alice_secret`, {
      headers: { authorization: `Bearer ${bob.apiKeyRaw}` },
    });
    expect(res.status).toBe(404);
  });

  it("a missing key is rejected", async () => {
    expect((await fetchApi("/v1/forms")).status).toBe(401);
  });
});

describe("webhook admin is org-scoped", () => {
  it("does not return the full signing secret in a list", async () => {
    const created = await fetchApi("/api/webhooks", {
      method: "POST",
      headers: auth(alice, { "content-type": "application/json" }),
      body: JSON.stringify({ url: "https://example.com/hook", events: ["submission.completed"] }),
    });
    expect(created.status).toBe(200);
    const { secret } = await created.json<{ secret: string }>();
    expect(secret).toMatch(/^whsec_/); // returned exactly once, at creation

    const list = await fetchApi("/api/webhooks", { headers: auth(alice) });
    const rows = await list.json<Record<string, unknown>[]>();
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.secret).toBeUndefined();
      expect(String(row.secretPreview)).toMatch(/…$/);
    }
  });

  it("another tenant cannot delete a webhook", async () => {
    const list = await fetchApi("/api/webhooks", { headers: auth(alice) });
    const [hook] = await list.json<{ id: string }[]>();
    const res = await fetchApi(`/api/webhooks/${hook!.id}`, { method: "DELETE", headers: auth(bob) });
    expect(res.status).toBe(404);
  });
});
