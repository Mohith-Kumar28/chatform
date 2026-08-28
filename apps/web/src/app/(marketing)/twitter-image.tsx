import {
  renderShareCard,
  shareCardAlt,
  shareCardContentType,
  shareCardSize,
} from "@/components/brand/share-card";

export const alt = shareCardAlt;
export const size = shareCardSize;
export const contentType = shareCardContentType;

export default function Image() {
  return renderShareCard();
}
