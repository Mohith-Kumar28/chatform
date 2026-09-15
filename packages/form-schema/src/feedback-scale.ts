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

/**
 * What a bug report turned out to be about.
 *
 * Fixed and short, because the point of a topic is to be counted: "the phone
 * input" eleven times is a signal, and eleven differently-worded free-text tags
 * are eleven ones. The model is asked to choose from this list and nothing else,
 * and the console charts it. The keys are stored, so they must never be renamed;
 * the labels are copy.
 */
export const FEEDBACK_TOPICS = {
  input: "An input or picker",
  validation: "Rejected a valid answer",
  wording: "Confusing wording",
  flow: "Wrong question or path",
  speed: "Slow or stuck",
  sign_in: "Sign-in or verification",
  upload: "File upload",
  layout: "Layout or display",
  praise: "Praise",
  request: "Feature request",
  spam: "Spam or nonsense",
  other: "Something else",
} as const;

export type FeedbackTopic = keyof typeof FEEDBACK_TOPICS;

export const FEEDBACK_TOPIC_KEYS = Object.keys(FEEDBACK_TOPICS) as [FeedbackTopic, ...FeedbackTopic[]];

/** The label for a stored topic, tolerating one this build does not know. */
export function feedbackTopicLabel(topic: string | null | undefined): string | null {
  if (!topic) return null;
  return FEEDBACK_TOPICS[topic as FeedbackTopic] ?? topic;
}

/**
 * The longest note a respondent may send with a bug report.
 *
 * Generous on purpose: about 500 words, more than a page — a detailed, numbered
 * reproduction never reaches it, and a pasted wall of junk does. One number for
 * the panel's `maxLength`, the API's validator, the admin's internal note and the
 * classifier's prompt, so the browser can never allow what the server refuses.
 */
export const FEEDBACK_NOTE_MAX = 3000;
