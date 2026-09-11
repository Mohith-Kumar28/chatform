import { uploadAsset } from "@/lib/assets";

/**
 * Put an image in R2 and return the URL that serves it.
 *
 * The one uploader for every image Better Auth UI wants to attach to a row —
 * a user's avatar, an organization's logo — and it exists as its own module
 * because both of them are load-bearing in the same non-obvious way.
 *
 * Left unset, these components fall back to `fileToBase64` and write a data
 * URL straight into `user.image` / `organizations.logo`. Both columns are
 * serialised into the session cookie cache. A 256px PNG is tens of kilobytes
 * and a cookie's ceiling is four, so the fallback does not degrade — it breaks
 * sign-in outright, and it does so quietly, at whatever later moment the cookie
 * next has to be written.
 *
 * `POST /api/assets` is the path the form builder already uses for logos and
 * question media, and `/p/assets/<id>` serves them public, immutable and
 * MIME-checked. What comes back is a short URL, which is the point.
 */
export async function uploadAuthImage(file: File): Promise<string> {
  try {
    return (await uploadAsset(file)).url;
  } catch {
    throw new Error("Could not upload that image");
  }
}
