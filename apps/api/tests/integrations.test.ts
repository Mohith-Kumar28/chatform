import { describe, it, expect, beforeAll } from "vitest";
import { env } from "cloudflare:test";
import { applySchema, seedTenant, fetchApi, minimalDoc, type Tenant } from "./helpers.js";
import { buildXlsx } from "../src/lib/xlsx.js";

/**
 * The spreadsheet feed and the XLSX export.
 *
 * Both are new surfaces that hand tenant data to something that cannot
 * authenticate — a spreadsheet on a schedule, and a file on someone's desk — so
 * the things worth pinning down are the boundaries: a bad token is
 * indistinguishable from a revoked one, rotation actually invalidates, and the
 * workbook is a workbook rather than a CSV with a hopeful extension.
 */

let t: Tenant;

beforeAll(async () => {
  await applySchema();
  t = await seedTenant("integrations");

  const now = Date.now();
  await env.DB.prepare(
    `INSERT INTO form_versions (id, form_id, version, schema_json, checksum, published_at, created_by, created_at)
     VALUES ('ver_int', ?, 1, ?, 'sum', ?, ?, ?)`,
  )
    .bind(t.formId, JSON.stringify(minimalDoc("integrations")), now, t.userId, now)
    .run();

  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO submissions (id, form_id, form_version_id, organization_id, session_id, status, started_at, completed_at, duration_ms)
       VALUES ('sbm_int_done', ?, 'ver_int', ?, 'chs_int_a', 'completed', ?, ?, 3100)`,
    ).bind(t.formId, t.orgId, now - 4000, now),
    env.DB.prepare(
      `INSERT INTO submissions (id, form_id, form_version_id, organization_id, session_id, status, started_at)
       VALUES ('sbm_int_part', ?, 'ver_int', ?, 'chs_int_b', 'in_progress', ?)`,
    ).bind(t.formId, t.orgId, now - 1000),
    env.DB.prepare(
      `INSERT INTO submission_answers (id, submission_id, form_id, block_ref, block_type, value_json, updated_at)
       VALUES ('ans_int_1', 'sbm_int_done', ?, 'q_email', 'email', ?, ?)`,
    ).bind(t.formId, JSON.stringify("ada@lovelace.dev"), now),
  ]);
});

const auth = () => ({ cookie: t.cookie });
const json = () => ({ cookie: t.cookie, "content-type": "application/json" });

interface Feed {
  id: string;
  provider: string;
  feedUrl: string;
  includePartials: boolean;
}

async function createFeed(body: Record<string, unknown> = {}): Promise<Feed> {
  const res = await fetchApi(`/api/forms/${t.formId}/integrations/spreadsheet`, {
    method: "POST",
    headers: json(),
    body: JSON.stringify(body),
  });
  expect(res.status).toBe(200);
  return res.json<Feed>();
}

/** `…/p/feed/cff_x.csv` — the path a spreadsheet is given. */
function feedPath(feedUrl: string): string {
  return new URL(feedUrl).pathname;
}

describe("spreadsheet feed", () => {
  it("issues a feed URL and serves the responses as CSV", async () => {
    const feed = await createFeed();
    expect(feed.feedUrl).toMatch(/\/p\/feed\/cff_[0-9a-f]{48}\.csv$/);

    const res = await fetchApi(feedPath(feed.feedUrl));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/csv");

    const csv = await res.text();
    expect(csv).toContain("Email? (q_email)");
    expect(csv).toContain("ada@lovelace.dev");
    // Free plan, no partials asked for: the unfinished row stays out.
    expect(csv).not.toContain("sbm_int_part");
  });

  it("is idempotent — asking again returns the same URL", async () => {
    const first = await createFeed();
    const second = await createFeed();
    expect(second.feedUrl).toBe(first.feedUrl);
  });

  it("rotation invalidates the previous URL", async () => {
    const before = await createFeed();
    const after = await createFeed({ rotate: true });
    expect(after.feedUrl).not.toBe(before.feedUrl);

    expect((await fetchApi(feedPath(before.feedUrl))).status).toBe(404);
    expect((await fetchApi(feedPath(after.feedUrl))).status).toBe(200);
  });

  it("revocation stops it dead", async () => {
    const feed = await createFeed();
    const del = await fetchApi(`/api/forms/${t.formId}/integrations/spreadsheet`, {
      method: "DELETE",
      headers: auth(),
    });
    expect(del.status).toBe(200);
    expect((await fetchApi(feedPath(feed.feedUrl))).status).toBe(404);
  });

  it("answers 404 for a malformed token without touching the database", async () => {
    expect((await fetchApi("/p/feed/not-a-token.csv")).status).toBe(404);
    expect((await fetchApi("/p/feed/cff_short.csv")).status).toBe(404);
  });

  it("refuses partials on a plan that does not include them", async () => {
    const res = await fetchApi(`/api/forms/${t.formId}/integrations/spreadsheet`, {
      method: "POST",
      headers: json(),
      body: JSON.stringify({ includePartials: true }),
    });
    // The same gate the CSV export uses — a 402 carrying the upgrade envelope.
    expect(res.status).toBe(402);
  });

  it("needs a session", async () => {
    const res = await fetchApi(`/api/forms/${t.formId}/integrations`);
    expect(res.status).toBe(401);
  });
});

describe("xlsx export", () => {
  it("serves a workbook, not a CSV in disguise", async () => {
    const res = await fetchApi(`/api/forms/${t.formId}/submissions/export.xlsx`, {
      headers: auth(),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("spreadsheetml.sheet");
    expect(res.headers.get("content-disposition")).toContain(".xlsx");

    const bytes = new Uint8Array(await res.arrayBuffer());
    // "PK\x03\x04" — a ZIP local file header, which is what a .xlsx is.
    expect(Array.from(bytes.slice(0, 4))).toEqual([0x50, 0x4b, 0x03, 0x04]);
  });
});

/**
 * Read one entry back out of the workbook.
 *
 * Worth the twenty lines: the two things most likely to be wrong in a
 * hand-written XLSX are the ZIP framing and the cell types, and neither is
 * visible from the outside of a compressed archive.
 */
async function readEntry(zip: Uint8Array, name: string): Promise<string> {
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  const wanted = new TextEncoder().encode(name);

  for (let at = 0; at < zip.length - 30; at++) {
    if (view.getUint32(at, true) !== 0x04034b50) continue;
    const nameLength = view.getUint16(at + 26, true);
    const extraLength = view.getUint16(at + 28, true);
    const candidate = zip.subarray(at + 30, at + 30 + nameLength);
    if (candidate.length !== wanted.length) continue;
    if (!candidate.every((byte, i) => byte === wanted[i])) continue;

    const method = view.getUint16(at + 8, true);
    const compressedSize = view.getUint32(at + 18, true);
    const from = at + 30 + nameLength + extraLength;
    const payload = zip.subarray(from, from + compressedSize);
    if (method === 0) return new TextDecoder().decode(payload);

    const source = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(payload);
        controller.close();
      },
    });
    const inflated = source.pipeThrough(new DecompressionStream("deflate-raw"));
    return new Response(inflated).text();
  }
  throw new Error(`no entry named ${name}`);
}

describe("the workbook itself", () => {
  it("contains the parts Excel requires", async () => {
    const zip = await buildXlsx(["A"], [["1"]]);
    for (const part of [
      "[Content_Types].xml",
      "_rels/.rels",
      "xl/workbook.xml",
      "xl/_rels/workbook.xml.rels",
      "xl/styles.xml",
      "xl/worksheets/sheet1.xml",
    ]) {
      await expect(readEntry(zip, part)).resolves.toContain("<?xml");
    }
  });

  it("strips the control characters XML forbids outright", async () => {
    // A single 0x0B in an answer was enough to make the whole file unopenable,
    // with an error blaming the file rather than the byte.
    const sheet = await readEntry(
      await buildXlsx(["A"], [["ok\u000Bthen"]]),
      "xl/worksheets/sheet1.xml",
    );
    expect(sheet).toContain("okthen");
    expect(sheet).not.toContain("\u000B");
  });

  it("escapes markup in an answer rather than emitting it", async () => {
    const sheet = await readEntry(
      await buildXlsx(["A"], [["<script>&</script>"]]),
      "xl/worksheets/sheet1.xml",
    );
    expect(sheet).toContain("&lt;script&gt;&amp;&lt;/script&gt;");
  });

  it("writes numbers as numbers and near-numbers as text", async () => {
    const sheet = await readEntry(
      await buildXlsx(["N", "Phone", "Zero"], [["42", "0044 7700 900123", "007"]]),
      "xl/worksheets/sheet1.xml",
    );
    // 42 is a value; the other two keep their shape, leading zeros and all.
    expect(sheet).toContain('<c r="A2"><v>42</v></c>');
    expect(sheet).toContain("0044 7700 900123");
    expect(sheet).toContain(">007<");
  });

  it("bolds and freezes the header row", async () => {
    const sheet = await readEntry(await buildXlsx(["Title"], [["x"]]), "xl/worksheets/sheet1.xml");
    expect(sheet).toContain('s="1"');
    expect(sheet).toContain('state="frozen"');
  });
});
