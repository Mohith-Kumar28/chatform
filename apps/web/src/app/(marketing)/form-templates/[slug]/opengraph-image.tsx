import { renderShareCard, shareCardContentType, shareCardSize } from "@/components/brand/share-card";
import { getTemplate, kindLine } from "@/content/templates";

export const alt = "A free chatform template";
export const size = shareCardSize;
export const contentType = shareCardContentType;

/** Each template's own share card: its name, and what kind of form it is. */
export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const template = getTemplate((await params).slug);
  return renderShareCard({
    headline: template ? `${template.searchName} template` : "Free form templates",
    kicker: template ? `${kindLine(template)}. Free, and you can try it live.` : "Try any template live, then make it yours.",
  });
}
