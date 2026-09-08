/**
 * The spreadsheet feed: a URL a spreadsheet re-reads forever.
 *
 * Extracted from `routes/integrations.ts` so the dashboard and `/v1` share it.
 * Integrations shipped the day *after* the pass that built the developer API, which
 * is the only reason they were session-only — the Integrate tab was the sole caller
 * and nothing checks that a new capability also reaches `/v1`.
 */
import { sha256Hex } from "@repo/form-schema";
import type { Bindings } from "../env.js";

export const FEED_PROVIDER = "spreadsheet_feed";

export interface FeedConfig {
  /**
   * The token, in the clear.
   *
   * `secret_hash` is what the feed is looked up by; this copy exists so the URL can
   * be shown again. A feed URL readable only once would be a worse secret, not a
   * better one — it would live wherever it was first pasted and nowhere anyone could
   * check it.
   */
  token: string;
  includePartials: boolean;
}

export function feedUrl(origin: string, token: string): string {
  return `${origin}/p/feed/${token}.csv`;
}

/** The public origin this API answers on, for building the feed's own URL. */
export function publicOrigin(url: string): string {
  return new URL(url).origin;
}

export function newFeedToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  // `cff_` for "chatform feed" — greppable in a server log, and obviously ours when
  // someone finds it in a spreadsheet cell two years from now.
  return `cff_${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}`;
}

export interface FeedRow {
  id: string;
  status: string;
  created_at: number;
  config: FeedConfig;
}

export async function readFeed(env: Bindings, formId: string): Promise<FeedRow | null> {
  const row = await env.DB.prepare(
    `SELECT id, config_json, status, created_at FROM integrations
      WHERE form_id = ? AND provider = ? LIMIT 1`,
  )
    .bind(formId, FEED_PROVIDER)
    .first<{ id: string; config_json: string; status: string; created_at: number }>();
  if (!row) return null;
  return { ...row, config: JSON.parse(row.config_json) as FeedConfig };
}

/**
 * Create the feed, change its settings, or mint a new token for it.
 *
 * One function for all three because they are one row: `rotate` is the only thing
 * that decides whether the existing token survives, and having a separate "rotate"
 * path would be a second place for that decision to be made differently.
 */
export async function upsertFeed(
  env: Bindings,
  form: { id: string; organization_id: string },
  opts: { includePartials: boolean; rotate: boolean },
): Promise<FeedRow & { token: string }> {
  const existing = await readFeed(env, form.id);
  const token = existing && !opts.rotate ? existing.config.token : newFeedToken();
  const config: FeedConfig = { token, includePartials: opts.includePartials };
  const hash = sha256Hex(token);
  const now = Date.now();

  if (existing) {
    await env.DB.prepare(
      `UPDATE integrations SET config_json = ?, secret_hash = ?, status = 'connected',
          last_error = NULL, updated_at = ? WHERE id = ?`,
    )
      .bind(JSON.stringify(config), hash, now, existing.id)
      .run();
  } else {
    await env.DB.prepare(
      `INSERT INTO integrations
         (id, organization_id, form_id, provider, config_json, status, secret_hash, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'connected', ?, ?, ?)`,
    )
      .bind(crypto.randomUUID(), form.organization_id, form.id, FEED_PROVIDER, JSON.stringify(config), hash, now, now)
      .run();
  }

  const saved = (await readFeed(env, form.id))!;
  return { ...saved, token };
}

export async function deleteFeed(env: Bindings, formId: string): Promise<void> {
  await env.DB.prepare(`DELETE FROM integrations WHERE form_id = ? AND provider = ?`)
    .bind(formId, FEED_PROVIDER)
    .run();
}

/** The shape both surfaces return for one integration. */
export function projectFeed(feed: FeedRow, origin: string) {
  return {
    id: feed.id,
    provider: FEED_PROVIDER,
    status: feed.status,
    createdAt: feed.created_at,
    feedUrl: feedUrl(origin, feed.config.token),
    includePartials: feed.config.includePartials,
  };
}
