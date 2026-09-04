import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { z } from "zod";
import { REQUEST_ID_HEADER } from "./request-id.js";

/**
 * The public error shape.
 *
 * A widening of the original `{error:{code,message}}`, not a replacement: the
 * gate denials from `@repo/entitlements` (`featureLocked`, `limitReached`,
 * `seatLimit`) carry a dozen extra fields on `error`, and the web's 402
 * interceptor reads them to render the upgrade dialog. `.loose()` is what lets
 * those bodies keep validating unchanged while gaining `request_id`.
 */
export const ApiErrorEnvelope = z.object({
  error: z
    .object({
      code: z.string(),
      message: z.string(),
      /** Per-field or per-block detail. `ref` for an answer, `path` for a document. */
      issues: z
        .array(
          z.object({
            ref: z.string().optional(),
            path: z.string().optional(),
            code: z.string(),
            message: z.string(),
          }),
        )
        .optional(),
      request_id: z.string().optional(),
      doc_url: z.string().optional(),
    })
    .loose(),
});
export type ApiErrorEnvelope = z.infer<typeof ApiErrorEnvelope>;

export interface ApiIssue {
  ref?: string;
  path?: string;
  code: string;
  message: string;
}

const DOCS_ORIGIN = "https://chatform.in/docs";

/** Where an integrator reads about this code. Codes are kebab in the URL, snake in JSON. */
export function docUrlFor(code: string): string {
  return `${DOCS_ORIGIN}/errors#${code.replace(/_/g, "-")}`;
}

/**
 * Any context whose Variables include the request id. Written structurally
 * rather than as a concrete `Context<Env>` so guards, routers and the app itself
 * — which each carry a different Variables union — can all pass one in.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyContext = Context<any>;

/**
 * Build an error response with the request id and a documentation link attached.
 *
 * Handlers that already return a domain-specific envelope (the 402 gate bodies)
 * do not call this — `attachErrorContext` decorates those on the way out, so
 * there is exactly one place that knows the two extra fields.
 */
export function apiError(
  c: AnyContext,
  status: ContentfulStatusCode,
  code: string,
  message: string,
  extra?: { issues?: ApiIssue[] } & Record<string, unknown>,
) {
  const { issues, ...rest } = extra ?? {};
  return c.json(
    {
      error: {
        code,
        message,
        ...(issues?.length ? { issues } : {}),
        ...rest,
        request_id: c.get("requestId") ?? c.res.headers.get(REQUEST_ID_HEADER) ?? "",
        doc_url: docUrlFor(code),
      },
    },
    status,
  );
}

/**
 * Decorate any JSON error body that came from somewhere else.
 *
 * Applied as `/v1` middleware so a 402 built by `@repo/entitlements`, a 401 from
 * a guard and a 422 from a handler all reach the caller with the same two
 * correlation fields, without every producer having to know about them.
 */
export async function attachErrorContext(c: AnyContext): Promise<void> {
  if (c.res.status < 400) return;
  if (!c.res.headers.get("content-type")?.includes("application/json")) return;

  let body: unknown;
  try {
    body = await c.res.clone().json();
  } catch {
    return; // not JSON after all — leave it alone rather than mangle it
  }
  const err = (body as { error?: Record<string, unknown> } | null)?.error;
  if (!err || typeof err !== "object") return;
  /**
   * Also surfaced as a header, so the telemetry middleware can label the request
   * without cloning and awaiting every error body just to read one field.
   */
  if (typeof err.code === "string") c.res.headers.set("x-error-code", err.code);
  if (err.request_id) return;

  err.request_id = c.get("requestId") ?? "";
  if (!err.doc_url && typeof err.code === "string") err.doc_url = docUrlFor(err.code);

  const headers = new Headers(c.res.headers);
  headers.delete("content-length");
  if (typeof err.code === "string") headers.set("x-error-code", err.code);
  c.res = new Response(JSON.stringify(body), { status: c.res.status, headers });
}
