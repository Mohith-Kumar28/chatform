import { Hono } from "hono";
import { describeRoute, resolver } from "hono-openapi";
import { validator } from "../lib/validator.js";
import { z } from "zod";
import { sha256Hex } from "@repo/form-schema";
import type { Bindings } from "../env.js";
import { requireSession, requireOrg, requireFormAccess, type GuardVars } from "../lib/guards.js";
import { assertPermission, assertFeature, type AuthzVars } from "../lib/authorize.js";
import { buildResponseTable, toCsv } from "../lib/response-table.js";
import { FEED_PROVIDER, readFeed, upsertFeed, deleteFeed, projectFeed, feedUrl, publicOrigin, type FeedConfig } from "../lib/feed-service.js";
import { getAuth } from "../lib/guards.js";
import { webOrigins } from "../lib/origins.js";
import { ErrorEnvelope } from "../lib/openapi.js";
import { signOAuthState, validateReturnTo, verifyOAuthState } from "../lib/payments/oauth-state.js";
import {
  SHEETS_STATE_PROVIDER,
  connectFromSibling,
  connectSheets,
  disconnectSheets,
  exchangeSheetsCode,
  grantsSheets,
  projectSheets,
  readSheets,
  sheetsAuthorizeUrl,
  sheetsConfigured,
  syncSheets,
} from "../lib/google-sheets.js";

/**
 * Integrations that are not webhooks.
 *
 * Two of them, both spreadsheets.
 *
 * Google Sheets, connected with Google's own consent screen: one button, and a
 * sheet in the author's Drive that every response is written to as it arrives.
 * See `lib/google-sheets.ts`.
 *
 * And the feed: a stable, revocable URL that Excel, or any spreadsheet that can
 * import a CSV from the web, pulls on its own schedule. It came first, and stays
 * for everything that is not Google Sheets.
 */

export const integrationsRouter = new Hono<{
  Bindings: Bindings;
  Variables: Partial<AuthzVars & GuardVars>;
}>();

integrationsRouter.use("/forms/:id/integrations", requireSession, requireOrg, requireFormAccess);
integrationsRouter.use("/forms/:id/integrations/*", requireSession, requireOrg, requireFormAccess);

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
  /** Present only for Google Sheets. */
  spreadsheetUrl: z.string().optional(),
  email: z.string().nullable().optional(),
  lastSyncedAt: z.number().nullable().optional(),
  lastError: z.string().nullable().optional(),
  partialsLocked: z.boolean().optional(),
});

const errorContent = { "application/json": { schema: resolver(ErrorEnvelope) } };

function problem(c: { json: (body: unknown, status: number) => Response }, status: number, code: string, message: string): Response {
  return c.json({ error: { code, message } }, status);
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

    const [feed, sheets] = await Promise.all([readFeed(c.env, form.id), readSheets(c.env, form.id)]);
    return c.json([
      ...(sheets ? [projectSheets(sheets)] : []),
      ...(feed ? [projectFeed(feed, publicOrigin(c.req.url))] : []),
    ]);
  },
);

// ── Google Sheets ────────────────────────────────────────────────────────────

integrationsRouter.post(
  "/forms/:id/integrations/google-sheets/start",
  validator("json", z.object({ returnTo: z.string() })),
  describeRoute({
    tags: ["dashboard"],
    summary: "Start connecting a Google Sheet",
    description:
      "Returns Google's consent URL, or `connected` when this person has already approved for another form and the sheet was created straight away.",
    responses: {
      200: {
        description: "Where to go next",
        content: {
          "application/json": {
            schema: resolver(z.union([z.object({ url: z.string() }), z.object({ connected: z.literal(true) })])),
          },
        },
      },
      403: { description: "Not permitted, or impersonating", content: errorContent },
      503: { description: "Google Sheets is not set up on this deployment", content: errorContent },
    },
  }),
  async (c) => {
    const form = c.get("form")!;
    const denied = await assertPermission(c, "submission", "export");
    if (denied) return denied;
    // A support admin acting as a customer must not attach a Google account to their form.
    if (c.get("impersonatorId")) {
      return problem(c, 403, "impersonation_forbidden", "Google Sheets can only be connected by the customer themselves.");
    }
    const userId = c.get("userId");
    if (!userId) return problem(c, 400, "no_user", "Connecting Google Sheets has to be done by a signed-in person.");
    if (!sheetsConfigured(c.env)) {
      return problem(c, 503, "provider_not_configured", "Google Sheets is not set up on this deployment yet.");
    }
    const returnTo = validateReturnTo(c.env, c.req.valid("json").returnTo);
    if (!returnTo) return problem(c, 422, "invalid_return_to", "returnTo must be a page on this app.");

    const borrowed = await connectFromSibling(c.env, form, userId);
    if (borrowed) {
      await firstSync(c.env, form.id);
      return c.json({ connected: true as const });
    }
    const { state } = await signOAuthState(c.env, {
      orgId: form.organization_id,
      userId,
      provider: SHEETS_STATE_PROVIDER,
      returnTo,
      formId: form.id,
    });
    return c.json({ url: sheetsAuthorizeUrl(c.env, state) });
  },
);

