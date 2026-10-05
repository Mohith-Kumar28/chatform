import type { Bindings } from "../env.js";
import { getEntitlements } from "./entitlements.js";
import { webOrigins } from "./origins.js";
import { buildResponseTable, splitByCompletion, type ResponseTable } from "./response-table.js";
import { open, seal } from "./secret-box.js";
import type { WebhookEvent } from "./webhooks.js";

/**
 * Google Sheets, connected with Google's own consent screen.
 *
 * The author presses Connect, approves once at Google, and gets a spreadsheet in their own
 * Drive with two tabs: Completed and Partial. Every response is written to its tab when it
 * arrives, and moves from Partial to Completed when it is finished.
 *
 * Three decisions carry the rest of this file.
 *
 * The scope is `drive.file`. It reaches only files this app created, so Chatform can never read
 * the rest of anyone's Drive, and Google does not class it as a sensitive scope.
 *
 * Responses are written one row at a time, never by rewriting the sheet. A row is found by the
 * response id in column A and its cells are placed under the matching header text, so a column
 * the author added for their own notes is left alone, and a question added to the form becomes
 * a new column at the end. Only `rebuildSheet` rewrites a tab, and it runs on connect, on Sync
 * now, and when the plan starts or stops including unfinished responses.
 *
 * One writer per sheet. Two responses finishing together would each look for their row, both
 * miss it, and both append. So a change is first recorded on the row (`pending`), then whoever
 * holds the lease writes everything pending in one batch. A burst of responses is one write.
 *
 * The refresh token is `lib/secret-box.ts` ciphertext bound to the integration's id, the same
 * way a payment gateway's credentials are kept.
 */

export const SHEETS_PROVIDER = "google_sheets";
export const SHEETS_STATE_PROVIDER = "google_sheets";

const SCOPE = "https://www.googleapis.com/auth/drive.file";
const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const API = "https://sheets.googleapis.com/v4/spreadsheets";

/** How long one writer may hold a sheet before another presumes it died. */
const LEASE_MS = 60_000;
/** Responses written per pass. One read of the sheet and one write, whatever the count. */
const BATCH = 100;
/** Passes one message may run before it hands the rest to the next. */
const MAX_PASSES = 20;
/** Rows a rebuild writes: the newest of them, like an export. */
const REBUILD_CAP = 10_000;
/** Rows per `values.update` call in a rebuild. */
const REBUILD_CHUNK = 2_000;

/** The events that change what a response's row should say, or which tab it belongs in. */
const SYNCED_EVENTS = new Set([
  "response.completed",
  "submission.completed",
  "response.abandoned",
  "submission.abandoned",
  "response.disqualified",
  "response.partial",
  "response.resumed",
]);

export interface SheetsConfig {
  spreadsheetId: string;
  spreadsheetUrl: string;
  /** The spreadsheet's name in Drive as of the last rebuild. The author can rename it. */
  spreadsheetTitle?: string | null;
  /** The tabs by Google's own id, so renaming one in the sheet breaks nothing. */
  completedSheetId: number;
  partialSheetId: number;
  /** The Google account that approved, as shown on the consent screen. */
  email: string | null;
  /** The Chatform user who connected it. A second form of theirs connects without a second consent. */
  connectedBy: string;
  refreshTokenEnc: string;
  accessTokenEnc?: string | null;
  accessExpiresAt?: number | null;
  /** True while the Partial tab holds the upgrade note rather than responses. */
  partialsLocked: boolean;
  lastSyncedAt?: number | null;
  /** Response ids waiting to be written. Appended by anyone, drained by the lease holder. */
  pending: string[];
  lockUntil: number;
}

export interface SheetsRow {
  id: string;
  organization_id: string;
  form_id: string;
  status: string;
  last_error: string | null;
  created_at: number;
  config: SheetsConfig;
}

export interface SheetsMessage {
  kind: "sheets_sync";
  formId: string;
  submissionId: string;
}

export function isSheetsMessage(m: unknown): m is SheetsMessage {
  return typeof m === "object" && m !== null && (m as { kind?: unknown }).kind === "sheets_sync";
}

/** A Google answer that was not a success. `status` decides what happens next. */
export class GoogleError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code?: string,
  ) {
    super(message);
    this.name = "GoogleError";
  }
}

// ─────────────────────────────── the OAuth client ───────────────────────────────

type ClientEnv = Pick<
  Bindings,
  | "GOOGLE_SHEETS_CLIENT_ID"
  | "GOOGLE_SHEETS_CLIENT_SECRET"
  | "GOOGLE_DASHBOARD_CLIENT_ID"
  | "GOOGLE_DASHBOARD_CLIENT_SECRET"
>;

/**
 * Its own Google client when one is set, else the dashboard sign-in client.
 *
 * Sharing is safe here in a way it is not for respondent sign-in: nothing accepts a Sheets
 * access token as proof of who somebody is.
 */
