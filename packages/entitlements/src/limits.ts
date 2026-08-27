/**
 * Limit keys — the numbers an organization consumes, and what happens at the edge.
 *
 * Separate from `features.ts` on purpose: a feature is a boolean the plan grants, a
 * limit is a quantity the plan allows. Conflating them is bug #8 in the audit.
 */

/**
 * What the system does when a limit is reached.
 *
 * - `hard`    the action does not happen; the caller gets a 402.
 * - `degrade` the action happens at reduced quality and nothing fails. This is how
 *             "unlimited responses" stays true on a plan with a metered LLM: past the
 *             AI cap the interview falls back to deterministic template questions.
 * - `clamp`   a plan-capped value silently replaces a larger authored one at read
 *             time, so a form built on Pro still runs after a downgrade — just shorter.
 * - `meter`   counted and reported, never enforced. The visible "unlimited" rows.
 */
export type EnforcementMode = "hard" | "degrade" | "clamp" | "meter";

/** How a limit is counted, which decides where it is read from and when it resets. */
export type LimitKind =
  /** A monthly counter in `usage_counters`, reset by the period key rolling over. */
  | "monthly"
  /** A live count of rows or bytes, recomputed on read — no counter to drift. */
  | "gauge"
  /** A per-document ceiling checked at publish time. */
  | "document";

export interface LimitMeta {
  label: string;
  unit: "count" | "megabytes" | "tokens" | "chars";
  mode: EnforcementMode;
  kind: LimitKind;
  /** The `usage_counters.metric` this limit is checked against, for monthly limits. */
  metric?: MetricKey;
}

export const LIMITS = {
  responses_per_month: {
    label: "Responses",
    unit: "count",
    mode: "meter",
    kind: "monthly",
    metric: "responses",
  },
  responses_ceiling_per_month: {
    label: "Monthly response ceiling",
    unit: "count",
    mode: "hard",
    kind: "monthly",
    metric: "responses",
  },
  ai_conversations_per_month: {
    label: "AI conversations",
    unit: "count",
    mode: "degrade",
    kind: "monthly",
    metric: "ai_conversations",
  },
  ai_tokens_per_month: {
    label: "AI tokens",
    unit: "tokens",
    mode: "degrade",
    kind: "monthly",
    metric: "ai_tokens",
  },
  ai_generations_per_month: {
    label: "AI form generations",
    unit: "count",
    mode: "hard",
    kind: "monthly",
    metric: "ai_generations",
  },
  api_requests_per_month: {
    label: "API requests",
    unit: "count",
    mode: "hard",
    kind: "monthly",
    metric: "api_requests",
  },
  emails_per_month: {
    label: "Emails sent",
    unit: "count",
    mode: "hard",
    kind: "monthly",
    metric: "emails_sent",
  },

  forms_count: { label: "Forms", unit: "count", mode: "hard", kind: "gauge" },
  workspaces_count: { label: "Workspaces", unit: "count", mode: "hard", kind: "gauge" },
  seats: { label: "Team members", unit: "count", mode: "hard", kind: "gauge" },
  file_storage_mb: { label: "File storage", unit: "megabytes", mode: "hard", kind: "gauge" },

  max_upload_mb_per_file: { label: "Maximum file size", unit: "megabytes", mode: "hard", kind: "document" },
  blocks_per_form: { label: "Questions per form", unit: "count", mode: "hard", kind: "document" },
  webhooks_per_form: { label: "Webhooks per form", unit: "count", mode: "hard", kind: "document" },
  knowledge_entries: { label: "Knowledge entries", unit: "count", mode: "hard", kind: "document" },
  knowledge_chars: { label: "Knowledge size", unit: "chars", mode: "hard", kind: "document" },

  agent_max_turns: { label: "Turns per conversation", unit: "count", mode: "clamp", kind: "document" },
  agent_token_budget: { label: "Tokens per conversation", unit: "tokens", mode: "clamp", kind: "document" },
} as const satisfies Record<string, LimitMeta>;

export type LimitKey = keyof typeof LIMITS;

export const LIMIT_KEYS = Object.keys(LIMITS) as LimitKey[];

/**
 * Metrics tracked in `usage_counters`. `storage_bytes` is a gauge recomputed from the
 * `files` table rather than incremented, because an incremented byte counter drifts the
 * moment an upload is deleted or a confirm never arrives.
 */
export const METRICS = [
  "responses",
  "ai_conversations",
  "ai_tokens",
  "ai_generations",
  "api_requests",
  "emails_sent",
] as const;

export type MetricKey = (typeof METRICS)[number];

/** `null` means unlimited — no quota, subject only to a `hard` ceiling elsewhere. */
export type LimitValue = number | null;

/**
 * Metadata for a limit, widened to `LimitMeta`.
 *
 * `LIMITS` is declared with `satisfies` so each entry keeps its literal types — which is
 * what makes `LimitKey` exact — but that also means TypeScript sees `metric` as absent on
 * the gauge entries rather than optional. Reading through here restores the common shape.
 */
export function limitMeta(key: LimitKey): LimitMeta {
  return LIMITS[key] as LimitMeta;
}

/** The monthly limit that actually stops a metric, if any. */
export function ceilingKeyForMetric(metric: MetricKey): LimitKey | null {
  for (const key of LIMIT_KEYS) {
    const meta = limitMeta(key);
    if (meta.metric === metric && (meta.mode === "hard" || meta.mode === "degrade")) return key;
  }
  return null;
}
