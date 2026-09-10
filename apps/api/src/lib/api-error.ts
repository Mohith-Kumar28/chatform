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
 * A schema failure, told to the person who typed rather than to the developer.
 *
 * Three routes used to render `issues.map(i => `${i.path.join(".")}: ${i.message}`)`
 * straight into `message`, and the builder put that in a toast — so someone
 * typing in a box labelled "Notification emails" was shown
 * `settings.onComplete.notificationEmails.0: Invalid email address`. One string
 * was being asked to serve two audiences at once.
 *
 * They are separated here. `issues[]` keeps the dotted path, because that is
 * exactly what the builder needs in order to put the message under the control
 * that owns it. `message` is a sentence, and never contains a path.
 */
function labelFor(path: readonly PropertyKey[]): string {
  // An index names a position, not a field, so the label comes from the nearest
  // segment that is actually a name: `…notificationEmails.0` is still about
  // notification emails.
  const named = [...path].reverse().find((p) => typeof p === "string" && !/^\d+$/.test(p));
  if (!named) return "This form";
  return String(named)
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .toLowerCase()
    // Only the first word is capitalised: field names are camelCase, so the
    // split leaves "Notification Emails" where the label in the panel — and the
    // way anyone would say it — is "Notification emails".
    .replace(/^./, (ch) => ch.toUpperCase())
    .replace(/\b(url|upi|id|api|cta|og|sms|md)\b/gi, (w) => w.toUpperCase());
}

/**
 * One issue as a sentence.
 *
 * Zod's own wording is close for the format cases and wrong for the size ones —
 * "Too small: expected string to have >=1 characters" is a description of a
 * predicate, not of what the reader did. Anything unrecognised falls through to
 * zod's message rather than to a guess, so a new constraint degrades to the old
 * behaviour instead of to nonsense.
 */
function sentenceFor(issue: { code: string; message: string } & Record<string, unknown>): string {
  const origin = typeof issue.origin === "string" ? issue.origin : undefined;
  const min = typeof issue.minimum === "number" ? issue.minimum : undefined;
  const max = typeof issue.maximum === "number" ? issue.maximum : undefined;

  switch (issue.code) {
    case "invalid_format": {
      const format = typeof issue.format === "string" ? issue.format : "";
      if (format === "email") return "That does not look like an email address";
      if (format === "url") return "That does not look like a web address";
      return "That is not in the expected format";
    }
    case "too_small":
      if (origin === "string") return min === 1 ? "This cannot be empty" : `Needs at least ${min} characters`;
      if (origin === "array") return min === 1 ? "At least one is needed" : `At least ${min} are needed`;
      return `Must be ${min} or more`;
    case "too_big":
      if (origin === "string") return `Cannot be longer than ${max} characters`;
      if (origin === "array") return max === 1 ? "Only one is allowed" : `No more than ${max} are allowed`;
      return `Must be ${max} or less`;
    case "invalid_type":
      return issue.input === undefined ? "This is missing" : "That is the wrong kind of value";
    default:
      return issue.message;
  }
}

/**
 * Turn a zod failure into a human sentence plus the structured detail.
 *
 * The sentence names one field, because naming six is a paragraph nobody reads;
 * the count carries the rest, and `issues[]` carries all of them for the client
 * to render in place.
 */
export function describeSchemaError(error: { issues: readonly unknown[] }): {
  message: string;
  issues: ApiIssue[];
} {
  const issues: ApiIssue[] = error.issues.map((raw) => {
    const issue = raw as { code: string; message: string; path?: PropertyKey[] } & Record<string, unknown>;
    const path = issue.path ?? [];
    return {
      path: path.map(String).join("."),
      code: issue.code,
      message: `${labelFor(path)}: ${sentenceFor(issue)}`,
    };
  });

  if (issues.length === 0) return { message: "This form could not be saved", issues };
  const first = issues[0]!.message;
  const rest = issues.length - 1;
  return {
    message: rest === 0 ? first : `${first} (and ${rest} other ${rest === 1 ? "field" : "fields"})`,
    issues,
  };
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
