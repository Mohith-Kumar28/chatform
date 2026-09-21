import { validator as openapiValidator } from "hono-openapi";
import { apiError, describeSchemaError } from "./api-error.js";

/**
 * `hono-openapi`'s validator, with the error hook it does not ship.
 *
 * Without a hook, a body the schema rejects is answered with the validation
 * library's own output:
 *
 * ```json
 * { "data": { … }, "error": [ { "code": "invalid_type", "path": ["ref"] } ], "success": false }
 * ```
 *
 * `error` is an array, there is no `code`, no `message`, no `request_id` and no
 * `doc_url` — and `docs/errors.mdx` opens by promising that every error has the
 * same shape. Three things went wrong because of that.
 *
 * A client keying off `error.code` reads `undefined`. Our own client is one:
 * `ChatformError` fell back to `http_400` and "Request failed with 400", so the
 * developer was told the request failed and never which field, while the answer
 * sat in the body it had discarded.
 *
 * And `data` echoed the submitted body back, so a rejected payload carrying an
 * email or a phone number was reflected to the caller.
 *
 * The pieces to fix it already existed — `describeSchemaError` turns a schema
 * failure into a sentence plus per-field `issues[]`, and `apiError` attaches the
 * correlation fields. Nothing was calling them for this case. Importing
 * `validator` from here rather than from `hono-openapi` is the whole change; the
 * call sites are unchanged.
 */
export const validator: typeof openapiValidator = ((target: never, schema: never, hook?: never, options?: never) =>
  openapiValidator(
    target,
    schema,
    (hook ??
      ((result: { success: boolean; error?: readonly unknown[] }, c: never) => {
        if (result.success) return;
        const { message, issues } = describeSchemaError({ issues: result.error ?? [] });
        return apiError(c, 400, "invalid_request", message, { issues });
      })) as never,
    options,
  )) as typeof openapiValidator;
