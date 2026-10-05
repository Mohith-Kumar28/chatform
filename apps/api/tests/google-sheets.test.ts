import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { env } from "cloudflare:test";
import { applySchema, seedTenant, fetchApi, minimalDoc, type Tenant } from "./helpers.js";
import { readSheets, syncSheets } from "../src/lib/google-sheets.js";
import { webOrigins } from "../src/lib/origins.js";
import type { Bindings } from "../src/env.js";

/**
 * Google Sheets, end to end against a Google that lives in this file.
 *
 * The fake keeps real spreadsheets: tabs with a grid, cells, a frozen row. It refuses what
 * Google refuses (a write outside the grid, deleting the last unfrozen row), because those are
 * the mistakes a sync makes that no assertion on our own SQL would notice.
 */

interface FakeTab {
  sheetId: number;
  title: string;
  rowCount: number;
  columnCount: number;
  frozen: number;
  cells: string[][];
}
interface FakeSpreadsheet {
  id: string;
  title: string;
  tabs: FakeTab[];
}

const google = {
  sheets: new Map<string, FakeSpreadsheet>(),
  /** Set to make every refresh fail the way a revoked grant does. */
  revoked: false,
  scope: "openid email https://www.googleapis.com/auth/drive.file",
  calls: [] as string[],
  nextSheetId: 100,
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const bad = (status: number, message: string) => json({ error: { message, status: "INVALID_ARGUMENT" } }, status);

function cellText(cell: { userEnteredValue?: { stringValue?: string; formulaValue?: string } } | undefined): string {
  return cell?.userEnteredValue?.stringValue ?? cell?.userEnteredValue?.formulaValue ?? "";
}

function setCell(tab: FakeTab, row: number, col: number, value: string): void {
  if (row >= tab.rowCount || col >= tab.columnCount) throw new Error(`outside grid: ${tab.title} r${row} c${col}`);
  while (tab.cells.length <= row) tab.cells.push([]);
  const line = tab.cells[row]!;
  while (line.length <= col) line.push("");
  line[col] = value;
}

/** The index after the last row that holds anything. */
function lastRow(tab: FakeTab): number {
  for (let i = tab.cells.length - 1; i >= 0; i--) if (tab.cells[i]!.some((c) => c !== "")) return i + 1;
  return 0;
}

function meta(ss: FakeSpreadsheet) {
  return {
    spreadsheetId: ss.id,
    spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${ss.id}/edit`,
    sheets: ss.tabs.map((t) => ({
      properties: {
        // Google leaves a zero out of its JSON.
        ...(t.sheetId === 0 ? {} : { sheetId: t.sheetId }),
        title: t.title,
        gridProperties: { rowCount: t.rowCount, columnCount: t.columnCount },
      },
    })),
  };
}

function applyRequest(ss: FakeSpreadsheet, req: Record<string, any>): unknown {
  const tabOf = (id: number | undefined) => {
    const tab = ss.tabs.find((t) => t.sheetId === (id ?? 0));
    if (!tab) throw new Error(`no tab ${id}`);
    return tab;
  };
  if (req.addSheet) {
    const title = req.addSheet.properties.title as string;
    if (ss.tabs.some((t) => t.title === title)) throw new Error("duplicate title");
    const tab: FakeTab = { sheetId: google.nextSheetId++, title, rowCount: 1000, columnCount: 26, frozen: 0, cells: [] };
    ss.tabs.push(tab);
    return { addSheet: { properties: { sheetId: tab.sheetId, title } } };
  }
  if (req.updateCells) {
    const u = req.updateCells;
    if (u.range) {
      tabOf(u.range.sheetId).cells = [];
      return {};
    }
    const tab = tabOf(u.start.sheetId);
    (u.rows as { values: any[] }[]).forEach((r, i) =>
      r.values.forEach((cell, j) => setCell(tab, (u.start.rowIndex ?? 0) + i, (u.start.columnIndex ?? 0) + j, cellText(cell))),
    );
    return {};
  }
  if (req.appendCells) {
    const tab = tabOf(req.appendCells.sheetId);
    for (const r of req.appendCells.rows as { values: any[] }[]) {
      const at = lastRow(tab);
      if (at >= tab.rowCount) tab.rowCount = at + 1;
      r.values.forEach((cell, j) => setCell(tab, at, j, cellText(cell)));
    }
    return {};
  }
  if (req.appendDimension) {
    const tab = tabOf(req.appendDimension.sheetId);
    if (req.appendDimension.dimension === "ROWS") tab.rowCount += req.appendDimension.length;
    else tab.columnCount += req.appendDimension.length;
    return {};
  }
  if (req.deleteDimension) {
    const r = req.deleteDimension.range;
    const tab = tabOf(r.sheetId);
    if (tab.rowCount - (r.endIndex - r.startIndex) <= tab.frozen) throw new Error("cannot delete all non-frozen rows");
    tab.cells.splice(r.startIndex, r.endIndex - r.startIndex);
    tab.rowCount -= r.endIndex - r.startIndex;
    return {};
  }
  if (req.updateSheetProperties) {
    const p = req.updateSheetProperties.properties;
    tabOf(p.sheetId).frozen = p.gridProperties.frozenRowCount;
    return {};
  }
  if (req.repeatCell) return {};
  throw new Error(`fake Google does not implement ${Object.keys(req)[0]}`);
}

async function fakeGoogle(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const req = new Request(input as RequestInfo, init);
  const url = new URL(req.url);
  google.calls.push(`${req.method} ${url.host}${url.pathname}`);

  if (url.host === "oauth2.googleapis.com" && url.pathname === "/token") {
    const form = new URLSearchParams(await req.text());
    if (form.get("grant_type") === "refresh_token") {
      if (google.revoked) return json({ error: "invalid_grant", error_description: "Token has been expired or revoked." }, 400);
      return json({ access_token: `at_${crypto.randomUUID()}`, expires_in: 3600, scope: google.scope });
    }
    const payload = btoa(JSON.stringify({ email: "ada@gmail.com" })).replaceAll("=", "");
    return json({
      access_token: "at_first",
      refresh_token: "rt_first",
      expires_in: 3600,
      scope: google.scope,
      id_token: `h.${payload}.s`,
    });
  }
  if (url.host === "oauth2.googleapis.com" && url.pathname === "/revoke") return json({});
  if (url.host !== "sheets.googleapis.com") throw new Error(`unexpected fetch to ${req.url}`);
  if (!req.headers.get("authorization")?.startsWith("Bearer at_")) return bad(401, "no token");

  const path = url.pathname.replace("/v4/spreadsheets", "");
  if (path === "" && req.method === "POST") {
    const body = (await req.json()) as { properties: { title: string }; sheets: { properties: { title: string } }[] };
    const ss: FakeSpreadsheet = {
      id: `ss_${google.sheets.size + 1}`,
      title: body.properties.title,
      tabs: body.sheets.map((s, i) => ({
        sheetId: i === 0 ? 0 : google.nextSheetId++,
        title: s.properties.title,
        rowCount: 1000,
        columnCount: 26,
        frozen: 0,
        cells: [],
      })),
    };
    google.sheets.set(ss.id, ss);
    return json(meta(ss));
  }

  const [, id, rest] = /^\/([^/:]+)(.*)$/.exec(decodeURIComponent(path)) ?? [];
  const ss = id ? google.sheets.get(id) : undefined;
  if (!ss) return bad(404, "Requested entity was not found.");

  if (rest === "" && req.method === "GET") return json(meta(ss));
  if (rest === ":batchUpdate") {
    const body = (await req.json()) as { requests: Record<string, any>[] };
    // All or nothing, as Google applies a batch.
    const draft: FakeSpreadsheet = structuredClone(ss);
    try {
      const replies = body.requests.map((r) => applyRequest(draft, r));
      google.sheets.set(ss.id, draft);
      return json({ replies });
    } catch (err) {
      return bad(400, (err as Error).message);
    }
  }
  if (rest === "/values:batchGetByDataFilter") {
    const body = (await req.json()) as { dataFilters: { gridRange: Record<string, number> }[] };
    const valueRanges = [];
    for (const filter of body.dataFilters) {
      const g = filter.gridRange;
      const tab = ss.tabs.find((t) => t.sheetId === (g.sheetId ?? 0));
      if (!tab) return bad(400, `No grid with id: ${g.sheetId}`);
      const rows = tab.cells.slice(0, lastRow(tab));
      const values = g.endRowIndex === 1 ? rows.slice(0, 1) : rows.map((r) => (r[0] ? [r[0]] : []));
      const { sheetId, ...range } = g;
      valueRanges.push({ valueRange: { values }, dataFilters: [{ gridRange: sheetId ? g : range }] });
    }
    return json({ valueRanges });
  }
  if (rest?.startsWith("/values/") && req.method === "PUT") {
    const range = rest.slice("/values/".length);
    const [, title, row] = /^'(.*)'!A(\d+)$/.exec(range) ?? [];
    const tab = ss.tabs.find((t) => t.title === title?.replaceAll("''", "'"));
    if (!tab || !row) return bad(400, `Unable to parse range: ${range}`);
    const body = (await req.json()) as { values: string[][] };
    try {
      body.values.forEach((r, i) => r.forEach((v, j) => setCell(tab, Number(row) - 1 + i, j, v)));
    } catch (err) {
      return bad(400, `Range exceeds grid limits: ${(err as Error).message}`);
    }
    return json({});
  }
  return bad(404, `fake Google has no ${req.method} ${path}`);
}

// ─────────────────────────────── fixtures ───────────────────────────────

let t: Tenant;
const E = env as unknown as Bindings;

function tab(title: string): FakeTab {
  const ss = [...google.sheets.values()].at(-1)!;
  return ss.tabs.find((x) => x.title === title)!;
}
const rowsOf = (title: string) => tab(title).cells.slice(0, lastRow(tab(title)));
const idsOf = (title: string) => rowsOf(title).slice(1).map((r) => r[0]);

async function addResponse(id: string, status: "completed" | "in_progress", email: string, at = Date.now()): Promise<void> {
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO submissions (id, form_id, form_version_id, organization_id, session_id, status, started_at, completed_at)
       VALUES (?, ?, 'ver_gs', ?, ?, ?, ?, ?)`,
    ).bind(id, t.formId, t.orgId, `chs_${id}`, status, at - 1000, status === "completed" ? at : null),
    env.DB.prepare(
      `INSERT INTO submission_answers (id, submission_id, form_id, block_ref, block_type, value_json, updated_at)
       VALUES (?, ?, ?, 'q_email', 'email', ?, ?)`,
    ).bind(`ans_${id}`, id, t.formId, JSON.stringify(email), at),
  ]);
}