function client(env: ClientEnv): { id: string; secret: string } | null {
  const id = env.GOOGLE_SHEETS_CLIENT_ID?.trim() || env.GOOGLE_DASHBOARD_CLIENT_ID?.trim();
  const secret = env.GOOGLE_SHEETS_CLIENT_SECRET?.trim() || env.GOOGLE_DASHBOARD_CLIENT_SECRET?.trim();
  return id && secret ? { id, secret } : null;
}

/** Whether Connect can be offered at all: a Google client, and a key to seal the token with. */
export function sheetsConfigured(env: Bindings): boolean {
  return client(env) !== null && Boolean(env.PAYMENTS_ENCRYPTION_KEY?.trim());
}

export function sheetsRedirectUri(env: Bindings): string {
  return `${env.APP_ORIGIN.replace(/\/$/, "")}/api/integrations/google-sheets/callback`;
}

export function sheetsAuthorizeUrl(env: Bindings, state: string): string {
  const url = new URL(AUTH_URL);
  url.searchParams.set("client_id", client(env)!.id);
  url.searchParams.set("redirect_uri", sheetsRedirectUri(env));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", `openid email ${SCOPE}`);
  // `offline` plus `consent` is what makes Google hand over a refresh token every time, not
  // only on the first approval.
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("state", state);
  return url.toString();
}

export interface GoogleTokens {
  accessToken: string;
  /** Epoch ms. */
  accessExpiresAt: number;
  refreshToken: string | null;
  email: string | null;
  scope: string;
}

async function tokenRequest(env: Bindings, params: Record<string, string>): Promise<GoogleTokens> {
  const c = client(env);
  if (!c) throw new GoogleError(503, "Google Sheets is not set up on this deployment");
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ ...params, client_id: c.id, client_secret: c.secret }).toString(),
  });
  const body = (await res.json().catch(() => ({}))) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
    id_token?: string;
    error?: string;
    error_description?: string;
  };
  if (!res.ok || !body.access_token) {
    throw new GoogleError(res.status || 502, body.error_description ?? body.error ?? "Google refused the token request", body.error);
  }
  return {
    accessToken: body.access_token,
    accessExpiresAt: Date.now() + (body.expires_in ?? 3600) * 1000,
    refreshToken: body.refresh_token ?? null,
    email: emailOf(body.id_token),
    scope: body.scope ?? "",
  };
}

/** The address in an ID token Google handed us directly. Not verified, because it never left TLS. */
function emailOf(idToken: string | undefined): string | null {
  const part = idToken?.split(".")[1];
  if (!part) return null;
  try {
    const bin = atob(part.replaceAll("-", "+").replaceAll("_", "/"));
    const bytes = Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
    const email = (JSON.parse(new TextDecoder().decode(bytes)) as { email?: unknown }).email;
    return typeof email === "string" ? email : null;
  } catch {
    return null;
  }
}

export function exchangeSheetsCode(env: Bindings, code: string): Promise<GoogleTokens> {
  return tokenRequest(env, { grant_type: "authorization_code", code, redirect_uri: sheetsRedirectUri(env) });
}

/** Google lets a person untick a permission on the consent screen. Without this one nothing works. */
export function grantsSheets(tokens: GoogleTokens): boolean {
  return tokens.scope.split(/\s+/).includes(SCOPE);
}

// ─────────────────────────────── the Sheets API ───────────────────────────────

async function google<T>(token: string, method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: { authorization: `Bearer ${token}`, ...(body === undefined ? {} : { "content-type": "application/json" }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: { message?: string; status?: string } };
    throw new GoogleError(res.status, err.error?.message ?? `Google answered ${res.status}`, err.error?.status);
  }
  return (await res.json().catch(() => ({}))) as T;
}

interface SheetProps {
  sheetId?: number;
  title?: string;
  gridProperties?: { rowCount?: number; columnCount?: number };
}
interface SpreadsheetMeta {
  spreadsheetId?: string;
  spreadsheetUrl?: string;
  properties?: { title?: string };
  sheets?: { properties?: SheetProps }[];
}

const META_FIELDS = "spreadsheetId,spreadsheetUrl,properties.title,sheets.properties(sheetId,title,gridProperties(rowCount,columnCount))";

function readMeta(token: string, spreadsheetId: string): Promise<SpreadsheetMeta> {
  return google<SpreadsheetMeta>(token, "GET", `${API}/${spreadsheetId}?fields=${encodeURIComponent(META_FIELDS)}`);
}

const TAB_TITLES = { completed: "Completed", partial: "Partial" } as const;

