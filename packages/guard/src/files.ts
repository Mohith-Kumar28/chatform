import { fileTypeFromBuffer } from "file-type";
import { cleanLine } from "./text.js";

/**
 * The respondent-upload allowlist: what a person may attach as an answer.
 *
 * `image/svg+xml` is deliberately absent. An SVG is a script container, and
 * these bytes are served back from an origin we own.
 */
export const ALLOWED_UPLOAD_MIME: ReadonlySet<string> = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "application/pdf",
  "text/plain",
  "text/csv",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "audio/mpeg",
  "audio/wav",
  "video/mp4",
  "video/webm",
]);

/**
 * The knowledge-source allowlist: what the agent may be taught from.
 *
 * Wider than the upload list and narrower in a different direction, for the
 * reason the original comment gives — a video is a legitimate file answer and
 * not a legitimate thing to embed, while HTML, SVG and XML are legitimate
 * documents to extract text from. These bytes are never served back to a
 * browser: they are read once by the extractor and stored as text.
 */
export const ALLOWED_KNOWLEDGE_MIME: ReadonlySet<string> = new Set([
  "application/pdf",
  "text/plain",
  "text/markdown",
  "text/csv",
  "text/html",
  "application/xml",
  "text/xml",
  "application/json",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.oasis.opendocument.text",
  "application/vnd.oasis.opendocument.spreadsheet",
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "image/bmp",
  "image/svg+xml",
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/x-wav",
  "audio/webm",
  "audio/mp4",
  "audio/m4a",
  "audio/x-m4a",
]);

/**
 * Types that carry no signature, because they are just text. Bytes cannot
 * confirm these, so they are held to a different rule: the content has to
 * decode as UTF-8 and contain no NUL.
 */
export const TEXTUAL_MIME: ReadonlySet<string> = new Set([
  "text/plain",
  "text/markdown",
  "text/csv",
  "text/html",
  "text/xml",
  "application/xml",
  "application/json",
  "image/svg+xml",
]);

/**
 * How many bytes the sniffer needs. `file-type` reads a few kilobytes for the
 * container formats — an MP4's `ftyp` box and a zip's central directory are
 * not both in the first 16 bytes.
 */
export const SNIFF_BYTES = 4100;

/**
 * What a sniffed type is allowed to mean.
 *
 * A byte signature identifies a *container*, and several of our declared types
 * share one. An old `.doc` and an old `.xls` are both OLE compound files, and
 * every OOXML and ODF document is a zip. Refusing those mismatches would
 * reject legitimate uploads; accepting anything would defeat the check. So the
 * mapping is explicit, and anything not listed has to match exactly.
 */
const SNIFFED_ALIASES: Readonly<Record<string, readonly string[]>> = {
  "application/x-cfb": [
    "application/msword",
    "application/vnd.ms-excel",
    "application/vnd.ms-powerpoint",
  ],
  "application/zip": [
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.oasis.opendocument.text",
    "application/vnd.oasis.opendocument.spreadsheet",
  ],
  "audio/mpeg": ["audio/mpeg", "audio/mp3"],
  "audio/wav": ["audio/wav", "audio/x-wav", "audio/wave"],
  "audio/mp4": ["audio/mp4", "audio/m4a", "audio/x-m4a"],
  "audio/x-m4a": ["audio/mp4", "audio/m4a", "audio/x-m4a"],
  "video/webm": ["video/webm", "audio/webm"],
  "audio/webm": ["video/webm", "audio/webm"],
};

/** The MIME type the bytes actually are, or null when they carry no signature. */
export async function sniffMime(bytes: Uint8Array): Promise<string | null> {
  const head = bytes.length > SNIFF_BYTES ? bytes.subarray(0, SNIFF_BYTES) : bytes;
  const result = await fileTypeFromBuffer(head);
  return result?.mime ?? null;
}

/** Does this look like text a human wrote, rather than a binary with no signature? */
export function looksTextual(bytes: Uint8Array): boolean {
  const head = bytes.length > SNIFF_BYTES ? bytes.subarray(0, SNIFF_BYTES) : bytes;
  if (head.includes(0)) return false;
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(head);
    return true;
  } catch {
    // A truncated multi-byte sequence at the cut is not a binary file, so retry
    // without the last three bytes before calling it.
    try {
      new TextDecoder("utf-8", { fatal: true }).decode(head.subarray(0, Math.max(0, head.length - 3)));
      return true;
    } catch {
      return false;
    }
  }
}

export type MimeVerdict =
  | { ok: true; mime: string; sniffed: string | null }
  | { ok: false; reason: "not_allowed" | "mismatch" | "not_text"; sniffed: string | null };

/**
 * The check that makes "what type is this file?" a question about bytes.
 *
 * Every MIME decision in this codebase used to come from something the client
 * said — a JSON field, a `Content-Type` header, a `File.type` — and all three
 * are free text. This returns the type to *store*, which is the sniffed one
 * when there is a signature, so a later "is this safe to render inline?"
 * decision is made against reality.
 */
export async function checkFileBytes({
  declared,
  bytes,
  allowed,
}: {
  declared: string;
  bytes: Uint8Array;
  allowed: ReadonlySet<string>;
}): Promise<MimeVerdict> {
  const normalised = declared.split(";")[0]!.trim().toLowerCase();
  const sniffed = await sniffMime(bytes);

  if (!allowed.has(normalised)) return { ok: false, reason: "not_allowed", sniffed };

  if (sniffed === null) {
    // No signature. Only the textual types are allowed to have none, and they
    // have to actually be text.
    if (!TEXTUAL_MIME.has(normalised)) return { ok: false, reason: "mismatch", sniffed };
    if (!looksTextual(bytes)) return { ok: false, reason: "not_text", sniffed };
    return { ok: true, mime: normalised, sniffed };
  }

  const acceptable = SNIFFED_ALIASES[sniffed] ?? [sniffed];
  if (!acceptable.includes(normalised)) return { ok: false, reason: "mismatch", sniffed };

  // Store the declared type rather than the sniffed one when the signature is
  // a shared container: `application/zip` is true of a .docx and useless to
  // the extractor that has to pick a parser.
  const store = SNIFFED_ALIASES[sniffed] ? normalised : sniffed;
  return { ok: true, mime: store, sniffed };
}

/**
 * A filename safe to put in an R2 object key.
 *
 * Not a security boundary on its own — nothing execs these, and they are
 * served as attachments — but a key with a slash, a control character or a
 * 2,000-character name in it is a problem of its own kind.
 */
export function safeFilename(name: string, max = 80): string {
  const cleaned = cleanLine(name)
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .replace(/[^\w.-]/g, "_")
    .replace(/^\.+/, "")
    .slice(0, max);
  return cleaned.length > 0 ? cleaned : "file";
}

/** The lower-cased extension including the dot, or "" when there is none. */
export function extensionOf(name: string): string {
  return (/\.[A-Za-z0-9]{1,10}$/.exec(name)?.[0] ?? "").toLowerCase();
}
