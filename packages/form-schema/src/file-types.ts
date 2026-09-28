/**
 * What a `file_upload` question can take, in the words an author picks from.
 *
 * `accept` on the block is still a list of MIME types, because that is what a
 * browser's file picker and the upload route both speak. But nobody authoring a
 * form thinks in MIME types, and nobody answering one should read them: the
 * dropzone once showed `image/*` as a bare "*", and refused a PNG against it
 * because the check compared strings exactly. Everything that reads `accept`
 * goes through this file instead, so the builder, the chat, the server and the
 * AI all mean the same thing by "images".
 *
 * Every MIME here must also be in `ALLOWED_UPLOAD_MIME` (`@repo/guard/files`),
 * which is the security allowlist; a test holds the two together.
 */

/** Any type in the catalog. The default: an author narrows from here. */
export const ANY_FILE = "*/*";

export interface FileKind {
  id: string;
  label: string;
  /** The formats, as a respondent would name them. */
  formats: string;
  mimes: readonly string[];
}

export const FILE_KINDS: readonly FileKind[] = [
  {
    id: "images",
    label: "Images",
    formats: "PNG, JPG, GIF, WebP, SVG",
    mimes: ["image/png", "image/jpeg", "image/gif", "image/webp", "image/svg+xml"],
  },
  { id: "pdf", label: "PDF", formats: "PDF", mimes: ["application/pdf"] },
  {
    id: "documents",
    label: "Documents",
    formats: "Word, TXT",
    mimes: [
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "text/plain",
    ],
  },
  {
    id: "spreadsheets",
    label: "Spreadsheets",
    formats: "Excel, CSV",
    mimes: [
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "text/csv",
    ],
  },
  {
    id: "presentations",
    label: "Presentations",
    formats: "PowerPoint",
    mimes: [
      "application/vnd.ms-powerpoint",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ],
  },
  {
    id: "audio",
    label: "Audio",
    formats: "MP3, WAV, M4A",
    mimes: ["audio/mpeg", "audio/wav", "audio/mp4", "audio/x-m4a"],
  },
  {
    id: "video",
    label: "Video",
    formats: "MP4, MOV, WebM",
    mimes: ["video/mp4", "video/quicktime", "video/webm"],
  },
];

/** Product names a person types for a format. */
const ALIASES: Readonly<Record<string, readonly string[]>> = {
  word: ["doc", "docx"],
  excel: ["xls", "xlsx"],
  powerpoint: ["ppt", "pptx"],
};

/** Every type a respondent can upload, whatever the question allows. */
export const UPLOAD_MIMES: readonly string[] = FILE_KINDS.flatMap((k) => k.mimes);

/**
 * Extension to type, for when the browser's own answer is missing or wrong.
 * Windows reports a `.csv` as `application/vnd.ms-excel`, some browsers report
 * nothing for `.m4a`, and iOS reports a `.mov` three different ways.
 */
const BY_EXTENSION: Readonly<Record<string, string>> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  txt: "text/plain",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  csv: "text/csv",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  m4a: "audio/mp4",
  mp4: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm",
};

/** The type to declare for a file: its extension's, else what the browser said. */
export function uploadMimeOf(filename: string, browserType: string): string {
  const ext = filename.includes(".") ? filename.split(".").pop()!.toLowerCase() : "";
  return BY_EXTENSION[ext] ?? browserType.split(";")[0]!.trim().toLowerCase();
}

/** Does one `accept` entry cover this type? Handles `*\/*` and `image/*`. */
function covers(entry: string, mime: string): boolean {
  const e = entry.trim().toLowerCase();
  if (e === ANY_FILE || e === "*") return true;
  if (e.endsWith("/*")) return mime.startsWith(e.slice(0, -1));
  return e === mime;
}

/** Can a file of this type answer a question with this `accept`? */
export function acceptsMime(accept: readonly string[], mime: string): boolean {
  const m = mime.toLowerCase();
  if (!UPLOAD_MIMES.includes(m)) return false;
  return accept.length === 0 || accept.some((a) => covers(a, m));
}

/** Every catalog type this `accept` lets through. */
export function acceptedMimes(accept: readonly string[]): string[] {
  return UPLOAD_MIMES.filter((m) => acceptsMime(accept, m));
}

