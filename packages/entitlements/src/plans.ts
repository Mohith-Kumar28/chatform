/**
 * The plan catalogue — the single source of truth for pricing and entitlements.
 *
 * `plans` rows in D1 hold `features_json` / `limits_json` copied from here at seed time.
 * The database is the runtime read path (one indexed query, cacheable); this file is the
 * authoring path. `assertCatalogueMatches` in `verify.ts` keeps them honest in CI.
 *
 * Positioning: Youform's three tiers, $5 under each of their monthly prices, with the
 * yearly price set so the per-month figure stays a clean round number — which lands the
 * annual discount at 33%/35% against Youform's 31%/33%. Their prices for reference:
 * Pro $29/mo · $240/yr, Business $89/mo · $720/yr.
 */

import { FEATURE_KEYS, type FeatureKey } from "./features.js";
import type { LimitKey, LimitValue } from "./limits.js";

export const PLAN_IDS = ["free", "pro", "business"] as const;
export type PlanId = (typeof PLAN_IDS)[number];

export interface Plan {
  id: PlanId;
  name: string;
  /** One line for the pricing card, written from the buyer's side of the screen. */
  tagline: string;
  priceMonthlyCents: number;
  /** Total charged once a year, not the per-month equivalent. */
  priceYearlyCents: number;
  /** Per extra seat above `limits.seats`, 0 when extra seats are not sold. */
  seatPriceCents: number;
  currency: "USD";
  features: readonly FeatureKey[];
  limits: Readonly<Record<LimitKey, LimitValue>>;
  sortOrder: number;
}

/**
 * Free is deliberately extravagant about input and stingy about output — that is the
 * whole model. Everything that gets a form built, published and collecting is here;
 * everything that makes the collected data useful is not.
 *
 * The AI numbers have no Youform analogue and exist because every response here is an
 * LLM conversation with real marginal cost. Responses stay unlimited; AI conversations
 * are metered, and past the cap the interview degrades to deterministic template
 * questions rather than failing. See `EnforcementMode` in `limits.ts`.
 */
const FREE: Plan = {
  id: "free",
  name: "Free",
  tagline: "Build it, publish it, collect real answers. No card, no expiry.",
  priceMonthlyCents: 0,
  priceYearlyCents: 0,
  seatPriceCents: 0,
  currency: "USD",
  features: [],
  limits: {
    responses_per_month: null,
    responses_ceiling_per_month: 5_000,
    ai_conversations_per_month: 200,
    ai_tokens_per_month: 500_000,
    ai_generations_per_month: 10,
    api_requests_per_month: 0,
    emails_per_month: 500,

    forms_count: 100,
    workspaces_count: 1,
    seats: 1,
    file_storage_mb: 10,

    max_upload_mb_per_file: 5,
    blocks_per_form: 100,
    webhooks_per_form: 2,
    knowledge_entries: 0,
    knowledge_chars: 0,

    agent_max_turns: 30,
    agent_token_budget: 6_000,
  },
  sortOrder: 0,
};

const PRO: Plan = {
  id: "pro",
  name: "Pro",
  tagline: "See everything you collected, on your own brand.",
  priceMonthlyCents: 2_400, // $24 — Youform charges $29
  priceYearlyCents: 19_200, // $192 = a clean $16/mo — 33% off, just past Youform's 31%
  seatPriceCents: 0,
  currency: "USD",
  features: [
    "custom_fonts",
    "brand_logo",
    "remove_branding",
    "duplicate_prevention",
    "multi_language",
    "collect_payments",
    "partial_responses",
    "advanced_analytics",
    "conversation_analytics",
    "export_partials",
    "form_metadata",
    "completion_redirect",
    "auto_reply_email",
    "custom_domain",
    "refill_link",
    "tracking_pixels",
    "api_access",
    "agent_persona",
    "agent_knowledge",
    "agent_guardrails",
    "team_roles",
  ],
  limits: {
    responses_per_month: null,
    responses_ceiling_per_month: 50_000,
    ai_conversations_per_month: 2_000,
    ai_tokens_per_month: 6_000_000,
    ai_generations_per_month: 200,
    api_requests_per_month: 50_000,
    emails_per_month: 10_000,

    forms_count: 1_000,
    workspaces_count: 10,
    seats: 3,
    file_storage_mb: 10_240,

    max_upload_mb_per_file: 25,
    blocks_per_form: 300,
    webhooks_per_form: 10,
    knowledge_entries: 20,
    knowledge_chars: 20_000,

    agent_max_turns: 60,
    agent_token_budget: 12_000,
  },
  sortOrder: 1,
};

const BUSINESS: Plan = {
  id: "business",
  name: "Business",
  tagline: "Verify who answered, and account for every change.",
  priceMonthlyCents: 8_400, // $84 — Youform charges $89
  priceYearlyCents: 66_000, // $660 = a clean $55/mo — 35% off, just past Youform's 33%
  seatPriceCents: 1_000, // $10/mo per seat above 5, as Youform charges
  currency: "USD",
  features: [
    ...PRO.features,
    "respondent_auth_google",
    "respondent_auth_phone",
    "one_response_per_identity",
    "ai_insights",
    "agent_model_picker",
    "activity_log",
  ],
  limits: {
    responses_per_month: null,
    responses_ceiling_per_month: 50_000,
    ai_conversations_per_month: 10_000,
    ai_tokens_per_month: 30_000_000,
    ai_generations_per_month: 1_000,
    api_requests_per_month: 250_000,
    emails_per_month: 50_000,

    forms_count: 1_000,
    workspaces_count: 25,
    seats: 5,
    file_storage_mb: 51_200,

    max_upload_mb_per_file: 100,
    blocks_per_form: 300,
    webhooks_per_form: 25,
    knowledge_entries: 20,
    knowledge_chars: 20_000,

    agent_max_turns: 200,
    agent_token_budget: 30_000,
  },
  sortOrder: 2,
};

export const PLANS: Record<PlanId, Plan> = { free: FREE, pro: PRO, business: BUSINESS };

export const PLAN_LIST: readonly Plan[] = [FREE, PRO, BUSINESS];

export function isPlanId(value: string): value is PlanId {
  return (PLAN_IDS as readonly string[]).includes(value);
}

/** Per-month equivalent of the yearly price, for the "$16/mo billed yearly" line. */
export function yearlyPerMonthCents(plan: Plan): number {
  return Math.round(plan.priceYearlyCents / 12);
}

/** Whole-percent saving of paying yearly, for the "save 33%" badge. */
export function yearlySavingPercent(plan: Plan): number {
  if (plan.priceMonthlyCents === 0) return 0;
  const yearAtMonthly = plan.priceMonthlyCents * 12;
  return Math.round(((yearAtMonthly - plan.priceYearlyCents) / yearAtMonthly) * 100);
}

/**
 * Guards against a feature key existing with no plan granting it — which would render a
 * gate nobody can ever pass. Called by the catalogue test and by `plans:verify`.
 */
export function orphanedFeatures(): FeatureKey[] {
  const granted = new Set(PLAN_LIST.flatMap((p) => p.features));
  return FEATURE_KEYS.filter((f) => !granted.has(f));
}
