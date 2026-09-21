import { describe, it, expect, vi } from "vitest";
import { createClient } from "../src/index";
import { createBrowserClient } from "../src/browser";

/**
 * The resources added in 0.2.0.
 *
 * Mostly these name a URL and return what comes back, so testing every one
 * would be testing that a template literal interpolates. What is tested here is
 * the part of each that could be wrong: the method and path actually sent, the
 * multipart upload leaving its `content-type` alone, `rotateSpreadsheet`
 * reaching the same endpoint as `setSpreadsheet` with the flag set, and the
 * browser client carrying respondent auth.
 */

interface Call {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
}

function recorder(body: unknown = { ok: true }) {
  const calls: Call[] = [];
  const fetchImpl = vi.fn(async (input: URL | RequestInfo, init?: RequestInit) => {
    calls.push({
      url: String(input),
      method: init?.method ?? "GET",
      headers: (init?.headers ?? {}) as Record<string, string>,
      body: init?.body,
    });
    return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
  });
  return { calls, fetchImpl: fetchImpl as unknown as typeof fetch };
}

const client = (fetchImpl: typeof fetch) => createClient({ apiKey: "sk_live_test", fetch: fetchImpl });
const path = (c: Call) => new URL(c.url).pathname + new URL(c.url).search;

describe("templates", () => {
  it("lists, reads and uses", async () => {
    const { calls, fetchImpl } = recorder([]);
    const cf = client(fetchImpl);
    await cf.templates.list();
    await cf.templates.get("client-intake");
    await cf.templates.use("client-intake");
    expect(calls.map((c) => `${c.method} ${path(c)}`)).toEqual([
      "GET /v1/templates",
      "GET /v1/templates/client-intake",
      "POST /v1/templates/client-intake/use",
    ]);
  });
});

describe("versions", () => {
  it("passes `compare` as a query parameter, not a path segment", async () => {
    const { calls, fetchImpl } = recorder();
    await client(fetchImpl).forms.versions.get("frm_1", 3, { compare: 1 });
    expect(path(calls[0])).toBe("/v1/forms/frm_1/versions/3?compare=1");
  });

  it("restores by version number", async () => {
    const { calls, fetchImpl } = recorder();
    await client(fetchImpl).forms.versions.restore("frm_1", 2);
    expect(`${calls[0].method} ${path(calls[0])}`).toBe("POST /v1/forms/frm_1/versions/2/restore");
  });
});

describe("knowledge", () => {
  it("routes each kind of source to its own endpoint", async () => {
    const { calls, fetchImpl } = recorder({ id: "kbs_1" });
    const cf = client(fetchImpl);
    await cf.forms.knowledge.addText("frm_1", { title: "t", body: "b" });
    await cf.forms.knowledge.addLink("frm_1", { url: "https://example.com" });
    await cf.forms.knowledge.crawl("frm_1", { url: "https://example.com", pages: 1 });
    await cf.forms.knowledge.remove("frm_1", "kbs_1");
    expect(calls.map((c) => `${c.method} ${path(c)}`)).toEqual([
      "POST /v1/forms/frm_1/knowledge/text",
      "POST /v1/forms/frm_1/knowledge/link",
      "POST /v1/forms/frm_1/knowledge/crawl",
      "DELETE /v1/forms/frm_1/knowledge/kbs_1",
    ]);
  });

  /**
   * The one that would break silently. `fetch` generates the multipart
   * boundary and writes the header to match; setting `content-type` ourselves
   * would keep the type and lose the boundary, and the server would reject a
   * body it could not split.
   */
  it("sends multipart without setting content-type", async () => {
    const { calls, fetchImpl } = recorder({ id: "kbs_1" });
    await client(fetchImpl).forms.knowledge.upload("frm_1", {
      body: new TextEncoder().encode("# note"),
      filename: "note.md",
      type: "text/markdown",
    });
    expect(calls[0].body).toBeInstanceOf(FormData);
    expect(calls[0].headers["content-type"]).toBeUndefined();
    expect(path(calls[0])).toBe("/v1/forms/frm_1/knowledge/upload");
  });
});

describe("integrations", () => {
  it("rotates through the same endpoint, with the flag set", async () => {
    const { calls, fetchImpl } = recorder();
    const cf = client(fetchImpl);
    await cf.forms.integrations.setSpreadsheet("frm_1", { includePartials: true });
    await cf.forms.integrations.rotateSpreadsheet("frm_1");
    expect(calls.every((c) => c.method === "PUT")).toBe(true);
    expect(JSON.parse(String(calls[0].body))).toEqual({ includePartials: true });
    expect(JSON.parse(String(calls[1].body))).toEqual({ rotate: true });
  });
});

describe("ai", () => {
  it("names the three endpoints", async () => {
    const { calls, fetchImpl } = recorder({ doc: {} });
    const cf = client(fetchImpl);
    await cf.ai.clarifyForm({ prompt: "p" });
    await cf.ai.generateForm({ prompt: "p", questionCount: 2 });
    await cf.ai.editForm({ formId: "frm_1", prompt: "p" });
    expect(calls.map((c) => path(c))).toEqual(["/v1/ai/clarify-form", "/v1/ai/generate-form", "/v1/ai/edit-form"]);
  });
});

describe("forms", () => {
  it("unpublishes and reads follow-up analytics", async () => {
    const { calls, fetchImpl } = recorder();
    const cf = client(fetchImpl);
    await cf.forms.unpublish("frm_1");
    await cf.forms.followupAnalytics("frm_1");
    expect(calls.map((c) => `${c.method} ${path(c)}`)).toEqual([
      "POST /v1/forms/frm_1/unpublish",
      "GET /v1/forms/frm_1/followup-analytics",
    ]);
  });

  /**
   * `get` reads the published form and `getDocument` reads the draft. A form
   * that has never been published answers 404 to the first, so the difference
   * between them is not cosmetic.
   */
  it("reads the draft through view=document", async () => {
    const { calls, fetchImpl } = recorder();
    await client(fetchImpl).forms.getDocument("frm_1");
    expect(path(calls[0])).toBe("/v1/forms/frm_1?view=document");
  });
});

describe("respondent auth", () => {
  it("separates identity from settling one answer", async () => {
    const { calls, fetchImpl } = recorder();
    const cf = client(fetchImpl);
    await cf.sessions.auth.google("chs_1", { idToken: "t" });
    await cf.sessions.auth.phone("chs_1", { idToken: "t" });
    await cf.sessions.verifyPhoneAnswer("chs_1", { idToken: "t" });
    expect(calls.map((c) => path(c))).toEqual([
      "/v1/sessions/chs_1/auth/google",
      "/v1/sessions/chs_1/auth/phone/token",
      "/v1/sessions/chs_1/verify/phone-token",
    ]);
  });

  /** The page is where the token is minted, so the page needs these. */
  it("is reachable from the browser client", async () => {
    const { calls, fetchImpl } = recorder();
    const cf = createBrowserClient({ publishableKey: "pk_live_test", fetch: fetchImpl });
    await cf.sessions.auth.google("chs_1", { idToken: "t" });
    await cf.sessions.verifyPhoneAnswer("chs_1", { idToken: "t" });
    expect(calls.map((c) => path(c))).toEqual([
      "/v1/sessions/chs_1/auth/google",
      "/v1/sessions/chs_1/verify/phone-token",
    ]);
  });
});
