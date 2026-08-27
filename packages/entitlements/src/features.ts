/**
 * Feature keys — the closed set of things a plan can unlock.
 *
 * A feature is a boolean capability ("may this org remove the watermark"). It is
 * deliberately a different kind of thing from a limit (see `limits.ts`), which is a
 * number the org consumes. The old `FREE_LIMITS` object in `routes/billing.ts` mixed
 * the two, so `enforceLimit("remove_branding")` would answer "Monthly remove branding
 * limit reached (0)". Keeping them apart is the point of this split.
 *
 * Adding a gate means adding a key here. Because `FeatureKey` is derived from this
 * object, the pricing page, the API middleware and the UI `<Gate>` all fail to compile
 * until they account for it.
 */

/** Which plan is the cheapest one that includes each feature. */
export const FEATURE_MIN_PLAN = {
  // ── design ──────────────────────────────────────────────────────────────
  custom_fonts: "pro",
  brand_logo: "pro",
  remove_branding: "pro",

  // ── collect ─────────────────────────────────────────────────────────────
  duplicate_prevention: "pro",
  multi_language: "pro",
  respondent_auth_google: "business",
  respondent_auth_phone: "business",
  one_response_per_identity: "business",
  collect_payments: "pro",

  // ── results — where the money is ────────────────────────────────────────
  partial_responses: "pro",
  advanced_analytics: "pro",
  conversation_analytics: "pro",
  export_partials: "pro",
  ai_insights: "business",

  // ── share & deliver ─────────────────────────────────────────────────────
  form_metadata: "pro",
  completion_redirect: "pro",
  auto_reply_email: "pro",
  custom_domain: "pro",
  refill_link: "pro",
  tracking_pixels: "pro",

  // ── integrate ───────────────────────────────────────────────────────────
  api_access: "pro",

  // ── the agent ───────────────────────────────────────────────────────────
  agent_persona: "pro",
  agent_knowledge: "pro",
  agent_guardrails: "pro",
  agent_model_picker: "business",

  // ── team & governance ───────────────────────────────────────────────────
  team_roles: "pro",
  activity_log: "business",
} as const;

export type FeatureKey = keyof typeof FEATURE_MIN_PLAN;

export const FEATURE_KEYS = Object.keys(FEATURE_MIN_PLAN) as FeatureKey[];

/**
 * Human-facing metadata. `label` names the feature the way a user would
 * ("Partial responses", not `partial_responses`); `noun` is the plural thing the gate
 * counts, so an upsell can say "14 partial responses" without the caller inventing
 * wording. `soon` marks a feature that is priced but not yet built — the pricing page
 * MUST label these, because listing an unbuilt feature as included in a paid plan is a
 * misrepresentation rather than an aggressive tactic.
 */
export interface FeatureMeta {
  label: string;
  blurb: string;
  noun?: string;
  soon?: true;
}

export const FEATURES: Record<FeatureKey, FeatureMeta> = {
  custom_fonts: { label: "Custom fonts", blurb: "Pick the typeface your form is set in." },
  brand_logo: { label: "Brand logo", blurb: "Put your logo and brand name on the form." },
  remove_branding: { label: "Remove chatform branding", blurb: "Drop the “Powered by chatform” footer." },

  duplicate_prevention: { label: "Duplicate prevention", blurb: "One response per person, by IP or by answer." },
  multi_language: { label: "Multiple languages", blurb: "Serve one form in several languages." },
  respondent_auth_google: { label: "Google verification", blurb: "Ask respondents to verify who they are." },
  respondent_auth_phone: { label: "Phone verification", blurb: "Verify respondents by SMS code." },
  one_response_per_identity: { label: "One response per identity", blurb: "Cap responses per verified person." },
  collect_payments: { label: "Collect payments", blurb: "Take payment inside the conversation.", soon: true },

  partial_responses: {
    label: "Partial responses",
    blurb: "See what people told you before they left.",
    noun: "partial responses",
  },
  advanced_analytics: {
    label: "Advanced analytics",
    blurb: "Drop-off funnel, per-question answer rates, completion times.",
  },
  conversation_analytics: {
    label: "Conversation analytics",
    blurb: "Where people drop off by turn, and what they asked you.",
  },
  export_partials: { label: "Export partials & transcripts", blurb: "Include unfinished responses and chat logs in the CSV." },
  ai_insights: { label: "AI response summaries", blurb: "A written summary across all responses.", soon: true },

  form_metadata: { label: "Form metadata", blurb: "Control the link preview title, description and image." },
  completion_redirect: { label: "Redirect on completion", blurb: "Send respondents somewhere when they finish." },
  auto_reply_email: { label: "Auto-reply email", blurb: "Email the respondent after they submit." },
  custom_domain: { label: "Custom domain", blurb: "Host the form on your own domain.", soon: true },
  refill_link: { label: "Refill link", blurb: "Let a respondent come back and edit their answers.", soon: true },
  tracking_pixels: { label: "Meta Pixel & Google Tag Manager", blurb: "Track conversions on your form.", soon: true },

  api_access: { label: "API access", blurb: "Drive forms headlessly with an API key." },

  agent_persona: { label: "Custom persona", blurb: "Give the interviewer a name, a goal and a voice." },
  agent_knowledge: { label: "Knowledge base", blurb: "Let the interviewer answer questions about you." },
  agent_guardrails: { label: "Guardrails", blurb: "Forbid topics and control how it declines." },
  agent_model_picker: { label: "Model picker", blurb: "Choose which model runs the interview." },

  team_roles: { label: "Roles & permissions", blurb: "Admins, editors and viewers." },
  activity_log: { label: "Activity log", blurb: "Who did what, exportable as CSV." },
};

/** The cheapest plan that includes `feature`. Drives every "requiredPlan" in a 402. */
export function minPlanFor(feature: FeatureKey): "pro" | "business" {
  return FEATURE_MIN_PLAN[feature];
}