async function createSpreadsheet(token: string, formTitle: string): Promise<SpreadsheetMeta> {
  const title = `${formTitle.trim().slice(0, 120) || "Form"} (Chatform responses)`;
  return google<SpreadsheetMeta>(token, "POST", `${API}?fields=${encodeURIComponent(META_FIELDS)}`, {
    properties: { title },
    sheets: [{ properties: { title: TAB_TITLES.completed } }, { properties: { title: TAB_TITLES.partial } }],
  });
}

type Cell = { userEnteredValue?: { stringValue?: string; formulaValue?: string } };
const text = (value: string): Cell => (value === "" ? {} : { userEnteredValue: { stringValue: value } });

/** `'It''s a tab'!A1`: a tab's title, quoted for A1 notation. */
function a1(title: string, cell: string): string {
  return `'${title.replaceAll("'", "''")}'!${cell}`;
}

// ─────────────────────────────── the stored row ───────────────────────────────

export async function readSheets(env: Bindings, formId: string): Promise<SheetsRow | null> {
  const row = await env.DB.prepare(
    `SELECT id, organization_id, form_id, config_json, status, last_error, created_at FROM integrations
      WHERE form_id = ? AND provider = ? LIMIT 1`,
  )
    .bind(formId, SHEETS_PROVIDER)
    .first<Omit<SheetsRow, "config"> & { config_json: string }>();
  if (!row) return null;
  const { config_json, ...rest } = row;
  return { ...rest, config: JSON.parse(config_json) as SheetsConfig };
}

/** What the dashboard is told about a connection. Never a token. */
export function projectSheets(row: SheetsRow) {
  return {
    id: row.id,
    provider: SHEETS_PROVIDER,
    status: row.status,
    createdAt: row.created_at,
    spreadsheetUrl: row.config.spreadsheetUrl,
    spreadsheetTitle: row.config.spreadsheetTitle ?? null,
    email: row.config.email,
    lastSyncedAt: row.config.lastSyncedAt ?? null,
    lastError: row.last_error,
    partialsLocked: row.config.partialsLocked,
  };
}

/**
 * Merge `patch` into the stored config.
 *
 * A merge rather than an overwrite, because `pending` and `lockUntil` are written by other
 * requests while this one is talking to Google, and writing back a whole config read a second
 * ago would erase whatever they added.
 */
async function patchConfig(
  env: Bindings,
  id: string,
  patch: Partial<SheetsConfig>,
  state?: { status: string; lastError: string | null },
): Promise<void> {
  await env.DB.prepare(
    `UPDATE integrations SET config_json = json_patch(config_json, ?1), updated_at = ?2,
            status = COALESCE(?3, status), last_error = CASE WHEN ?3 IS NULL THEN last_error ELSE ?4 END
      WHERE id = ?5`,
  )
    .bind(JSON.stringify(patch), Date.now(), state?.status ?? null, state?.lastError ?? null, id)
    .run();
}

/** A usable access token, refreshed and re-sealed when the stored one is close to expiring. */
async function accessToken(env: Bindings, row: SheetsRow): Promise<string> {
  const cfg = row.config;
  if (cfg.accessTokenEnc && (cfg.accessExpiresAt ?? 0) > Date.now() + 60_000) {
    try {
      return await open(env, cfg.accessTokenEnc, row.id);
    } catch {
      // Sealed under a key that has since gone. The refresh below replaces it.
    }
  }
  const fresh = await tokenRequest(env, {
    grant_type: "refresh_token",
    refresh_token: await open(env, cfg.refreshTokenEnc, row.id),
  });
  cfg.accessTokenEnc = await seal(env, fresh.accessToken, row.id);
  cfg.accessExpiresAt = fresh.accessExpiresAt;
  await patchConfig(env, row.id, { accessTokenEnc: cfg.accessTokenEnc, accessExpiresAt: cfg.accessExpiresAt });
  return fresh.accessToken;
}

// ─────────────────────────────── connecting ───────────────────────────────

/**
 * Store a fresh grant for this form and make sure it has a spreadsheet.
 *
 * Reconnecting keeps the spreadsheet the form already had when the new grant can still open
 * it, so a reconnect after a revoked token does not leave the author with two sheets.
 */
