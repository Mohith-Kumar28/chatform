import type { FormDoc } from "@repo/form-schema";
import { guardedFetch } from "@repo/guard";
import type { Bindings } from "../../env.js";

/**
 * An imported form's images, copied into our own storage.
 *
 * The readers hand back the source's image links (Typeform's CDN, Tally's,
 * Jotform's, Youform's). Left as links, every image would vanish the day the
 * author closes the account they are leaving, which is the whole reason they
 * came. So each one is fetched once, stored in R2 like a builder upload, and
 * the form points at our copy.
 *
 * Best effort, never a reason to fail an import: an image that will not
 * download, is not an image, or is too big keeps its original link. Bounded
 * so a form with a hundred pictures cannot hold the request hostage.
 */
const MAX_IMAGES = 40;
const MAX_BYTES = 5 * 1024 * 1024;
const CONCURRENCY = 6;
const TIMEOUT_MS = 6000;

const EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/avif": "avif",
};

export async function rehostImages(
  env: Bindings,
  doc: FormDoc,
  args: {
    orgId: string;
    apiOrigin: string;
    /** Storage the plan has left, in bytes; null for none to respect. Images past it keep their links. */
    budgetBytes?: number | null;
  },
): Promise<{ doc: FormDoc; copied: number; kept: number }> {
  const urls = new Set<string>();
  const isRemote = (u: unknown): u is string => typeof u === "string" && /^https:\/\//i.test(u);
  for (const b of doc.blocks) {
    const media = (b as { media?: { kind: string; url: string | null } | null }).media;
    if (media?.kind === "image" && isRemote(media.url)) urls.add(media.url);
    for (const o of ((b as { options?: { image_key?: string | null }[] }).options ?? [])) if (isRemote(o.image_key)) urls.add(o.image_key);
  }
  for (const e of doc.endings) if (isRemote(e.imageUrl) && !e.imageUrl.startsWith(args.apiOrigin)) urls.add(e.imageUrl);

  const list = [...urls].slice(0, MAX_IMAGES);
  const stored = new Map<string, { key: string; id: string }>();
  let cursor = 0;
  const budget = { left: args.budgetBytes ?? Infinity };
  const worker = async () => {
    while (cursor < list.length) {
      const url = list[cursor++]!;
      const copy = await copyOne(env, url, args.orgId, budget).catch(() => null);
      if (copy) stored.set(url, copy);
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, list.length) }, worker));
  if (stored.size === 0) return { doc, copied: 0, kept: urls.size };

  const blocks = doc.blocks.map((b) => {
    let next = b as Record<string, unknown>;
    const media = next.media as { kind: string; url: string | null } | null | undefined;
    if (media?.kind === "image" && media.url && stored.has(media.url)) {
      next = { ...next, media: { ...media, key: stored.get(media.url)!.key, url: null } };
    }
    if (Array.isArray(next.options)) {
      next = {
        ...next,
        options: (next.options as { image_key?: string | null }[]).map((o) =>
          o.image_key && stored.has(o.image_key) ? { ...o, image_key: stored.get(o.image_key)!.key } : o,
        ),
      };
    }
    return next as FormDoc["blocks"][number];
  });
  const endings = doc.endings.map((e) =>
    e.imageUrl && stored.has(e.imageUrl) ? { ...e, imageUrl: `${args.apiOrigin}/p/assets/${stored.get(e.imageUrl)!.id}` } : e,
  );
  return { doc: { ...doc, blocks, endings }, copied: stored.size, kept: urls.size - stored.size };
}

async function copyOne(env: Bindings, url: string, orgId: string, budget: { left: number }): Promise<{ key: string; id: string } | null> {
  const { response } = await guardedFetch(url, {
    timeoutMs: TIMEOUT_MS,
    maxRedirects: 3,
    // No SVG: served from our origin, a picture that can carry script is not a picture.
    contentTypes: /^image\/(png|jpeg|gif|webp|avif)\b/i,
    init: { headers: { "user-agent": "Mozilla/5.0 (compatible; ChatformBot/1.0; +https://chatform.in/bot)", accept: "image/*" } },
  });
  if (!response.ok) {
    await response.body?.cancel().catch(() => {});
    return null;
  }
  const declared = Number(response.headers.get("content-length") ?? "0");
  if (declared > MAX_BYTES) {
    await response.body?.cancel().catch(() => {});
    return null;
  }
  const body = await response.arrayBuffer();
  if (body.byteLength === 0 || body.byteLength > MAX_BYTES || body.byteLength > budget.left) return null;
  budget.left -= body.byteLength;
  const mime = (response.headers.get("content-type") ?? "").split(";")[0]!.trim().toLowerCase();
  const id = `ast_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
  const filename = `import.${EXT[mime] ?? "img"}`;
  const key = `assets/${orgId}/${id}-${filename}`;
  await env.R2.put(key, body, { httpMetadata: { contentType: mime } });
  const now = Date.now();
  await env.DB.prepare(
    `INSERT INTO files (id, organization_id, uploaded_by, uploader_user_id, r2_key, filename, mime, size_bytes, status, created_at, confirmed_at)
     VALUES (?, ?, 'builder', NULL, ?, ?, ?, ?, 'confirmed', ?, ?)`,
  )
    .bind(id, orgId, key, filename, mime, body.byteLength, now, now)
    .run();
  return { key, id };
}