export function isAnyFile(accept: readonly string[]): boolean {
  return acceptedMimes(accept).length === UPLOAD_MIMES.length;
}

/** The kinds this `accept` lets through at least one type of. */
export function acceptedKinds(accept: readonly string[]): FileKind[] {
  const ok = acceptedMimes(accept);
  return FILE_KINDS.filter((k) => k.mimes.some((m) => ok.includes(m)));
}

/** "PNG", "Word": the short name for one type. */
export function describeMime(mime: string): string {
  const ext = Object.entries(BY_EXTENSION).find(([, m]) => m === mime.toLowerCase())?.[0];
  if (ext === "jpeg" || ext === "jpg") return "JPG";
  if (ext === "doc" || ext === "docx") return "Word";
  if (ext === "xls" || ext === "xlsx") return "Excel";
  if (ext === "ppt" || ext === "pptx") return "PowerPoint";
  if (ext) return ext.toUpperCase();
  const sub = mime.split("/")[1] ?? mime;
  return sub.split(/[.+-]/).pop()!.toUpperCase();
}

/**
 * What a question takes, for a respondent: "Images or PDF", "PNG or JPG",
 * "Any file". A kind the question takes whole is named as the kind; one it
 * takes part of is named by its formats.
 */
export function describeAccept(accept: readonly string[]): string {
  if (isAnyFile(accept)) return "Any file";
  const ok = acceptedMimes(accept);
  const names: string[] = [];
  for (const kind of FILE_KINDS) {
    const taken = kind.mimes.filter((m) => ok.includes(m));
    if (taken.length === 0) continue;
    if (taken.length === kind.mimes.length) names.push(kind.label);
    else names.push(...new Set(taken.map(describeMime)));
  }
  const unique = [...new Set(names)];
  if (unique.length <= 1) return unique[0] ?? "Any file";
  return `${unique.slice(0, -1).join(", ")} or ${unique.at(-1)}`;
}

/**
 * The `accept` for a set of kind ids: `*\/*` when it is all of them, so a
 * question left on "everything" keeps meaning everything as kinds are added.
 */
export function acceptForKinds(ids: readonly string[]): string[] {
  const kinds = FILE_KINDS.filter((k) => ids.includes(k.id));
  if (kinds.length === FILE_KINDS.length || kinds.length === 0) return [ANY_FILE];
  return kinds.flatMap((k) => k.mimes);
}

/**
 * Read an author's or a model's `accept=` value: kind ids ("images|pdf"),
 * formats ("png, docx"), MIME types or wildcards, in any mix. Anything it
 * cannot place is dropped. Empty means it recognised nothing.
 */
export function parseAcceptList(raw: string): string[] {
  const out = new Set<string>();
  for (const part of raw.split(/[|,\s]+/)) {
    const p = part.trim().toLowerCase().replace(/^\./, "");
    if (!p) continue;
    if (p === "any" || p === "all" || p === ANY_FILE || p === "*") return [ANY_FILE];
    const kind = FILE_KINDS.find((k) => k.id === p || k.id === `${p}s` || k.label.toLowerCase() === p);
    if (kind) kind.mimes.forEach((m) => out.add(m));
    else if (ALIASES[p]) ALIASES[p].forEach((e) => out.add(BY_EXTENSION[e]!));
    else if (BY_EXTENSION[p]) out.add(BY_EXTENSION[p]);
    else if (p.includes("/") && UPLOAD_MIMES.some((m) => covers(p, m))) out.add(p);
  }
  return [...out].slice(0, 20);
}

/**
 * The file picker's `accept` attribute: types and extensions both, since a
 * picker filtering on `text/csv` alone hides the CSVs Windows calls Excel.
 * Undefined for any file, so the picker shows everything.
 */
export function pickerAccept(accept: readonly string[]): string | undefined {
  if (isAnyFile(accept)) return undefined;
  const mimes = acceptedMimes(accept);
  const exts = Object.entries(BY_EXTENSION)
    .filter(([, m]) => mimes.includes(m))
    .map(([e]) => `.${e}`);
  return [...mimes, ...exts].join(",");
}