export async function connectSheets(
  env: Bindings,
  input: {
    form: { id: string; organization_id: string; title: string };
    userId: string;
    accessToken: string;
    accessExpiresAt: number;
    refreshToken: string;
    email: string | null;
  },
): Promise<SheetsRow> {
  const existing = await readSheets(env, input.form.id);
  let meta: SpreadsheetMeta | null = null;
  if (existing?.config.spreadsheetId) {
    meta = await readMeta(input.accessToken, existing.config.spreadsheetId).catch(() => null);
  }
  meta ??= await createSpreadsheet(input.accessToken, input.form.title);
  if (!meta.spreadsheetId) throw new GoogleError(502, "Google did not return a spreadsheet");

  const id = existing?.id ?? `int_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`;
  const tabs = meta.sheets ?? [];
  const kept = existing && meta.spreadsheetId === existing.config.spreadsheetId ? existing.config : null;
  const config: SheetsConfig = {
    spreadsheetId: meta.spreadsheetId,
    spreadsheetUrl: meta.spreadsheetUrl ?? `https://docs.google.com/spreadsheets/d/${meta.spreadsheetId}/edit`,
    spreadsheetTitle: meta.properties?.title ?? kept?.spreadsheetTitle ?? null,
    // A tab that has gone missing is put back by the rebuild that follows.
    completedSheetId: kept?.completedSheetId ?? tabs[0]?.properties?.sheetId ?? 0,
    partialSheetId: kept?.partialSheetId ?? tabs[1]?.properties?.sheetId ?? -1,
    email: input.email ?? existing?.config.email ?? null,
    connectedBy: input.userId,
    refreshTokenEnc: await seal(env, input.refreshToken, id),
    accessTokenEnc: await seal(env, input.accessToken, id),
    accessExpiresAt: input.accessExpiresAt,
    partialsLocked: kept?.partialsLocked ?? false,
    lastSyncedAt: kept?.lastSyncedAt ?? null,
    pending: [],
    lockUntil: 0,
  };
  const now = Date.now();
  if (existing) {
    await env.DB.prepare(
      `UPDATE integrations SET config_json = ?, status = 'connected', last_error = NULL, updated_at = ? WHERE id = ?`,
    )
      .bind(JSON.stringify(config), now, id)
      .run();
  } else {
    await env.DB.prepare(
      `INSERT INTO integrations (id, organization_id, form_id, provider, config_json, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'connected', ?, ?)`,
    )
      .bind(id, input.form.organization_id, input.form.id, SHEETS_PROVIDER, JSON.stringify(config), now, now)
      .run();
  }
  return {
    id,
    organization_id: input.form.organization_id,
    form_id: input.form.id,
    status: "connected",
    last_error: null,
    created_at: existing?.created_at ?? now,
    config,
  };
}

/**
 * Connect a second form without a second trip to Google.
 *
 * One approval covers every sheet this app creates for that Google account, so when the same
 * person has already connected another form in this organization, its grant is borrowed.
 * Never another member's: the sheet would land in somebody else's Drive.
 */
export async function connectFromSibling(
  env: Bindings,
  form: { id: string; organization_id: string; title: string },
  userId: string,
): Promise<SheetsRow | null> {
  const sibling = await env.DB.prepare(
    `SELECT id, config_json FROM integrations
      WHERE organization_id = ?1 AND provider = ?2 AND status = 'connected' AND form_id != ?3
        AND json_extract(config_json, '$.connectedBy') = ?4
      ORDER BY updated_at DESC LIMIT 1`,
  )
    .bind(form.organization_id, SHEETS_PROVIDER, form.id, userId)
    .first<{ id: string; config_json: string }>();
  if (!sibling) return null;
  try {
    const cfg = JSON.parse(sibling.config_json) as SheetsConfig;
    const refreshToken = await open(env, cfg.refreshTokenEnc, sibling.id);
    const fresh = await tokenRequest(env, { grant_type: "refresh_token", refresh_token: refreshToken });
    return await connectSheets(env, {
      form,
      userId,
      accessToken: fresh.accessToken,
      accessExpiresAt: fresh.accessExpiresAt,
      refreshToken,
      email: cfg.email,
    });
  } catch (err) {
    // Whatever went wrong, the consent screen is the answer to it.
    console.warn("sheets_sibling_connect_failed", { formId: form.id, message: err instanceof Error ? err.message : String(err) });
    return null;
  }
}

/**
 * Remove the connection. The spreadsheet stays in the author's Drive: it is theirs.
 *
 * The grant is revoked at Google only when no other form uses the same Google account, because
 * revoking one token there revokes the whole approval, and every other form's sheet with it.
 */
export async function disconnectSheets(env: Bindings, formId: string): Promise<void> {
  const row = await readSheets(env, formId);
  if (!row) return;
  await env.DB.prepare(`DELETE FROM integrations WHERE id = ?`).bind(row.id).run();
  try {
    const shared = await env.DB.prepare(
      `SELECT 1 FROM integrations
        WHERE organization_id = ?1 AND provider = ?2
          AND COALESCE(json_extract(config_json, '$.email'), '') = ?3
        LIMIT 1`,
    )
      .bind(row.organization_id, SHEETS_PROVIDER, row.config.email ?? "")
      .first();
    if (shared) return;
    const token = await open(env, row.config.refreshTokenEnc, row.id);
    await fetch(`${REVOKE_URL}?token=${encodeURIComponent(token)}`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
    });
  } catch (err) {
    console.warn("sheets_revoke_failed", { formId, message: err instanceof Error ? err.message : String(err) });
  }
}

