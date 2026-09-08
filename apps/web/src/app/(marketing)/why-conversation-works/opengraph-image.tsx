import {
  renderShareCard,
  shareCardContentType,
  shareCardSize,
} from "@/components/brand/share-card";

export const alt = "Why people finish a conversation and abandon a form — the research, with sources";
export const size = shareCardSize;
export const contentType = shareCardContentType;

export default function Image() {
  return renderShareCard({
    headline: "Nobody abandons question one.",
    kicker: "What the research says about asking the same things differently.",
  });
}
