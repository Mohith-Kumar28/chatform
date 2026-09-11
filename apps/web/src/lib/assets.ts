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
 * Put a builder file in the asset store.
 *
 * One copy of the request the question's media field and the description editor
 * both make; the API refuses types outside its allowlist with a message worth
 * showing as-is.
 */
export async function uploadAsset(file: File): Promise<UploadedAsset> {
  const body = new FormData();
  body.append("file", file);
  const res = await fetch(`${API_ORIGIN}/api/assets`, { method: "POST", credentials: "include", body });
  if (!res.ok) {
    const err = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
    throw new Error(err?.error?.message ?? "Upload failed");
  }
  const asset = (await res.json()) as Omit<UploadedAsset, "url">;
  return { ...asset, url: `${API_ORIGIN}/p/assets/${asset.fileId}` };
}