// ─────────────────────────────── writing ───────────────────────────────

interface Tab {
  key: "completed" | "partial";
  sheetId: number;
}

function tabsOf(cfg: SheetsConfig): Tab[] {
  return [
    { key: "completed", sheetId: cfg.completedSheetId },
    { key: "partial", sheetId: cfg.partialSheetId },
  ];
}

/** Put back a tab the author deleted, under a title nothing else in the spreadsheet is using. */
async function ensureTabs(token: string, cfg: SheetsConfig, meta: SpreadsheetMeta): Promise<Map<number, SheetProps>> {
  const byId = new Map<number, SheetProps>();
  for (const s of meta.sheets ?? []) byId.set(s.properties?.sheetId ?? 0, s.properties ?? {});
  const taken = new Set([...byId.values()].map((p) => p.title));
  for (const tab of tabsOf(cfg)) {
    if (byId.has(tab.sheetId)) continue;
    let title: string = TAB_TITLES[tab.key];
    for (let n = 2; taken.has(title); n++) title = `${TAB_TITLES[tab.key]} ${n}`;
    const res = await google<{ replies?: { addSheet?: { properties?: SheetProps } }[] }>(
      token,
      "POST",
      `${API}/${cfg.spreadsheetId}:batchUpdate`,
      { requests: [{ addSheet: { properties: { title } } }] },
    );
    const props = res.replies?.[0]?.addSheet?.properties;
    if (props?.sheetId === undefined) throw new GoogleError(502, "Google did not create the tab");
    if (tab.key === "completed") cfg.completedSheetId = props.sheetId;
    else cfg.partialSheetId = props.sheetId;
    byId.set(props.sheetId, props);
    taken.add(title);
  }
  return byId;
}

/**
 * Rewrite both tabs from the responses as they are now.
 *
 * Oldest first, so the rows that arrive afterwards continue down the sheet in the order they
 * came in. Anything typed into these two tabs by hand is replaced; the author's own tabs in the
 * same spreadsheet are never touched.
 */
async function rebuildSheet(env: Bindings, row: SheetsRow, token: string, partialsOpen: boolean): Promise<void> {
  const cfg = row.config;
  const meta = await readMeta(token, cfg.spreadsheetId);
  if (meta.properties?.title) cfg.spreadsheetTitle = meta.properties.title;
  const props = await ensureTabs(token, cfg, meta);
  const table = await buildResponseTable(env, row.form_id, { includePartials: partialsOpen, raw: true, limit: REBUILD_CAP });
  if (!table) throw new GoogleError(404, "This form no longer exists");
  const split = splitByCompletion(table);

  const requests: unknown[] = [];
  const writes: { title: string; values: string[][] }[] = [];
  for (const tab of tabsOf(cfg)) {
    const p = props.get(tab.sheetId)!;
    const locked = tab.key === "partial" && !partialsOpen;
    const half: ResponseTable = split[tab.key];
    const values = locked ? [] : [half.header, ...[...half.rows].reverse()];
    const needRows = Math.max(values.length, 2) - (p.gridProperties?.rowCount ?? 1000);
    const needCols = Math.max(half.header.length, 1) - (p.gridProperties?.columnCount ?? 26);

    requests.push({ updateCells: { range: { sheetId: tab.sheetId }, fields: "userEnteredValue" } });
    if (needRows > 0) requests.push({ appendDimension: { sheetId: tab.sheetId, dimension: "ROWS", length: needRows } });
    if (needCols > 0) requests.push({ appendDimension: { sheetId: tab.sheetId, dimension: "COLUMNS", length: needCols } });
    requests.push({
      updateSheetProperties: {
        properties: { sheetId: tab.sheetId, gridProperties: { frozenRowCount: locked ? 0 : 1 } },
        fields: "gridProperties.frozenRowCount",
      },
    });
    requests.push({
      repeatCell: {
        range: { sheetId: tab.sheetId, startRowIndex: 0, endRowIndex: 1 },
        cell: { userEnteredFormat: { textFormat: { bold: true } } },
        fields: "userEnteredFormat.textFormat.bold",
      },
    });
    if (locked) {
      requests.push({
        updateCells: {
          start: { sheetId: tab.sheetId, rowIndex: 0, columnIndex: 0 },
          rows: lockedNote(env).map((cell) => ({ values: [cell] })),
          fields: "userEnteredValue",
        },
      });
    } else {
      writes.push({ title: p.title ?? TAB_TITLES[tab.key], values });
    }
  }
  await google(token, "POST", `${API}/${cfg.spreadsheetId}:batchUpdate`, { requests });

  for (const write of writes) {
    for (let at = 0; at < write.values.length; at += REBUILD_CHUNK) {
      const range = a1(write.title, `A${at + 1}`);
      // RAW: every cell is stored as the text it is. Nothing a respondent typed is run as a
      // formula, and a phone number keeps its leading zero.
      await google(token, "PUT", `${API}/${cfg.spreadsheetId}/values/${encodeURIComponent(range)}?valueInputOption=RAW`, {
        range,
        majorDimension: "ROWS",
        values: write.values.slice(at, at + REBUILD_CHUNK),
      });
    }
  }
  cfg.partialsLocked = !partialsOpen;
}

