/**
 * Feedback from the people who build forms: the "?" button in the dashboard and
 * the builder.
 *
 * In the shared package for the same reason as `feedback-scale.ts`: the panel
 * draws these lists, the API validates against them and the console and the
 * founders' mail turn the stored keys back into words. The keys are stored, so
 * they must never be renamed; the labels are copy.
 */

export const BUILDER_FEEDBACK_KINDS = {
  bug: "Bug",
  feature: "Feature request",
  feedback: "Feedback",
} as const;

export type BuilderFeedbackKind = keyof typeof BUILDER_FEEDBACK_KINDS;

export const BUILDER_FEEDBACK_KIND_KEYS = Object.keys(BUILDER_FEEDBACK_KINDS) as [
  BuilderFeedbackKind,
  ...BuilderFeedbackKind[],
];

/** How bad a bug is, in the words of the person it happened to. */
export const BUG_SEVERITIES = {
  minor: "Minor",
  annoying: "Annoying",
  blocking: "Blocking my work",
} as const;

/** How much a feature matters to the person asking for it. */
export const FEATURE_IMPORTANCE = {
  nice: "Nice to have",
  important: "Important",
  critical: "Can't use chatform without it",
} as const;

export type BugSeverity = keyof typeof BUG_SEVERITIES;
export type FeatureImportance = keyof typeof FEATURE_IMPORTANCE;

export const BUILDER_FEEDBACK_SEVERITY_KEYS = [
  ...Object.keys(BUG_SEVERITIES),
  ...Object.keys(FEATURE_IMPORTANCE),
] as [BugSeverity | FeatureImportance, ...(BugSeverity | FeatureImportance)[]];

/** The label for a stored severity or importance, tolerating one this build does not know. */
export function builderSeverityLabel(key: string | null | undefined): string | null {
  if (!key) return null;
  return (
    (BUG_SEVERITIES as Record<string, string>)[key] ?? (FEATURE_IMPORTANCE as Record<string, string>)[key] ?? key
  );
}

/**
 * The parts of the product a report can be about.
 *
 * The panel pre-selects the one matching the page it was opened on; the console
 * counts by it. `group` is only for laying the dropdown out.
 */
export const BUILDER_FEEDBACK_AREAS = {
  questions: { label: "Questions", group: "Builder" },
  flow: { label: "Flow and logic", group: "Builder" },
  design: { label: "Design", group: "Builder" },
  agent: { label: "Agent", group: "Builder" },
  results: { label: "Results", group: "Builder" },
  share: { label: "Share and embed", group: "Builder" },
  integrate: { label: "Integrations", group: "Builder" },
  form_settings: { label: "Form settings", group: "Builder" },
  forms: { label: "Forms dashboard", group: "Dashboard" },
  templates: { label: "Templates", group: "Dashboard" },
  team: { label: "Team and workspaces", group: "Dashboard" },
  billing: { label: "Billing and plans", group: "Dashboard" },
  api: { label: "API and keys", group: "Dashboard" },
  account: { label: "Account and sign-in", group: "Dashboard" },
  other: { label: "Something else", group: "Other" },
} as const;

export type BuilderFeedbackArea = keyof typeof BUILDER_FEEDBACK_AREAS;

export const BUILDER_FEEDBACK_AREA_KEYS = Object.keys(BUILDER_FEEDBACK_AREAS) as [
  BuilderFeedbackArea,
  ...BuilderFeedbackArea[],
];

export function builderAreaLabel(key: string | null | undefined): string | null {
  if (!key) return null;
  return BUILDER_FEEDBACK_AREAS[key as BuilderFeedbackArea]?.label ?? key;
}

/** The longest any one text field may be. The same ceiling as a respondent's note. */
export const BUILDER_FEEDBACK_TEXT_MAX = 3000;

/** Images per report, and the size of each. The auto-screenshot counts as one. */
export const BUILDER_FEEDBACK_MAX_IMAGES = 5;
export const BUILDER_FEEDBACK_MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const BUILDER_FEEDBACK_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"] as const;