async function subscribePro(orgId: string): Promise<void> {
  const { PLANS } = await import("@repo/entitlements");
  const { invalidateEntitlements } = await import("../src/lib/entitlements.js");
  await env.DB.prepare(
    `INSERT INTO plans (id, slug, name, price_monthly_cents, price_yearly_cents, currency, features_json, limits_json, is_active, sort_order)
     VALUES ('pro', 'pro', 'Pro', ?, ?, 'USD', ?, ?, 1, 1) ON CONFLICT (id) DO NOTHING`,
  )
    .bind(PLANS.pro.priceMonthlyCents, PLANS.pro.priceYearlyCents, JSON.stringify(PLANS.pro.features), JSON.stringify(PLANS.pro.limits))
    .run();
  await env.DB.prepare(
    `INSERT INTO subscriptions (id, organization_id, plan_id, dodo_subscription_id, cycle, status,
                                current_period_start, current_period_end, seats, created_at, updated_at)
     VALUES (?, ?, 'pro', ?, 'monthly', 'active', ?, ?, 1, ?, ?)`,
  )
    .bind(`sub_gs_${orgId}`, orgId, `dodo_gs_${orgId}`, Date.now() - 1000, Date.now() + 86_400_000 * 20, Date.now(), Date.now())
    .run();
  await invalidateEntitlements(E, orgId);
}