/** What the Partial tab says on a plan without unfinished responses: one line, and where to change it. */
function lockedNote(env: Bindings): Cell[] {
  const pricing = `${webOrigins(env)[0]!}/pricing`;
  return [
    { userEnteredValue: { stringValue: "Unfinished responses are not included in your current Chatform plan." } },
    { userEnteredValue: { formulaValue: `=HYPERLINK("${pricing}","Upgrade your plan to see them here")` } },
  ];
}

interface TabState {
  header: string[];
  /** Column A, top to bottom. Index 0 is the header row. */
  ids: string[];
}

async function readTabs(token: string, cfg: SheetsConfig, tabs: Tab[]): Promise<Map<number, TabState>> {
  const res = await google<{
    valueRanges?: {
      valueRange?: { values?: unknown[][] };
      dataFilters?: { gridRange?: { sheetId?: number; endRowIndex?: number } }[];
    }[];
  }>(token, "POST", `${API}/${cfg.spreadsheetId}/values:batchGetByDataFilter`, {
    majorDimension: "ROWS",
    dataFilters: tabs.flatMap((tab) => [
      { gridRange: { sheetId: tab.sheetId, startRowIndex: 0, endRowIndex: 1 } },
      { gridRange: { sheetId: tab.sheetId, startColumnIndex: 0, endColumnIndex: 1 } },
    ]),
  });
  const out = new Map<number, TabState>(tabs.map((tab) => [tab.sheetId, { header: [], ids: [] }]));
  (res.valueRanges ?? []).forEach((match, i) => {
    // Named by the filter Google says it matched. Position is only the fallback, and a sheet
    // id of zero is left out of the echo like any other default.
    const echoed = match.dataFilters?.[0]?.gridRange;
    const sheetId = echoed ? (echoed.sheetId ?? 0) : tabs[Math.floor(i / 2)]?.sheetId;
    const isHeader = echoed ? echoed.endRowIndex === 1 : i % 2 === 0;
    const state = sheetId === undefined ? undefined : out.get(sheetId);
    if (!state) return;
    const values = match.valueRange?.values ?? [];
    if (isHeader) state.header = (values[0] ?? []).map((v) => String(v ?? ""));
    else state.ids = values.map((r) => String(r?.[0] ?? ""));
  });
  return out;
}

/**
 * Write these responses to the tab each belongs in, and take them out of the other.
 *
 * Decided from what the response is now, not from which event arrived: a completed response is
 * a row in Completed and no row in Partial, whatever order the events were delivered in, and a
 * response that no longer exists is a row in neither.
 */
