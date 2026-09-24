import { HiddenFieldName } from "@repo/form-schema";
import { boundedString } from "@repo/guard";
import { z } from "zod";

/**
 * The request-body pieces that more than one surface accepts, bounded once.
 *
 * Three routes take hidden fields — the hosted form, `/v1/responses` and
 * `/v1/chat` — and all three declared them as `z.record(z.string(),
 * z.string())`: no cap on the number of keys, the length of a key, or the
 * length of a value. Whatever arrived was stored verbatim in
 * `submissions.hidden_fields` and set on the session. Three copies of the same
 * unbounded shape is why it stayed unbounded; there is one now.
 */

/** A respondent-supplied token we hand to a provider. Bounded, not parsed. */
export const ProviderToken = z.string().max(4096);

/**
 * Hidden fields: prefills and attribution an embedder passes in.
 *
 * The key has to be a name the form could actually declare, so it is held to
 * the same `HiddenFieldName` pattern the schema uses for a declared one — an
 * unknown key is dropped downstream anyway, and a key that is 2 KB of text was
 * never a name. Values go through `boundedString`, so they are cleaned of
 * invisible characters on the way in: these end up in exports, in notification
 * emails and in the model's prompt.
 *
 * 25 keys is well past every real embed (a UTM set plus a customer id) and far
 * short of a payload.
 */
export const HiddenFieldsInput = z
  .record(HiddenFieldName, boundedString(500))
  .refine((fields) => Object.keys(fields).length <= 25, {
    error: "No more than 25 hidden fields",
  });

/** The embed's parent origin, checked against the form's allowlist later. */
export const EmbedInput = z.object({ origin: z.string().max(200).optional() });

/**
 * The declared body size, or null when there is not a usable one.
 *
 * Every route that buffers or streams a body refuses on this before reading a
 * byte, which is the only check that costs nothing. A lying value cannot slip
 * bytes past it: `FixedLengthStream` errors when the client sends more or
 * fewer than it promised.
 */
export function contentLength(c: { req: { header: (name: string) => string | undefined } }): number | null {
  const n = Number(c.req.header("content-length"));
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}
