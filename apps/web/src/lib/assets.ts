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