/** One of the app's own origins, whatever this run's environment calls it. */
const WEB = () => webOrigins(E)[0]!;
const RETURN_TO = () => `${WEB()}/forms/frm_gsheets/integrate`;

async function start(formId = t.formId): Promise<{ url?: string; connected?: boolean }> {
  const res = await fetchApi(`/api/forms/${formId}/integrations/google-sheets/start`, {
    method: "POST",
    headers: { cookie: t.cookie, "content-type": "application/json" },
    body: JSON.stringify({ returnTo: RETURN_TO() }),
  });
  expect(res.status).toBe(200);
  return res.json();
}

async function connect(): Promise<Response> {
  const { url } = await start();
  const state = new URL(url!).searchParams.get("state")!;
  return fetchApi(`/api/integrations/google-sheets/callback?code=abc&state=${state}`, { headers: { cookie: t.cookie } });
}

async function listed(): Promise<Record<string, unknown> | undefined> {
  const res = await fetchApi(`/api/forms/${t.formId}/integrations`, { headers: { cookie: t.cookie } });
  const rows = await res.json<Record<string, unknown>[]>();
  return rows.find((r) => r.provider === "google_sheets");
}

beforeAll(async () => {
  await applySchema();
  t = await seedTenant("gsheets");
  E.GOOGLE_SHEETS_CLIENT_ID = "client.apps.googleusercontent.com";
  E.GOOGLE_SHEETS_CLIENT_SECRET = "secret";
  vi.stubGlobal("fetch", fakeGoogle);

  const now = Date.now();
  await env.DB.prepare(
    `INSERT INTO form_versions (id, form_id, version, schema_json, checksum, published_at, created_by, created_at)
     VALUES ('ver_gs', ?, 1, ?, 'sum', ?, ?, ?)`,
  )
    .bind(t.formId, JSON.stringify(minimalDoc("gsheets")), now, t.userId, now)
    .run();
  await addResponse("sbm_gs_done", "completed", "ada@lovelace.dev", now - 5000);
  await addResponse("sbm_gs_part", "in_progress", "=cmd|' /C calc'!A0", now - 4000);
});

