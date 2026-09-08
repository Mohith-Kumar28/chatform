import {
  renderShareCard,
  shareCardContentType,
  shareCardSize,
} from "@/components/brand/share-card";

export const alt = "chatform pricing — collect for free, pay to look closer";
export const size = shareCardSize;
export const contentType = shareCardContentType;

/**
 * This file has to exist even though the parent segment has one: declaring
 * `openGraph` in the route's own metadata stops the parent's file-based image
 * from attaching. It now carries the pricing page's own words rather than the
 * landing page's, which is the point of `renderShareCard` taking arguments.
 */
export default function Image() {
  return renderShareCard({
    headline: "Collect for free.",
    kicker: "Unlimited forms and unlimited responses on every plan, including the free one.",
  });
}
