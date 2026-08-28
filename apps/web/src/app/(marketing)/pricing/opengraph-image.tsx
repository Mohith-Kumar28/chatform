import {
  renderShareCard,
  shareCardAlt,
  shareCardContentType,
  shareCardSize,
} from "@/components/brand/share-card";

/**
 * The pricing route declares its own `openGraph` block (in `layout.tsx`, for a
 * pricing-specific title and description), and declaring one stops the parent
 * segment's file-based image from being attached. The result in production was
 * a pricing page with a `twitter:image` — inherited, because `twitter` was not
 * declared — and no `og:image` at all.
 *
 * Rather than depend on which of Next's metadata keys inherit and which
 * replace, the route generates its own card from the same renderer.
 */
export const alt = shareCardAlt;
export const size = shareCardSize;
export const contentType = shareCardContentType;

export default function Image() {
  return renderShareCard();
}
