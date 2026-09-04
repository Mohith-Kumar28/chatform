import { describe, it, expect, vi } from "vitest";
import { createClient } from "../src/index";
import { createBrowserClient } from "../src/browser";

/**
 * The two wrappers that do more than name a URL.
 *
 * `files.upload` hides a three-step protocol and `exports.download` hides a
 * poll loop, so what is worth testing is the orchestration: the right calls,
 * in the right order, with the right bodies — and that neither of them sends
 * an API key to a signed URL, which is the whole point of signing it.
 */

interface Call {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
}

function recorder(handler: (call: Call) => { status?: number; body: unknown }) {
  const calls: Call[] = [];
  const fetchImpl = vi.fn(async (input: URL | RequestInfo, init?: RequestInit) => {
    const call: Call = {
      url: String(input),
      method: init?.method ?? "GET",
      headers: (init?.headers ?? {}) as Record<string, string>,
      body: init?.body,
    };
    calls.push(call);
    const { status = 200, body } = handler(call);
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  });
  return { calls, fetchImpl: fetchImpl as unknown as typeof globalThis.fetch };
}

const BASE = "https://api.test";

describe("files.upload", () => {
  it("registers, PUTs the bytes, then confirms — in that order", async () => {
    const { calls, fetchImpl } = recorder((call) => {
      if (call.url.endsWith("/uploads/intent")) {
        return { body: { fileId: "file_1", uploadUrl: "/v1/sessions/chs_1/uploads/file_1" } };
      }
      return { body: { ok: true } };
    });

    const chatform = createClient({ apiKey: "sk_live_x", baseUrl: BASE, fetch: fetchImpl });
    const result = await chatform.files.upload("chs_1", {
      ref: "q_cv",
      filename: "cv.pdf",
      mime: "application/pdf",
      body: new Uint8Array([1, 2, 3, 4, 5]),
    });

    expect(result.fileId).toBe("file_1");
    expect(calls.map((c) => `${c.method} ${new URL(c.url).pathname}`)).toEqual([
      "POST /v1/sessions/chs_1/uploads/intent",
      "PUT /v1/sessions/chs_1/uploads/file_1",
      "POST /v1/sessions/chs_1/uploads/file_1/confirm",
    ]);

    // The declared size has to match the bytes, or the API rejects the PUT.
    expect(JSON.parse(calls[0]!.body as string)).toMatchObject({ ref: "q_cv", size: 5 });
    // Bytes go up raw — not JSON, not multipart — under the declared type.
    expect(calls[1]!.headers["content-type"]).toBe("application/pdf");
    expect(calls[1]!.body).toBeInstanceOf(Uint8Array);
  });

  it("measures a string body itself", async () => {
    const { calls, fetchImpl } = recorder((call) =>
      call.url.endsWith("/uploads/intent")
        ? { body: { fileId: "file_2", uploadUrl: "/v1/sessions/chs_1/uploads/file_2" } }
        : { body: { ok: true } },
    );
    const chatform = createClient({ apiKey: "sk_live_x", baseUrl: BASE, fetch: fetchImpl });
    // Four bytes, not four characters: the API compares against the object size.
    await chatform.files.upload("chs_1", { ref: "q_note", filename: "n.txt", mime: "text/plain", body: "héllo" });
    expect(JSON.parse(calls[0]!.body as string).size).toBe(6);
  });

  it("refuses a stream with no declared size rather than sending a wrong one", async () => {
    const { fetchImpl } = recorder(() => ({ body: {} }));
    const chatform = createClient({ apiKey: "sk_live_x", baseUrl: BASE, fetch: fetchImpl });
    await expect(
      chatform.files.upload("chs_1", {
        ref: "q_cv",
        filename: "cv.pdf",
        mime: "application/pdf",
        body: new ReadableStream(),
      }),
    ).rejects.toThrow(/size/i);
  });

  it("is reachable from the browser client, which cannot read files back", async () => {
    const { fetchImpl } = recorder((call) =>
      call.url.endsWith("/uploads/intent")
        ? { body: { fileId: "file_3", uploadUrl: "/v1/sessions/chs_1/uploads/file_3" } }
        : { body: { ok: true } },
    );
    const browser = createBrowserClient({ publishableKey: "pk_live_x", baseUrl: BASE, fetch: fetchImpl });
    await expect(
      browser.files.upload("chs_1", { ref: "q_cv", filename: "a.txt", mime: "text/plain", body: "hi" }),
    ).resolves.toMatchObject({ fileId: "file_3" });
    // A publishable key holds file:write and not file:read.
    expect("get" in browser.files).toBe(false);
  });
});

describe("exports", () => {
  it("polls until ready, then fetches the signed URL without the API key", async () => {
    const statuses = ["queued", "running", "ready"];
    let poll = 0;
    const { calls, fetchImpl } = recorder((call) => {
      const path = new URL(call.url).pathname;
      if (call.method === "POST") return { body: { id: "exp_1", object: "export", status: "queued" } };
      if (path === "/v1/exports/exp_1") {
        const status = statuses[Math.min(poll++, statuses.length - 1)]!;
        return {
          body: {
            id: "exp_1",
            object: "export",
            form_id: "frm_1",
            status,
            format: "csv",
            row_count: status === "ready" ? 12 : null,
            download_url: status === "ready" ? `${BASE}/d/export/exp_1?exp=1&sig=abc` : null,
            download_expires_at: null,
            bytes: null, error: null, created_at: 1, completed_at: null, expires_at: null,
          },
        };
      }
      return { body: "id,status\n" };
    });

    const chatform = createClient({ apiKey: "sk_live_x", baseUrl: BASE, fetch: fetchImpl });
    const res = await chatform.exports.download("frm_1", { format: "csv" }, undefined);
    expect(res.ok).toBe(true);

    const download = calls.at(-1)!;
    expect(new URL(download.url).pathname).toBe("/d/export/exp_1");
    // The signature is the credential. Sending the key too would put an
    // sk_live_ where it does not belong for no gain.
    expect(download.headers["x-api-key"]).toBeUndefined();
  }, 20_000);

  it("throws with the reason when an export fails", async () => {
    const { fetchImpl } = recorder((call) =>
      call.method === "POST"
        ? { body: { id: "exp_2", object: "export", status: "queued" } }
        : { body: { id: "exp_2", object: "export", status: "failed", error: "form_not_found", form_id: "frm_1", format: "csv", row_count: null, bytes: null, created_at: 1, completed_at: 1, expires_at: null, download_url: null, download_expires_at: null } },
    );
    const chatform = createClient({ apiKey: "sk_live_x", baseUrl: BASE, fetch: fetchImpl });
    await expect(chatform.exports.download("frm_1")).rejects.toThrow(/form_not_found/);
  });

  it("sends filters in the wire shape the API expects", async () => {
    const { calls, fetchImpl } = recorder(() => ({ body: { id: "exp_3", object: "export", status: "queued" } }));
    const chatform = createClient({ apiKey: "sk_live_x", baseUrl: BASE, fetch: fetchImpl });
    await chatform.exports.create("frm_1", { status: ["all"], mode: "all", createdAfter: 1700000000000 });
    expect(JSON.parse(calls[0]!.body as string)).toMatchObject({
      status: ["all"],
      mode: "all",
      created_after: 1700000000000,
    });
  });
});
