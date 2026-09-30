import { BLOCK_PRESENTATION, type BlockTone, type BlockType } from "@repo/form-schema";

/**
 * Each block family's colour, as the builder's question list and the PDF draw
 * it: a soft ground with its ink. Written out so the class names exist for the
 * stylesheet to find.
 */
export const TONE: Record<BlockTone, { chip: string; dot: string }> = {
  content: { chip: "bg-family-content-soft text-family-content-ink", dot: "bg-family-content" },
  text: { chip: "bg-family-text-soft text-family-text-ink", dot: "bg-family-text" },
  contact: { chip: "bg-family-contact-soft text-family-contact-ink", dot: "bg-family-contact" },
  number: { chip: "bg-family-number-soft text-family-number-ink", dot: "bg-family-number" },
  choice: { chip: "bg-family-choice-soft text-family-choice-ink", dot: "bg-family-choice" },
  scale: { chip: "bg-family-scale-soft text-family-scale-ink", dot: "bg-family-scale" },
  advanced: { chip: "bg-family-advanced-soft text-family-advanced-ink", dot: "bg-family-advanced" },
};

export function toneOf(type: string) {
  return TONE[BLOCK_PRESENTATION[type as BlockType]?.tone ?? "text"];
}

