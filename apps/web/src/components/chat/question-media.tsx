"use client";

import { fileDownloadUrl, type BlockMedia } from "@repo/form-schema";
import { assetUrl } from "@/lib/assets";
import { FileCard } from "./file-card";

/**
 * The image, clip or download a question carries.
 *
 * `media` was defined in the schema, edited in the builder, stored on the
 * block, and projected all the way to the respondent's client — where nothing
 * rendered it. A question that said "which of these looks right?" above an
 * image showed no image at all.
 *
 * No border on the image or the clip. A chip border is there to say "this edge
 * is a control"; an image already has an edge of its own, and the line drew a
 * second one a pixel outside it — visible as a faint frame around artwork that
 * was never meant to be framed. The download link keeps its border, because
 * that one really is a control.
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
      <img src={fallback} alt="" className="max-h-64 w-auto rounded-2xl object-contain" />
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
          className="max-h-64 w-auto rounded-2xl object-contain"
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
          className="max-h-72 w-full rounded-2xl"
        />
        {media.caption && <figcaption className="px-1 text-xs opacity-55">{media.caption}</figcaption>}
      </figure>
    );
  }

  const name = media.filename ?? "Download";
  return <FileCard filename={name} sizeBytes={media.sizeBytes} downloadHref={fileDownloadUrl(url, name)} />;
}