afterAll(() => vi.unstubAllGlobals());

describe("connecting Google Sheets", () => {
  it("sends the author to Google asking only for the files this app creates", async () => {
    const { url } = await start();
    const consent = new URL(url!);
    expect(consent.origin + consent.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(consent.searchParams.get("scope")).toBe("openid email https://www.googleapis.com/auth/drive.file");
    expect(consent.searchParams.get("access_type")).toBe("offline");
    expect(consent.searchParams.get("redirect_uri")).toBe(`${E.APP_ORIGIN}/api/integrations/google-sheets/callback`);
  });

  it("refuses a callback finished by somebody else, and a state used twice", async () => {
    const other = await seedTenant("gsheets_other");
    const { url } = await start();
    const state = new URL(url!).searchParams.get("state")!;
    const path = `/api/integrations/google-sheets/callback?code=abc&state=${state}`;

    const stranger = await fetchApi(path, { headers: { cookie: other.cookie } });
    expect(stranger.status).toBe(302);
    expect(stranger.headers.get("location")).toContain("reason=session_mismatch");
    expect(await readSheets(E, t.formId)).toBeNull();

    const replay = await fetchApi(path, { headers: { cookie: t.cookie } });
    expect(replay.headers.get("location")).toContain("reason=state_used");
  });

  it("does not connect when the permission was unticked at Google", async () => {
    google.scope = "openid email";
    const res = await connect();
    google.scope = "openid email https://www.googleapis.com/auth/drive.file";
    expect(res.headers.get("location")).toContain("reason=permission_not_granted");
    expect(await readSheets(E, t.formId)).toBeNull();
  });

  it("creates a sheet with the responses in it, and an upgrade note where partials would be", async () => {
    const res = await connect();
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(`${RETURN_TO()}?sheets=connected`);

    const ss = [...google.sheets.values()].at(-1)!;
    expect(ss.title).toContain("(Chatform responses)");
    expect(ss.tabs.map((x) => x.title)).toEqual(["Completed", "Partial"]);

    const completed = rowsOf("Completed");
    expect(completed[0]).toContain("Email? (q_email)");
    expect(idsOf("Completed")).toEqual(["sbm_gs_done"]);
    expect(completed[1]).toContain("ada@lovelace.dev");
    expect(tab("Completed").frozen).toBe(1);

    // Free plan: no unfinished response reaches the sheet, only where to get them.
    const partial = rowsOf("Partial");
    expect(partial).toHaveLength(2);
    expect(partial[1]![0]).toBe(`=HYPERLINK("${WEB()}/pricing","Upgrade your plan to see them here")`);
    expect(JSON.stringify(partial)).not.toContain("sbm_gs_part");
  });

  it("lists the connection without any token", async () => {
    const row = (await listed())!;
    expect(row.status).toBe("connected");
    expect(row.email).toBe("ada@gmail.com");
    expect(row.spreadsheetUrl).toContain("docs.google.com/spreadsheets/d/");
    expect(row.partialsLocked).toBe(true);
    expect(typeof row.lastSyncedAt).toBe("number");
    expect(JSON.stringify(row)).not.toMatch(/rt_first|at_first|TokenEnc/);

    const stored = await env.DB.prepare(`SELECT config_json FROM integrations WHERE form_id = ? AND provider = 'google_sheets'`)
      .bind(t.formId)
      .first<{ config_json: string }>();
    expect(stored!.config_json).not.toContain("rt_first");
  });
});

describe("keeping the sheet current", () => {
  it("appends a new response once, however many times it is told about it", async () => {
    await addResponse("sbm_gs_two", "completed", "grace@hopper.dev");
    expect(await syncSheets(E, t.formId, { submissionId: "sbm_gs_two" })).toBe("ok");
    expect(await syncSheets(E, t.formId, { submissionId: "sbm_gs_two" })).toBe("ok");
    expect(idsOf("Completed")).toEqual(["sbm_gs_done", "sbm_gs_two"]);
  });

  it("leaves unfinished responses out while the plan does not include them", async () => {
    expect(await syncSheets(E, t.formId, { submissionId: "sbm_gs_part" })).toBe("ok");
    expect(rowsOf("Partial")).toHaveLength(2);
  });

  it("fills the Partial tab when the plan starts including them", async () => {
    await subscribePro(t.orgId);
    await addResponse("sbm_gs_three", "completed", "alan@turing.dev");
    expect(await syncSheets(E, t.formId, { submissionId: "sbm_gs_three" })).toBe("ok");

    expect(idsOf("Partial")).toEqual(["sbm_gs_part"]);
    expect(idsOf("Completed")).toEqual(["sbm_gs_done", "sbm_gs_two", "sbm_gs_three"]);
    // Stored as the text it is. Nothing a respondent typed runs as a formula.
    expect(rowsOf("Partial")[1]).toContain("=cmd|' /C calc'!A0");
    expect((await listed())!.partialsLocked).toBe(false);
  });

  it("moves a response from Partial to Completed when it is finished", async () => {
    await env.DB.prepare(`UPDATE submissions SET status = 'completed', completed_at = ? WHERE id = 'sbm_gs_part'`)
      .bind(Date.now())
      .run();
    expect(await syncSheets(E, t.formId, { submissionId: "sbm_gs_part" })).toBe("ok");
    expect(idsOf("Partial")).toEqual([]);
    expect(idsOf("Completed")).toContain("sbm_gs_part");
    // The last row under a frozen header went, and Google would have refused that.
    expect(tab("Partial").rowCount).toBeGreaterThan(1);
  });

  it("writes several waiting responses in one pass", async () => {
    await addResponse("sbm_gs_p1", "in_progress", "one@example.com");
    await addResponse("sbm_gs_p2", "in_progress", "two@example.com");
    await env.DB.prepare(
      `UPDATE integrations SET config_json = json_set(config_json, '$.pending', json('["sbm_gs_p1"]')) WHERE form_id = ?`,
    )
      .bind(t.formId)
      .run();
    google.calls.length = 0;
    expect(await syncSheets(E, t.formId, { submissionId: "sbm_gs_p2" })).toBe("ok");
    expect(idsOf("Partial")).toEqual(["sbm_gs_p1", "sbm_gs_p2"]);
    expect(google.calls.filter((c) => c.endsWith(":batchUpdate"))).toHaveLength(1);
    expect((await readSheets(E, t.formId))!.config.pending).toEqual([]);
  });

  it("steps aside while another writer holds the sheet, and leaves its response on the list", async () => {
    await env.DB.prepare(`UPDATE integrations SET config_json = json_set(config_json, '$.lockUntil', ?) WHERE form_id = ?`)
      .bind(Date.now() + 30_000, t.formId)
      .run();
    expect(await syncSheets(E, t.formId, { submissionId: "sbm_gs_p1" })).toBe("busy");
    expect((await readSheets(E, t.formId))!.config.pending).toEqual(["sbm_gs_p1"]);
    await env.DB.prepare(`UPDATE integrations SET config_json = json_set(config_json, '$.lockUntil', 0) WHERE form_id = ?`)
      .bind(t.formId)
      .run();
    expect(await syncSheets(E, t.formId)).toBe("ok");
    expect((await readSheets(E, t.formId))!.config.pending).toEqual([]);
  });

  it("adds a new question as a column on the end and keeps the author's own column", async () => {
    const completed = tab("Completed");
    const notes = completed.cells[0]!.length;
    // The author inserting a column of their own.
    completed.columnCount++;
    setCell(completed, 0, notes, "My notes");
    setCell(completed, 1, notes, "call back Tuesday");

    const doc = minimalDoc("gsheets");
    doc.blocks.push({ id: "blk_gsheets3", ref: "q_city", type: "short_text", title: "City?", required: false });
    await env.DB.prepare(`UPDATE forms SET working_schema = ? WHERE id = ?`).bind(JSON.stringify(doc), t.formId).run();
    await env.DB.prepare(
      `INSERT INTO submission_answers (id, submission_id, form_id, block_ref, block_type, value_json, updated_at)
       VALUES ('ans_city', 'sbm_gs_done', ?, 'q_city', 'short_text', '"Pune"', ?)`,
    )
      .bind(t.formId, Date.now())
      .run();

    expect(await syncSheets(E, t.formId, { submissionId: "sbm_gs_done" })).toBe("ok");
    const header = rowsOf("Completed")[0]!;
    expect(header[notes]).toBe("My notes");
    expect(header.at(-1)).toBe("City? (q_city)");
    const first = rowsOf("Completed")[1]!;
    expect(first[0]).toBe("sbm_gs_done");
    expect(first[notes]).toBe("call back Tuesday");
    expect(first[header.length - 1]).toBe("Pune");
  });

  it("puts back a tab the author deleted", async () => {
    const ss = [...google.sheets.values()].at(-1)!;
    ss.tabs = ss.tabs.filter((x) => x.title !== "Partial");
    expect(await syncSheets(E, t.formId, { submissionId: "sbm_gs_p1" })).toBe("ok");
    expect(idsOf("Partial")).toEqual(["sbm_gs_p1", "sbm_gs_p2"]);
  });

  it("Sync now rewrites both tabs and drops a response that was deleted", async () => {
    await env.DB.prepare(`DELETE FROM submissions WHERE id = 'sbm_gs_two'`).run();
    const res = await fetchApi(`/api/forms/${t.formId}/integrations/google-sheets/sync`, {
      method: "POST",
      headers: { cookie: t.cookie },
    });
    expect(res.status).toBe(200);
    expect(idsOf("Completed")).not.toContain("sbm_gs_two");
    expect(idsOf("Completed")[0]).toBe("sbm_gs_done");
  });

  it("connects a second form of the same person without a second consent", async () => {
    const now = Date.now();
    await env.DB.prepare(
      `INSERT INTO forms (id, organization_id, workspace_id, slug, title, status, working_schema, fingerprint_salt, created_by, created_at, updated_at)
       SELECT 'frm_gsheets_b', organization_id, workspace_id, 'gsheets-b', 'Second', status, working_schema, fingerprint_salt, created_by, ?, ?
         FROM forms WHERE id = ?`,
    )
      .bind(now, now, t.formId)
      .run();
    const before = google.sheets.size;
    expect(await start("frm_gsheets_b")).toEqual({ connected: true });
    expect(google.sheets.size).toBe(before + 1);
    expect((await readSheets(E, "frm_gsheets_b"))!.config.email).toBe("ada@gmail.com");
    await env.DB.prepare(`DELETE FROM integrations WHERE form_id = 'frm_gsheets_b'`).run();
  });
});

describe("when Google stops honouring the connection", () => {
  it("asks for a reconnect rather than retrying forever", async () => {
    await env.DB.prepare(
      `UPDATE integrations SET config_json = json_set(config_json, '$.accessExpiresAt', 0) WHERE form_id = ?`,
    )
      .bind(t.formId)
      .run();
    google.revoked = true;
    expect(await syncSheets(E, t.formId, { submissionId: "sbm_gs_done" })).toBe("needs_reconnect");
    const row = (await listed())!;
    expect(row.status).toBe("needs_reconnect");
    expect(row.lastError).toBe("Google access was removed or expired.");
    // Nothing more is attempted until the author reconnects.
    expect(await syncSheets(E, t.formId, { submissionId: "sbm_gs_done" })).toBe("needs_reconnect");
    google.revoked = false;
  });

  it("reconnecting keeps the same spreadsheet", async () => {
    const before = (await readSheets(E, t.formId))!.config.spreadsheetId;
    const res = await connect();
    expect(res.headers.get("location")).toContain("sheets=connected");
    const row = (await readSheets(E, t.formId))!;
    expect(row.status).toBe("connected");
    expect(row.config.spreadsheetId).toBe(before);
  });

  it("disconnecting forgets the grant and leaves the sheet alone", async () => {
    const sheets = google.sheets.size;
    const res = await fetchApi(`/api/forms/${t.formId}/integrations/google-sheets`, {
      method: "DELETE",
      headers: { cookie: t.cookie },
    });
    expect(res.status).toBe(200);
    expect(await readSheets(E, t.formId)).toBeNull();
    expect(google.sheets.size).toBe(sheets);
    expect(google.calls.some((c) => c.endsWith("/revoke"))).toBe(true);
    expect(await syncSheets(E, t.formId, { submissionId: "sbm_gs_done" })).toBe("not_connected");
  });
});
