import { Angry, Frown, Laugh, Meh, Smile, type LucideIcon } from "lucide-react";
import { FEEDBACK_LABELS, type FeedbackRating } from "@repo/form-schema";

/**
 * The five faces a respondent picks from, as the console draws them.
 *
 * The same icons the respondent's panel shows, the same words from
 * `@repo/form-schema`, and the colour from the `--rating-*` ramp — so the
 * person reading this console and the person who tapped the face are looking at
 * the same object. Four surfaces draw these (the Overview card, the inbox rows,
 * the report dialog, the distribution chart), and a local copy in any one of them
 * is how "bad" ends up orange in one place and red in the next.
 */
export const FACES: Record<FeedbackRating, { label: string; Icon: LucideIcon; color: string }> = {
  1: { label: FEEDBACK_LABELS[1], Icon: Angry, color: "var(--rating-1)" },
  2: { label: FEEDBACK_LABELS[2], Icon: Frown, color: "var(--rating-2)" },
  3: { label: FEEDBACK_LABELS[3], Icon: Meh, color: "var(--rating-3)" },
  4: { label: FEEDBACK_LABELS[4], Icon: Smile, color: "var(--rating-4)" },
  5: { label: FEEDBACK_LABELS[5], Icon: Laugh, color: "var(--rating-5)" },
};

/** The face for a stored rating, falling back to the middle one for anything off the scale. */
export function faceFor(rating: number) {
  return FACES[rating as FeedbackRating] ?? FACES[3];
}
