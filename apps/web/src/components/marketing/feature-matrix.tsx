import { Check, Minus } from "lucide-react";
import {
  FEATURE_MIN_PLAN,
  FEATURES,
  LIMITS,
  PLAN_LIST,
  type FeatureKey,
  type LimitKey,
  type PlanId,
} from "@repo/entitlements";

/**
 * The full matrix, generated from the entitlements catalogue.
 *
 * Adding a feature key makes a row appear here on the next build — there is no
 * hand-maintained list to forget. `orphanedFeatures()` already guards the
 * other direction. Anything flagged `soon` renders as "Coming soon" and never
 * as a tick, per the standing instruction in `features.ts`.
 */

const FEATURE_GROUPS: { title: string; keys: readonly FeatureKey[] }[] = [
  { title: "Design", keys: ["custom_fonts", "brand_logo", "remove_branding"] },
  {
    title: "Collect",
    keys: [
      "duplicate_prevention",
      "multi_language",
      "respondent_auth_google",
      "respondent_auth_phone",
      "one_response_per_identity",
      "collect_payments",
    ],
  },
  {
    title: "Results",
    keys: [
      "partial_responses",
      "advanced_analytics",
      "conversation_analytics",
      "export_partials",
      "ai_insights",
    ],
  },
  {
    title: "Share & deliver",
    keys: [
      "form_metadata",
      "completion_redirect",
      "auto_reply_email",
      "custom_domain",
      "refill_link",
      "tracking_pixels",
    ],
  },
  { title: "Integrate", keys: ["api_access"] },
  {
    title: "The interviewer",
    keys: ["agent_persona", "agent_knowledge", "agent_guardrails", "agent_model_picker"],
  },
  { title: "Team & governance", keys: ["team_roles", "activity_log"] },
];

const LIMIT_ROWS: readonly LimitKey[] = [
  "responses_ceiling_per_month",
  "ai_conversations_per_month",
  "ai_generations_per_month",
  "api_requests_per_month",
  "forms_count",
  "workspaces_count",
  "seats",
  "file_storage_mb",
  "max_upload_mb_per_file",
  "blocks_per_form",
  "webhooks_per_form",
  "knowledge_chars",
  "agent_max_turns",
];

const RANK: Record<PlanId, number> = { free: 0, pro: 1, business: 2 };

function formatLimit(key: LimitKey, value: number | null): string {
  if (value === null) return "Unlimited";
  if (value === 0) return "—";
  const meta = LIMITS[key];
  if (meta.unit === "megabytes") {
    return value >= 1024 ? `${Math.round(value / 1024)} GB` : `${value} MB`;
  }
  if (meta.unit === "chars") {
    return value >= 1000 ? `${Math.round(value / 1000)}k characters` : `${value} characters`;
  }
  if (meta.unit === "tokens") {
    return value >= 1_000_000 ? `${value / 1_000_000}M` : `${(value / 1000).toLocaleString()}k`;
  }
  return value.toLocaleString();
}

export function FeatureMatrix() {
  return (
    <div className="border-border/70 overflow-x-auto rounded-2xl border">
      <table className="w-full min-w-[46rem] border-collapse text-left">
        <caption className="sr-only">
          Feature and limit comparison across the Free, Pro and Business plans
        </caption>
        <thead className="bg-muted/50 sticky top-0">
          <tr>
            <th scope="col" className="text-caption w-[40%] px-5 py-3 font-semibold">
              Feature
            </th>
            {PLAN_LIST.map((plan) => (
              <th key={plan.id} scope="col" className="text-caption px-5 py-3 font-semibold">
                {plan.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {FEATURE_GROUPS.map((group) => (
            <GroupRows key={group.title} title={group.title}>
              {group.keys.map((key) => {
                const meta = FEATURES[key];
                const min = FEATURE_MIN_PLAN[key];
                return (
                  <tr key={key} className="border-border/50 border-t">
                    <th scope="row" className="px-5 py-3 font-normal">
                      <span className="text-body block font-medium">{meta.label}</span>
                      <span className="text-micro text-muted-foreground block">{meta.blurb}</span>
                    </th>
                    {PLAN_LIST.map((plan) => (
                      <td key={plan.id} className="px-5 py-3">
                        <Cell
                          included={RANK[plan.id] >= RANK[min]}
                          soon={meta.soon === true}
                        />
                      </td>
                    ))}
                  </tr>
                );
              })}
            </GroupRows>
          ))}

          <GroupRows title="Limits">
            {LIMIT_ROWS.map((key) => (
              <tr key={key} className="border-border/50 border-t">
                <th scope="row" className="text-body px-5 py-3 font-medium">
                  {LIMITS[key].label}
                  {key === "responses_ceiling_per_month" && (
                    <span className="text-micro text-muted-foreground block font-normal">
                      Responses themselves are unlimited; this is the fair-use ceiling.
                    </span>
                  )}
                </th>
                {PLAN_LIST.map((plan) => (
                  <td key={plan.id} className="text-body tabular px-5 py-3">
                    {formatLimit(key, plan.limits[key])}
                  </td>
                ))}
              </tr>
            ))}
          </GroupRows>
        </tbody>
      </table>
    </div>
  );
}

function GroupRows({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <>
      <tr className="bg-muted/40">
        <th
          scope="colgroup"
          colSpan={PLAN_LIST.length + 1}
          className="text-micro px-5 py-2 font-semibold tracking-[0.12em] uppercase"
        >
          {title}
        </th>
      </tr>
      {children}
    </>
  );
}

function Cell({ included, soon }: { included: boolean; soon: boolean }) {
  if (!included) {
    return (
      <>
        <Minus className="text-muted-foreground/50 size-4" strokeWidth={2} aria-hidden />
        <span className="sr-only">Not included</span>
      </>
    );
  }
  if (soon) {
    return (
      <span className="bg-warning-soft text-warning-foreground text-micro rounded-full px-2 py-0.5 font-medium">
        Coming soon
      </span>
    );
  }
  return (
    <>
      <Check className="text-primary size-4" strokeWidth={2.5} aria-hidden />
      <span className="sr-only">Included</span>
    </>
  );
}