async function writeResponses(
  env: Bindings,
  row: SheetsRow,
  token: string,
  ids: string[],
  partialsOpen: boolean,
): Promise<void> {
  const cfg = row.config;
  const table = await buildResponseTable(env, row.form_id, {
    includePartials: true,
    submissionIds: ids,
    raw: true,
    limit: ids.length,
  });
  if (!table) throw new GoogleError(404, "This form no longer exists");
  const titles = table.header;
  const statusAt = titles.indexOf("status");
  const rowOf = new Map(table.rows.map((r) => [r[0]!, r]));

  const tabs = tabsOf(cfg).filter((tab) => tab.key === "completed" || partialsOpen);
  const sheet = await readTabs(token, cfg, tabs);
  const requests: unknown[] = [];

  for (const tab of tabs) {
    const state = sheet.get(tab.sheetId)!;
    const belongs = (id: string) => {
      const r = rowOf.get(id);
      return r !== undefined && (r[statusAt] === "completed") === (tab.key === "completed");
    };

    let header = state.header;
    if (ids.some(belongs)) {
      // A question the sheet has no column for yet goes on the end, where it moves nothing.
      const missing = titles.filter((t) => !header.includes(t));
      if (missing.length > 0) {
        requests.push({ appendDimension: { sheetId: tab.sheetId, dimension: "COLUMNS", length: missing.length } });
        requests.push({
          updateCells: {
            start: { sheetId: tab.sheetId, rowIndex: 0, columnIndex: header.length },
            rows: [{ values: missing.map(text) }],
            fields: "userEnteredValue",
          },
        });
        header = [...header, ...missing];
      }
    }
    /** For each column of the sheet, which column of the table fills it. -1 is not ours. */
    const source = header.map((h) => (h === "" ? -1 : titles.indexOf(h)));
    let width = source.length;
    while (width > 0 && source[width - 1]! < 0) width--;

    const drop: number[] = [];
    for (const id of ids) {
      const at: number[] = [];
      state.ids.forEach((value, i) => {
        if (i > 0 && value === id) at.push(i);
      });
      if (!belongs(id)) {
        drop.push(...at);
        continue;
      }
      const data = rowOf.get(id)!;
      if (at.length === 0) {
        requests.push({
          appendCells: {
            sheetId: tab.sheetId,
            rows: [{ values: source.slice(0, width).map((s) => (s >= 0 ? text(data[s] ?? "") : {})) }],
            fields: "userEnteredValue",
          },
        });
        continue;
      }
      // In place, one run of our own columns at a time, so a column that is not ours keeps
      // whatever the author put in it.
      for (let start = 0; start < width; ) {
        if (source[start]! < 0) {
          start++;
          continue;
        }
        let end = start;
        while (end < width && source[end]! >= 0) end++;
        requests.push({
          updateCells: {
            start: { sheetId: tab.sheetId, rowIndex: at[0]!, columnIndex: start },
            rows: [{ values: source.slice(start, end).map((s) => text(data[s] ?? "")) }],
            fields: "userEnteredValue",
          },
        });
        start = end;
      }
      // The same response twice is one row too many.
      drop.push(...at.slice(1));
    }
    // Bottom up, so no deletion moves a row still waiting to be deleted. A blank row is added
    // first each time: Sheets refuses to delete the last row under a frozen header.
    for (const index of [...new Set(drop)].sort((a, b) => b - a)) {
      requests.push({ appendDimension: { sheetId: tab.sheetId, dimension: "ROWS", length: 1 } });
      requests.push({
        deleteDimension: { range: { sheetId: tab.sheetId, dimension: "ROWS", startIndex: index, endIndex: index + 1 } },
      });
    }
  }
  if (requests.length > 0) await google(token, "POST", `${API}/${cfg.spreadsheetId}:batchUpdate`, { requests });
}

// ─────────────────────────────── one writer at a time ───────────────────────────────

async function addPending(env: Bindings, formId: string, submissionId: string): Promise<void> {
  await env.DB.prepare(
    `UPDATE integrations
        SET config_json = json_insert(
              json_set(config_json, '$.pending', json(COALESCE(json_extract(config_json, '$.pending'), '[]'))),
              '$.pending[#]', ?1)
      WHERE form_id = ?2 AND provider = ?3`,
  )
    .bind(submissionId, formId, SHEETS_PROVIDER)
    .run();
}

async function acquire(env: Bindings, formId: string, now: number): Promise<boolean> {
  const res = await env.DB.prepare(
    `UPDATE integrations SET config_json = json_set(config_json, '$.lockUntil', ?1)
      WHERE form_id = ?2 AND provider = ?3 AND status = 'connected'
        AND COALESCE(json_extract(config_json, '$.lockUntil'), 0) < ?4`,
  )
    .bind(now + LEASE_MS, formId, SHEETS_PROVIDER, now)
    .run();
  return (res.meta?.changes ?? 0) === 1;
}

async function release(env: Bindings, id: string): Promise<void> {
  await env.DB.prepare(`UPDATE integrations SET config_json = json_set(config_json, '$.lockUntil', 0) WHERE id = ?`)
    .bind(id)
    .run();
}

/** Let go only if nothing arrived while the last batch was being written. */
async function releaseIfIdle(env: Bindings, id: string): Promise<boolean> {
  const res = await env.DB.prepare(
    `UPDATE integrations SET config_json = json_set(config_json, '$.lockUntil', 0)
      WHERE id = ? AND json_array_length(COALESCE(json_extract(config_json, '$.pending'), '[]')) = 0`,
  )
    .bind(id)
    .run();
  return (res.meta?.changes ?? 0) === 1;
}

/** Take the first `n` ids off the queue. Anything appended meanwhile is behind them and stays. */
async function dropPending(env: Bindings, id: string, n: number): Promise<void> {
  if (n <= 0) return;
  await env.DB.prepare(
    `UPDATE integrations
        SET config_json = json_set(config_json, '$.pending', (
              SELECT json_group_array(value) FROM (
                SELECT value FROM json_each(config_json, '$.pending') LIMIT -1 OFFSET ?1)))
      WHERE id = ?2`,
  )
    .bind(n, id)
    .run();
}

export type SyncOutcome = "ok" | "busy" | "not_connected" | "needs_reconnect";

/**
 * Bring a form's sheet up to date.
 *
 * `submissionId` records one changed response first; `rebuild` rewrites both tabs. Whoever gets
 * the lease then writes everything that is waiting, including what other requests record while
 * it works. `busy` means somebody else holds the lease and will write this change with theirs.
 *
 * Throws only for a failure worth trying again: Google busy, or D1. A grant Google no longer
 * honours, or a spreadsheet that is gone, marks the connection `needs_reconnect` instead, which
 * the Integrate tab shows with a Reconnect button.
 */
