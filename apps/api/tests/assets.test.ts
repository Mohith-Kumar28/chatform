import { describe, it, expect, beforeAll } from "vitest";
import { env } from "cloudflare:test";
import { applySchema, seedTenant, fetchApi, type Tenant } from "./helpers.js";
import { downloadName } from "../src/routes/uploads.js";

/**
 * Builder assets, and File Drops in particular: any file an author hands out.
 *
 * What is pinned here is that the type is no longer the gate — the plan's
 * per-file limit is, on the declared length, before a byte is stored — and
 * that what comes back out is a sandboxed download under the author's name.
 */

let t: Tenant;
const MB = 1024 * 1024;

beforeAll(async () => {
  await applySchema();
  t = await seedTenant("assetsdrop");
});

function upload(body: BodyInit, opts: { filename: string; type?: string; length?: number }) {
  const len = opts.length ?? (typeof body === "string" ? new TextEncoder().encode(body).byteLength : (body as ArrayBuffer).byteLength);
  return fetchApi(`/api/assets?filename=${encodeURIComponent(opts.filename)}`, {
    method: "POST",
    headers: {
      cookie: t.cookie,
      "content-type": opts.type ?? "application/octet-stream",
      "content-length": String(len),
    },
    body,
  });
}

describe("POST /api/assets", () => {
  it("takes a type nobody listed — a zip, a .tsx — and stores it", async () => {
    const res = await upload("export const x = 1;\n", { filename: "widget.tsx", type: "" });
    expect(res.status).toBe(200);
    const asset = (await res.json()) as { fileId: string; mime: string; sizeBytes: number; filename: string };
    // An empty browser type is stored as bytes, which is what it is.
    expect(asset.mime).toBe("application/octet-stream");
    expect(asset.sizeBytes).toBe(20);
    expect(asset.filename).toBe("widget.tsx");

    const zip = await upload("PK", { filename: "kit.zip", type: "application/zip" });
    expect(zip.status).toBe(200);
  });

  it("refuses a file over the plan's limit on its declared length", async () => {
    // Free takes 5MB. The body is never read: the Content-Length is enough.
    const res = await upload("x", { filename: "big.bin", length: 6 * MB });
    expect(res.status).toBe(413);
    const body = (await res.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe("too_large");
    expect(body.error.message).toContain("5 MB");
  });

  it("does not let a body longer than its Content-Length through", async () => {
    const res = await upload("twelve bytes", { filename: "liar.txt", type: "text/plain", length: 4 });
    expect(res.status).toBe(400);
    const row = await env.DB.prepare(`SELECT COUNT(*) AS n FROM files WHERE filename = 'liar.txt'`).first<{ n: number }>();
    expect(row!.n).toBe(0);
  });

  it("refuses a request with no Content-Length", async () => {
    const res = await fetchApi(`/api/assets?filename=a.txt`, {
      method: "POST",
      headers: { cookie: t.cookie, "content-type": "text/plain" },
      body: "hi",
    });
    expect(res.status).toBe(411);
  });

  it("still takes the legacy multipart shape", async () => {
    const form = new FormData();
    form.append("file", new File(["gif"], "logo.gif", { type: "image/gif" }));
    const req = new Request("http://localhost/api/assets", { method: "POST", body: form });
    const buf = await req.arrayBuffer();
    const res = await fetchApi("/api/assets", {
      method: "POST",
      headers: {
        cookie: t.cookie,
        "content-type": req.headers.get("content-type")!,
        "content-length": String(buf.byteLength),
      },
      body: buf,
    });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { mime: string }).mime).toBe("image/gif");
  });
});

describe("GET /p/assets/:id", () => {
  it("serves a non-renderable file as a sandboxed download under the author's name", async () => {
    const up = await upload("<script>alert(1)</script>", { filename: "page.html", type: "text/html" });
    const { fileId } = (await up.json()) as { fileId: string };

    const plain = await fetchApi(`/p/assets/${fileId}`);
    expect(plain.headers.get("content-type")).toBe("application/octet-stream");
    expect(plain.headers.get("content-disposition")).toContain(`filename="page.html"`);
    expect(plain.headers.get("content-security-policy")).toContain("sandbox");

    const named = await fetchApi(`/p/assets/${fileId}?download=${encodeURIComponent("Landing page")}`);
    expect(named.headers.get("content-disposition")).toContain(`filename*=UTF-8''Landing%20page.html`);
  });

  it("keeps an image inline unless the download is asked for", async () => {
    const up = await upload("fakepng", { filename: "cat.png", type: "image/png" });
    const { fileId } = (await up.json()) as { fileId: string };
    const inline = await fetchApi(`/p/assets/${fileId}`);
    expect(inline.headers.get("content-type")).toBe("image/png");
    expect(inline.headers.get("content-disposition")).toBeNull();
    const asked = await fetchApi(`/p/assets/${fileId}?download=cat.png`);
    expect(asked.headers.get("content-disposition")).toMatch(/^attachment;/);
  });
});

describe("downloadName", () => {
  it("puts back the extension a rename dropped", () => {
    expect(downloadName("Price list", "prices_2026.pdf")).toBe("Price list.pdf");
    expect(downloadName("Price list.PDF", "prices_2026.pdf")).toBe("Price list.PDF");
  });

  it("falls back to the stored name, and strips path and control characters", () => {
    expect(downloadName(undefined, "a.zip")).toBe("a.zip");
    expect(downloadName("   ", "a.zip")).toBe("a.zip");
    expect(downloadName("../../etc\u0000/x", "a.zip")).toBe("....etcx.zip");
  });
});
