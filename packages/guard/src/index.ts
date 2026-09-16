/**
 * `@repo/guard` — one place that owns what happens to input from outside.
 *
 * Every door in the product takes text, a file or a link from someone we do
 * not control: a respondent answering a question, an author writing a form, an
 * API client posting a response, a crawler being pointed at a page. The rules
 * for handling that are not per-route judgement calls, so they live here:
 * clean the text, vet the URL, let the bytes decide what a file is, de-fang a
 * spreadsheet cell, escape markup, fence untrusted text out of a prompt.
 *
 * Deliberately dependency-light and runtime-agnostic — the Worker, the Next.js
 * server and the browser all import the same functions. Nothing in here
 * reaches for a database, an environment variable or a binding.
 */
export {
  boundedLine,
  boundedString,
  cleanLine,
  cleanText,
  hasSuspiciousCharacters,
  stripInvisible,
} from "./text";

export {
  GuardError,
  assertSafeUrl,
  guardedFetch,
  classifyHost,
  isBlockedHost,
  isSafeUrl,
  readCappedText,
  readTruncatedText,
  safeHref,
  safeMediaSrc,
  safeUrl,
  safeWebhookUrl,
} from "./url";
export type { GuardErrorCode, GuardedFetchOptions, HostClass, SafeUrlOptions } from "./url";

/**
 * File sniffing is deliberately **not** re-exported here. It is the one module
 * with a real dependency (`file-type`, plus its tokenizer chain), and this
 * barrel is imported by the browser bundle. Import it from `@repo/guard/files`
 * so a page that only needs `safeHref` does not ship a format parser.
 */

export { csvCell, csvField, csvRow } from "./csv";
export { escapeAttr, escapeHtml } from "./html";
export { FENCE_RULE, fence, fenceNonce } from "./prompt";
