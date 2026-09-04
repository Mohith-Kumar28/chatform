"use client";

import { Download } from "lucide-react";
import type { BlockMedia } from "@repo/form-schema";
import { assetUrl } from "@/lib/assets";

/**
 * The image, clip or download a question carries.
 *
 * `media` was defined in the schema, edited in the builder, stored on the
 * block, and projected all the way to the respondent's client — where nothing
 * rendered it. A question that said "which of these looks right?" above an
 * image showed no image at all.
 */
export function QuestionMedia({
  media,
  imageKey,
}: {
  media?: BlockMedia | null;
  imageKey?: string | null;
}) {
  // `image_key` predates `media` and is still what the builder writes for a
  // plain question image, so both are honoured.
  const fallback = !media && imageKey ? assetUrl(imageKey) : null;
  if (fallback) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={fallback} alt="" className="max-h-64 w-auto rounded-2xl border border-[var(--cf-chip-border)] object-contain" />
    );
  }
  if (!media) return null;

  const url = media.url ?? assetUrl(media.key);
  if (!url) return null;

  if (media.kind === "image") {
    return (
      <figure className="space-y-1">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt={media.alt ?? ""}
          className="max-h-64 w-auto rounded-2xl border border-[var(--cf-chip-border)] object-contain"
          loading="lazy"
        />
        {media.caption && <figcaption className="px-1 text-xs opacity-55">{media.caption}</figcaption>}
      </figure>
    );
  }

  if (media.kind === "video") {
    return (
      <figure className="space-y-1">
        <video
          src={url}
          controls
          playsInline
          preload="metadata"
          className="max-h-72 w-full rounded-2xl border border-[var(--cf-chip-border)]"
        />
        {media.caption && <figcaption className="px-1 text-xs opacity-55">{media.caption}</figcaption>}
      </figure>
    );
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      download={media.filename}
      className="inline-flex items-center gap-2 rounded-xl border border-[var(--cf-chip-border)] bg-[var(--cf-chip-bg)] px-3 py-2 text-sm transition-colors hover:border-[var(--cf-accent)]"
    >
      <Download className="size-3.5 shrink-0 opacity-60" />
      <span className="min-w-0 truncate">{media.filename ?? "Download"}</span>
    </a>
  );
}