integrationsRouter.post(
  "/forms/:id/integrations/google-sheets/sync",
  describeRoute({
    tags: ["dashboard"],
    summary: "Rewrite the Google Sheet from the responses as they are now",
    responses: {
      200: { description: "The connection", content: { "application/json": { schema: resolver(IntegrationRow) } } },
      404: { description: "No sheet is connected", content: errorContent },
      409: { description: "A sync is already running, or the sheet needs reconnecting", content: errorContent },
      502: { description: "Google did not answer", content: errorContent },
    },
  }),
  async (c) => {
    const form = c.get("form")!;
    const denied = await assertPermission(c, "submission", "export");
    if (denied) return denied;
    let outcome: Awaited<ReturnType<typeof syncSheets>>;
    try {
      outcome = await syncSheets(c.env, form.id, { rebuild: true });
    } catch (err) {
      console.error("sheets_sync_failed", { formId: form.id, message: err instanceof Error ? err.message : String(err) });
      return problem(c, 502, "provider_unavailable", "Google did not answer. Try again in a minute.");
    }
    if (outcome === "not_connected") return problem(c, 404, "not_found", "No Google Sheet is connected to this form.");
    if (outcome === "busy") return problem(c, 409, "sync_in_progress", "The sheet is being updated right now. Try again in a moment.");
    const row = await readSheets(c.env, form.id);
    if (!row) return problem(c, 404, "not_found", "No Google Sheet is connected to this form.");
    if (outcome === "needs_reconnect") {
      return problem(c, 409, "needs_reconnect", row.last_error ?? "Google access was removed. Connect again.");
    }
    return c.json(projectSheets(row));
  },
);

integrationsRouter.delete(
  "/forms/:id/integrations/google-sheets",
  describeRoute({
    tags: ["dashboard"],
    summary: "Disconnect the Google Sheet",
    description: "The spreadsheet stays in the owner's Drive. Chatform stops writing to it.",
    responses: { 200: { description: "Disconnected" } },
  }),
  async (c) => {
    const form = c.get("form")!;
    const denied = await assertPermission(c, "submission", "export");
    if (denied) return denied;
    await disconnectSheets(c.env, form.id);
    return c.json({ ok: true });
  },
);

/**
 * Fill the sheet that was just created.
 *
 * A failure here is not a failed connection: the sheet exists and the grant is stored, so the
 * next response, or Sync now, writes everything this would have.
 */
async function firstSync(env: Bindings, formId: string): Promise<void> {
  try {
    await syncSheets(env, formId, { rebuild: true });
  } catch (err) {
    console.error("sheets_first_sync_failed", { formId, message: err instanceof Error ? err.message : String(err) });
  }
}

/**
 * Google's redirect back. Mounted before the session-guarded routers, like the gateways'
 * callbacks, because the signed single-use `state` is what is checked first.
 */
export const sheetsPublicRouter = new Hono<{ Bindings: Bindings }>();

sheetsPublicRouter.get(
  "/integrations/google-sheets/callback",
  describeRoute({
    tags: ["dashboard"],
    summary: "OAuth callback from Google for a Sheets connection",
    description:
      "A browser redirect, not an API. Redirects to the returnTo page with `?sheets=connected` or `?sheets=error&reason=…`.",
    responses: { 302: { description: "Back to the app" } },
  }),
  async (c) => {
    const back = (returnTo: string, params: Record<string, string>) => {
      const url = new URL(returnTo);
      for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
      return c.redirect(url.toString(), 302);
    };
    const verified = await verifyOAuthState<string>(c.env, c.req.query("state"));
    if (!verified.ok) {
      return back(verified.returnTo ?? `${webOrigins(c.env)[0]!}/`, { sheets: "error", reason: `state_${verified.reason}` });
    }
    const { payload } = verified;
    const fail = (reason: string) => back(payload.returnTo, { sheets: "error", reason });

    if (payload.provider !== SHEETS_STATE_PROVIDER || !payload.formId) return fail("provider_mismatch");
    const declined = c.req.query("error");
    if (declined) return fail(declined.replace(/[^a-z_]/gi, "").slice(0, 40) || "access_denied");
    const code = c.req.query("code");
    if (!code) return fail("missing_code");

    // The browser finishing this must be the person who started it: see the gateways' callback.
    const session = await getAuth(c.env).api.getSession({ headers: c.req.raw.headers });
    if (!session || session.user.id !== payload.userId) return fail("session_mismatch");

    const form = await c.env.DB.prepare(
      `SELECT f.id, f.organization_id, f.title FROM forms f
         JOIN members m ON m.organization_id = f.organization_id AND m.user_id = ?1
        WHERE f.id = ?2 AND f.organization_id = ?3 AND f.deleted_at IS NULL`,
    )
      .bind(payload.userId, payload.formId, payload.orgId)
      .first<{ id: string; organization_id: string; title: string }>();
    if (!form) return fail("not_a_member");

    try {
      const tokens = await exchangeSheetsCode(c.env, code);
      // Google lets the permission be unticked on its own page, and still redirects back.
      if (!grantsSheets(tokens)) return fail("permission_not_granted");
      if (!tokens.refreshToken) return fail("exchange_failed");
      await connectSheets(c.env, {
        form,
        userId: payload.userId,
        accessToken: tokens.accessToken,
        accessExpiresAt: tokens.accessExpiresAt,
        refreshToken: tokens.refreshToken,
        email: tokens.email,
      });
    } catch (err) {
      console.error("sheets_oauth_failed", { formId: form.id, message: err instanceof Error ? err.message : String(err) });
      return fail("exchange_failed");
    }
    await firstSync(c.env, form.id);
    return back(payload.returnTo, { sheets: "connected" });
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

    const saved = await upsertFeed(c.env, form, { includePartials, rotate });
    return c.json(projectFeed(saved, publicOrigin(c.req.url)));
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
    await deleteFeed(c.env, form.id);
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
