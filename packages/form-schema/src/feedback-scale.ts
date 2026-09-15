/**
 * The five faces a respondent picks from when they report a bug.
 *
 * Here, in the one package both sides import, because the scale is read twice
 * and by two different programs: the chat runtime draws it and stores the
 * number, and the API turns that number back into a word — in the email the
 * founders get, and in the console. Two copies of this list would mean a report
 * somebody filed as "Bad" could arrive in an inbox labelled "Okay", and nothing
 * would fail to make that visible.
 *
 * The numbers are what is stored, so they are load-bearing and must never be
 * renumbered; the labels are copy and may be reworded freely.
 */
export const FEEDBACK_RATINGS = [1, 2, 3, 4, 5] as const;

export type FeedbackRating = (typeof FEEDBACK_RATINGS)[number];

export const FEEDBACK_LABELS: Record<FeedbackRating, string> = {
  1: "Terrible",
  2: "Bad",
  3: "Okay",
  4: "Good",
  5: "Great",
};

/** The word for a stored rating, tolerating a number from an older or newer scale. */
export function feedbackLabel(rating: number): string {
  return FEEDBACK_LABELS[rating as FeedbackRating] ?? `${rating}/5`;
}
