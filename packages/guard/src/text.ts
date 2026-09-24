import { z } from "zod";

/**
 * Text arrives from strangers and leaves through five different doors — SQL, a
 * spreadsheet, an HTML email, a model prompt and the DOM. Rather than teach
 * each door a different lesson, everything is cleaned once on the way in.
 *
 * What is removed is only what has no legitimate reason to be in a form field:
 *
 * - **C0/C1 control characters.** A NUL truncates a C string, an ESC starts a
 *   terminal sequence, and neither ever means anything in an answer. Newline
 *   and tab survive, because they are content.
 * - **Zero-width and bidi controls.** RIGHT-TO-LEFT OVERRIDE makes `exe.txt`
 *   render as `txt.exe`, and a zero-width space splits a word a filter is
 *   looking for while a reader sees nothing. This is the Trojan Source family
 *   (CVE-2021-42574) and the standard carrier for prompt injection.
 * - **A soft hyphen and the Mongolian vowel separator**, for the same
 *   "invisible to a human, visible to a parser" reason.
 *
 * NFC normalisation comes first so two spellings of the same character
 * compare, hash and length-check as one thing — otherwise `.max(80)` is a
 * promise about code units rather than about what the person typed.
 */
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g;
const INVISIBLE = /[\u00AD\u061C\u180E\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g;

/**
 * The multiline cleaner: for anything whose newlines are meaningful — a
 * markdown body, a long-text answer, an extracted document.
 *
 * Whitespace is deliberately left alone apart from the trim. Two trailing
 * spaces is a hard line break in markdown, and a run of blank lines inside a
 * fenced code block is the author's content — collapsing either would rewrite
 * what someone wrote in order to solve a problem nobody has. Removing
 * characters that are invisible is the job; reformatting is not.
 *
 * Idempotent, and that matters: the builder hashes the stored document to
 * decide whether there are unpublished changes, so a cleaner that kept
 * changing its own output would make that flag oscillate.
 */
export function cleanText(input: string): string {
  return input.normalize("NFC").replace(/\r\n?/g, "\n").replace(CONTROL, "").replace(INVISIBLE, "").trim();
}

/**
 * The single-line cleaner: for titles, labels, names — anything where a
 * newline is not content but a way to push the rest of a string out of sight
 * in a table cell, a subject line or a log.
 */
export function cleanLine(input: string): string {
  return cleanText(input).replace(/\s+/g, " ").trim();
}

/** Invisibles only, for text whose whitespace has to survive as it is. */
export function stripInvisible(input: string): string {
  return input.normalize("NFC").replace(CONTROL, "").replace(INVISIBLE, "");
}

/**
 * True when the input carries anything `cleanText` would take out.
 *
 * The regexes are `g`-flagged, and `RegExp.test` on a global regex advances
 * `lastIndex`, so a shared instance would answer differently on a second call
 * with the same argument. Reset before each use rather than dropping the flag,
 * because the same constants do the replacing above.
 */
export function hasSuspiciousCharacters(input: string): boolean {
  CONTROL.lastIndex = 0;
  INVISIBLE.lastIndex = 0;
  return CONTROL.test(input) || INVISIBLE.test(input);
}

/**
 * The bounded-string helper that replaces a bare `z.string().max(n)`.
 *
 * `.overwrite()` rather than `.transform()` is the whole trick: it keeps the
 * schema a plain `ZodString`, so `z.toJSONSchema` still emits
 * `{type:"string",maxLength:n}` and `z.infer` input and output stay the same
 * type. That is what makes this safe to apply across a schema package whose
 * output feeds a generated OpenAPI document and a generated client — a
 * `.transform().pipe()` chain would change both.
 *
 * Cleaning runs before the length check, so a field is measured on what will
 * be stored rather than on what was sent: 500 zero-width spaces are not 500
 * characters of anything.
 */
export function boundedString(max: number): z.ZodString {
  return z.string().overwrite(cleanText).max(max);
}

/** `boundedString` for fields where a newline is not content. */
export function boundedLine(max: number): z.ZodString {
  return z.string().overwrite(cleanLine).max(max);
}
