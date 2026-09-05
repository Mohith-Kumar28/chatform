import { Hono } from "hono";
import { describeRoute, resolver, validator } from "hono-openapi";
import { z } from "zod";
import { sha256Hex } from "@repo/form-schema";
import type { Bindings } from "../env.js";
import { requireSession, requireOrg, requireFormAccess, type GuardVars } from "../lib/guards.js";
import { assertPermission, assertFeature, type AuthzVars } from "../lib/authorize.js";
import { buildResponseTable, toCsv } from "../lib/response-table.js";

/**
 * Integrations that are not webhooks.
 *
 * Today that means one: the spreadsheet feed — a stable, revocable URL that
 * Google Sheets and Excel can pull on their own schedule. It exists because
 * "export to a spreadsheet" is not the same request as "download a file". A
 * download is a snapshot someone has to remember to take again; a feed is a
 * sheet that is right tomorrow morning without anyone opening this app.
 *
 * Deliberately no OAuth. Connecting a Google account to append rows would need
 * a Cloud project, a consent screen, refresh tokens and a sync worker, and it
 * would still only serve people who use Google Sheets. `=IMPORTDATA(url)` is
 * one cell, works in Sheets and Excel, and the credential is a URL the owner
 * can rotate or revoke here.
 */

export const integrationsRouter = new Hono<{
  Bindings: Bindings;
  Variables: Partial<AuthzVars & GuardVars>;
}>();

integrationsRouter.use("/forms/:id/integrations", requireSession, requireOrg, requireFormAccess);
integrationsRouter.use("/forms/:id/integrations/*", requireSession, requireOrg, requireFormAccess);

const FEED_PROVIDER = "spreadsheet_feed";

/** Rows the feed serves. Lower than an export's, because it is refetched forever. */
const FEED_ROW_CAP = 5_000;

const IntegrationRow = z.object({
  id: z.string(),
  provider: z.string(),
  status: z.string(),
  createdAt: z.number(),
  /** Present only for the feed, and only to whoever may already export. */
  feedUrl: z.string().optional(),
  includePartials: z.boolean().optional(),
});

interface FeedConfig {
  /**
   * The token, in the clear.
   *
   * `secret_hash` is what the feed is looked up by; this copy exists so the URL
   * can be shown again. A feed URL that could only be read once would be a
   * worse secret, not a better one — it would live in the first place someone
   * pasted it and nowhere they could check.
   */
  token: string;
  includePartials: boolean;
}

function feedUrl(origin: string, token: string): string {
  return `${origin}/p/feed/${token}.csv`;
}

/** The public origin this API answers on, for building the feed's own URL. */
function publicOrigin(url: string): string {
  return new URL(url).origin;
}

function newToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  // `cff_` for "chatform feed" — greppable in a server log, and obviously ours
  // when someone finds it in a spreadsheet cell two years from now.
  return `cff_${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}`;
}

async function readFeed(env: Bindings, formId: string) {
  const row = await env.DB.prepare(
    `SELECT id, config_json, status, created_at FROM integrations
      WHERE form_id = ? AND provider = ? LIMIT 1`,
  )
    .bind(formId, FEED_PROVIDER)
    .first<{ id: string; config_json: string; status: string; created_at: number }>();
  if (!row) return null;
  return { ...row, config: JSON.parse(row.config_json) as FeedConfig };
}

integrationsRouter.get(
  "/forms/:id/integrations",
  describeRoute({
    tags: ["dashboard"],
    summary: "List a form's non-webhook integrations",
    responses: {
      200: {
        description: "Integrations",
        content: { "application/json": { schema: resolver(z.array(IntegrationRow)) } },
      },
    },
  }),
  async (c) => {
    const form = c.get("form")!;
    const denied = await assertPermission(c, "submission", "export");
    if (denied) return denied;

    const feed = await readFeed(c.env, form.id);
    if (!feed) return c.json([]);
    return c.json([
      {
        id: feed.id,
        provider: FEED_PROVIDER,
        status: feed.status,
        createdAt: feed.created_at,
        feedUrl: feedUrl(publicOrigin(c.req.url), feed.config.token),
        includePartials: feed.config.includePartials,
      },
    ]);
  },
);