export async function syncSheets(
  env: Bindings,
  formId: string,
  opts: { submissionId?: string; rebuild?: boolean } = {},
): Promise<SyncOutcome> {
  if (opts.submissionId) await addPending(env, formId, opts.submissionId);
  if (!(await acquire(env, formId, Date.now()))) {
    const row = await readSheets(env, formId);
    if (!row) return "not_connected";
    return row.status === "connected" ? "busy" : (row.status as SyncOutcome);
  }

  let rebuild = opts.rebuild === true;
  let id: string | null = null;
  try {
    for (let pass = 0; pass < MAX_PASSES; pass++) {
      const row = await readSheets(env, formId);
      if (!row) return "not_connected";
      id = row.id;
      const cfg = row.config;
      const ent = await getEntitlements(env, row.organization_id);
      const partialsOpen = ent.features.export_partials === true;
      // The plan changed under the sheet: the Partial tab holds the wrong thing entirely.
      if (cfg.partialsLocked === partialsOpen) rebuild = true;

      const waiting = cfg.pending ?? [];
      if (!rebuild && waiting.length === 0) {
        if (await releaseIfIdle(env, row.id)) {
          id = null;
          return "ok";
        }
        continue;
      }

      await env.DB.prepare(`UPDATE integrations SET config_json = json_set(config_json, '$.lockUntil', ?) WHERE id = ?`)
        .bind(Date.now() + LEASE_MS, row.id)
        .run();
      const token = await accessToken(env, row);
      const taken = rebuild ? waiting.length : Math.min(waiting.length, BATCH);
      if (rebuild) {
        await rebuildSheet(env, row, token, partialsOpen);
      } else {
        try {
          await writeResponses(env, row, token, [...new Set(waiting.slice(0, taken))], partialsOpen);
        } catch (err) {
          // A tab the author deleted. The rebuild puts it back and writes everything.
          if (!(err instanceof GoogleError) || err.status !== 400) throw err;
          rebuild = true;
          continue;
        }
      }
      rebuild = false;
      await dropPending(env, row.id, taken);
      await patchConfig(
        env,
        row.id,
        {
          completedSheetId: cfg.completedSheetId,
          partialSheetId: cfg.partialSheetId,
          partialsLocked: cfg.partialsLocked,
          ...(cfg.spreadsheetTitle ? { spreadsheetTitle: cfg.spreadsheetTitle } : {}),
          lastSyncedAt: Date.now(),
        },
        { status: "connected", lastError: null },
      );
    }
    return "ok";
  } catch (err) {
    const broken = brokenReason(err);
    if (broken && id) {
      await patchConfig(env, id, { accessTokenEnc: null, pending: [] }, { status: "needs_reconnect", lastError: broken });
      return "needs_reconnect";
    }
    if (id && err instanceof GoogleError && err.status === 401) {
      // The stored access token was refused. Forget it, so the retry starts from the refresh token.
      await patchConfig(env, id, { accessTokenEnc: null });
    }
    throw err;
  } finally {
    if (id) await release(env, id).catch(() => undefined);
  }
}

/** Why a connection cannot be used again without the author, or null when a retry may work. */
function brokenReason(err: unknown): string | null {
  if (!(err instanceof GoogleError)) return null;
  if (err.code === "invalid_grant") return "Google access was removed or expired.";
  if (err.status === 404) return "The spreadsheet was deleted.";
  if (err.status === 403) return `Google refused access to the spreadsheet: ${err.message}`.slice(0, 300);
  return null;
}

// ─────────────────────────────── the queue ───────────────────────────────

/**
 * Hand a response event to the Sheets sync, when this form has a sheet.
 *
 * One indexed read decides, so a form without a sheet costs nothing more. Never throws: the
 * event it rides on has webhooks to deliver whatever happens here.
 */
export async function queueSheetsSync(env: Bindings, evt: WebhookEvent): Promise<void> {
  if (evt.isTest === true || !evt.submissionId || !SYNCED_EVENTS.has(evt.event)) return;
  try {
    const connected = await env.DB.prepare(
      `SELECT 1 FROM integrations WHERE form_id = ? AND provider = ? AND status = 'connected' LIMIT 1`,
    )
      .bind(evt.formId, SHEETS_PROVIDER)
      .first();
    if (!connected) return;
    await env.Q_WEBHOOKS.send({
      kind: "sheets_sync",
      formId: evt.formId,
      submissionId: evt.submissionId,
    } satisfies SheetsMessage);
  } catch (err) {
    console.error("sheets_enqueue_failed", {
      formId: evt.formId,
      submissionId: evt.submissionId,
      message: err instanceof Error ? err.message : String(err),
    });
  }
}
