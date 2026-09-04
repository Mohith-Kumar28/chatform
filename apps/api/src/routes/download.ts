import { Hono } from "hono";
import { describeRoute } from "hono-openapi";
import type { Bindings } from "../env.js";
import { verifyDownload, type SignedKind } from "../lib/signed-url.js";

/**
 * Signed downloads — the only unauthenticated route that serves tenant bytes.
 *
 * There is no API key here on purpose. The signature *is* the credential: it
 * names one object, it expires in minutes, and it can be handed to a browser,
 * a `curl`, or a colleague without handing over organization-wide access. The
 * alternative — accepting a key in the query string — would put an `sk_live_`
 * into access logs and `Referer` headers, which is precisely what `/v1`
 * refuses to do everywhere else.
 *
 * Every failure answers 404. A signed URL that has expired and one that was
 * never valid are the same non-answer to whoever is holding it, and 403 would
 * confirm the id exists.
 */

export const downloadRouter = new Hono<{ Bindings: Bindings }>();

const gone = { error: { code: "not_found", message: "This link is invalid or has expired" } } as const;

/** Strip anything that could break out of the quoted filename. */
function safeFilename(name: string): string {
  return name.replace(/["\\\r\n]/g, "").slice(0, 120) || "download";
}

downloadRouter.get(
  "/:kind/:id",
  describeRoute({
    tags: ["public"],
    summary: "Follow a signed download link",
    description:
      "You never build this URL yourself — `GET /v1/exports/{id}` and `GET /v1/files/{id}` return it complete. It carries no API key, expires within minutes, and answers 404 for anything it cannot serve, including a link that has expired.",
    responses: {
      200: { description: "The bytes, as an attachment" },
      404: { description: "Invalid, expired, or nothing to serve" },
    },
  }),
  async (c) => {
    const kind = c.req.param("kind") as SignedKind;
    if (kind !== "export" && kind !== "file") return c.json(gone, 404);
    const id = c.req.param("id");

    const verdict = await verifyDownload(c.env, kind, id, c.req.query("exp"), c.req.query("sig"));
    if (verdict !== "ok") return c.json(gone, 404);

    if (kind === "export") {
      const row = await c.env.DB.prepare(
        `SELECT r2_key, format, form_id FROM exports WHERE id = ? AND status = 'ready'`,
      )
        .bind(id)
        .first<{ r2_key: string | null; format: string; form_id: string }>();
      if (!row?.r2_key) return c.json(gone, 404);
      const obj = await c.env.R2.get(row.r2_key);
      if (!obj) return c.json(gone, 404);

      const ext = row.format === "json" ? "jsonl" : "csv";
      return new Response(obj.body, {
        headers: {
          "content-type": row.format === "json" ? "application/x-ndjson" : "text/csv; charset=utf-8",
          "content-disposition": `attachment; filename="responses-${safeFilename(row.form_id)}.${ext}"`,
          "x-content-type-options": "nosniff",
          // Signed links are not shared caches' business.
          "cache-control": "private, no-store",
        },
      });
    }

    const row = await c.env.DB.prepare(
      `SELECT r2_key, filename FROM files WHERE id = ? AND status = 'confirmed'`,
    )
      .bind(id)
      .first<{ r2_key: string; filename: string }>();
    if (!row) return c.json(gone, 404);
    const obj = await c.env.R2.get(row.r2_key);
    if (!obj) return c.json(gone, 404);

    /**
     * Respondent-supplied bytes, so the headers are the hardened set the
     * dashboard's download route already uses: never a renderable content type,
     * never inline, never sniffed. These arrive from strangers.
     */
    return new Response(obj.body, {
      headers: {
        "content-type": "application/octet-stream",
        "content-disposition": `attachment; filename="${safeFilename(row.filename)}"`,
        "x-content-type-options": "nosniff",
        "content-security-policy": "sandbox; default-src 'none'",
        "cache-control": "private, no-store",
      },
    });
  },
);

export default downloadRouter;