integrationsRouter.post(
  "/forms/:id/integrations/spreadsheet",
  validator(
    "json",
    z.object({
      includePartials: z.boolean().optional(),
      /** Mint a new token and invalidate the old one. */
      rotate: z.boolean().optional(),
    }),
  ),
  describeRoute({
    tags: ["dashboard"],
    summary: "Create, update or rotate the spreadsheet feed",
    responses: {
      200: {
        description: "The feed",
        content: { "application/json": { schema: resolver(IntegrationRow) } },
      },
    },
  }),
  async (c) => {
    const form = c.get("form")!;
    const denied = await assertPermission(c, "submission", "export");
    if (denied) return denied;

    const { includePartials = false, rotate = false } = c.req.valid("json");

    /**
     * The same gate the CSV export uses, for the same reason: what you finished
     * collecting is yours on every plan, and the unfinished responses are the
     * slice that is sold. A feed asking for partials is asking for that slice
     * on a schedule.
     */
    if (includePartials) {
      const locked = await assertFeature(c, "export_partials", { surface: "integrations.feed" });
      if (locked) return locked;
    }

    const existing = await readFeed(c.env, form.id);
    const token = existing && !rotate ? existing.config.token : newToken();
    const config: FeedConfig = { token, includePartials };
    const hash = sha256Hex(token);
    const now = Date.now();

    if (existing) {
      await c.env.DB.prepare(
        `UPDATE integrations SET config_json = ?, secret_hash = ?, status = 'connected',
            last_error = NULL, updated_at = ? WHERE id = ?`,
      )
        .bind(JSON.stringify(config), hash, now, existing.id)
        .run();
    } else {
      await c.env.DB.prepare(
        `INSERT INTO integrations
           (id, organization_id, form_id, provider, config_json, status, secret_hash, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 'connected', ?, ?, ?)`,
      )
        .bind(
          crypto.randomUUID(),
          form.organization_id,
          form.id,
          FEED_PROVIDER,
          JSON.stringify(config),
          hash,
          now,
          now,
        )
        .run();
    }

    const saved = await readFeed(c.env, form.id);
    return c.json({
      id: saved!.id,
      provider: FEED_PROVIDER,
      status: saved!.status,
      createdAt: saved!.created_at,
      feedUrl: feedUrl(publicOrigin(c.req.url), token),
      includePartials,
    });
  },
);

integrationsRouter.delete(
  "/forms/:id/integrations/spreadsheet",
  describeRoute({
    tags: ["dashboard"],
    summary: "Revoke the spreadsheet feed",
    responses: { 200: { description: "Revoked" } },
  }),
  async (c) => {
    const form = c.get("form")!;
    const denied = await assertPermission(c, "submission", "export");
    if (denied) return denied;
    await c.env.DB.prepare(`DELETE FROM integrations WHERE form_id = ? AND provider = ?`)
      .bind(form.id, FEED_PROVIDER)
      .run();
    return c.json({ ok: true });
  },
);

// ── the feed itself ──────────────────────────────────────────────────────────

/**
 * Unauthenticated, because the caller is a spreadsheet.
 *
 * Sheets' `IMPORTDATA` and Excel's "From Web" send no cookie and no header they
 * would let you set, so the URL is the whole credential — the same trade the
 * signed download links make. Consequences: the token is 192 bits of CSPRNG
 * output, it is looked up by hash, every failure is an identical 404, and the
 * owner can rotate or revoke it from the dashboard at any time.
 */
export const feedRouter = new Hono<{ Bindings: Bindings }>();

const gone = { error: { code: "not_found", message: "This feed link is invalid or was revoked" } } as const;

feedRouter.get(
  "/feed/:token",
  describeRoute({
    tags: ["public"],
    summary: "A form's responses as CSV, for a spreadsheet to pull",
    description:
      "Built for you by the dashboard — paste it into Google Sheets as `=IMPORTDATA(\"…\")` or into Excel via Data → From Web. The URL is the credential; rotate it if it leaks.",
    responses: {
      200: { description: "CSV", content: { "text/csv": { schema: resolver(z.string()) } } },
      404: { description: "Invalid or revoked" },
    },
  }),
  async (c) => {
    // `.csv` is in the path so Excel's importer picks a parser without being
    // told; it is not part of the token.
    const token = (c.req.param("token") ?? "").replace(/\.csv$/, "");
    if (!/^cff_[0-9a-f]{48}$/.test(token)) return c.json(gone, 404);

    const row = await c.env.DB.prepare(
      `SELECT i.form_id, i.config_json, i.status
         FROM integrations i
         JOIN forms f ON f.id = i.form_id
        WHERE i.secret_hash = ? AND i.provider = ? AND f.deleted_at IS NULL
        LIMIT 1`,
    )
      .bind(sha256Hex(token), FEED_PROVIDER)
      .first<{ form_id: string; config_json: string; status: string }>();
    if (!row || row.status !== "connected") return c.json(gone, 404);

    const config = JSON.parse(row.config_json) as FeedConfig;
    const table = await buildResponseTable(c.env, row.form_id, {
      includePartials: config.includePartials,
      limit: FEED_ROW_CAP,
    });
    if (!table) return c.json(gone, 404);

    return new Response(toCsv(table), {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        // Sheets refreshes `IMPORTDATA` about hourly on its own; five minutes
        // is enough to absorb a burst of manual refreshes without serving
        // anyone yesterday's responses.
        "cache-control": "private, max-age=300",
        "x-content-type-options": "nosniff",
        // Nothing here should ever be framed or indexed.
        "x-robots-tag": "noindex, nofollow",
        /**
         * Said in a header rather than an extra row: a note appended to a CSV
         * is a row the spreadsheet imports, and a sheet whose last line reads
         * "5000 row limit reached" has corrupted the data it was asked to hold.
         */
        ...(table.truncated ? { "x-chatform-truncated": String(FEED_ROW_CAP) } : {}),
      },
    });
  },
);
