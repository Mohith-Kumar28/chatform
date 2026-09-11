import { API_ORIGIN } from "@/lib/api/mutator";

/**
 * Public URL for an R2 asset key.
 *
 * Keys reach the respondent as `assets/<org>/<fileId>-<name>` but are served by
 * file id, so the id is recovered from the key — the same derivation the API
 * does for the social image. Option and question images carried a key and no
 * URL, which is why a picture_choice rendered as plain text chips and a
 * question's image never appeared at all.
 */
export function assetUrl(key: string | null | undefined): string | null {
  if (!key) return null;
  if (/^https?:\/\//i.test(key)) return key;
  const last = key.split("/").pop() ?? key;
  const id = last.split("-")[0] ?? last;
  return `${API_ORIGIN}/p/assets/${id}`;
}

/**
 * The types `/p/assets/:id` serves inline. Everything else it serves as a
 * download, so an upload outside these is shown as a file card, not an image.
 */
export const INLINE_IMAGE = /^image\/(png|jpeg|gif|webp|avif)$/;
export const INLINE_VIDEO = /^video\/(mp4|webm)$/;

export interface UploadedAsset {
  fileId: string;
  key: string;
  /** Public, cache-forever URL the respondent's browser loads. */
  url: string;
  filename: string;
  mime: string;
  sizeBytes: number;
}

/**
 * The plan's per-file limit, checked before the upload starts.
 *
 * The server refuses the same file on its declared length either way; this only
 * saves someone watching a 90MB upload crawl to an error they could have been
 * told about up front.
 */
export function checkUploadSize(file: File, maxMb: number | null | undefined): void {
  if (maxMb != null && file.size > maxMb * 1024 * 1024) {
    const mb = file.size / (1024 * 1024);
    throw new Error(
      `This file is ${mb >= 10 ? Math.round(mb) : Math.round(mb * 10) / 10} MB. Your plan takes files up to ${maxMb} MB.`,
    );
  }
}

/**
 * Put a builder file in the asset store.
 *
 * One copy of the request every builder upload makes — question media, the
 * description editor, logos, favicons, avatars. The file is the request body
 * and its name rides in the query, so the API can stream it into storage
 * rather than parse a multipart form in memory. The API refuses a file over the
 * plan's limit, or past its storage, with a message worth showing as-is.
 */
export async function uploadAsset(file: File, opts: { maxMb?: number | null } = {}): Promise<UploadedAsset> {
  checkUploadSize(file, opts.maxMb);
  const res = await fetch(`${API_ORIGIN}/api/assets?filename=${encodeURIComponent(file.name)}`, {
    method: "POST",
    credentials: "include",
    headers: { "content-type": file.type || "application/octet-stream" },
    body: file,
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
    throw new Error(err?.error?.message ?? "Upload failed");
  }
  const asset = (await res.json()) as Omit<UploadedAsset, "url">;
  return { ...asset, url: `${API_ORIGIN}/p/assets/${asset.fileId}` };
}
