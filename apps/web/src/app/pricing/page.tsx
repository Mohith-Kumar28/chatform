"use client";

import { Fragment, useState } from "react";
import Link from "next/link";
import { Check, Minus, Lock } from "lucide-react";
import { useGetApiBillingPlans, getGetApiBillingPlansQueryKey } from "@/lib/api/billing/billing";
import { cn } from "@/lib/utils";

/**
 * The public pricing page.
 *
 * Reads `/api/billing/plans`, which serves the **seeded** catalogue rather than the
 * in-process one — so what this page promises is what the gates actually enforce. A
 * hardcoded table here would drift from the database the first time a limit changed.
 */

interface PlanRow {
  id: "free" | "pro" | "business";
  name: string;
  tagline: string;
  priceMonthlyCents: number;
  priceYearlyCents: number;
  priceYearlyPerMonthCents: number;
  yearlySavingPercent: number;
  seatPriceCents: number;
  currency: string;
  features: string[];
  limits: Record<string, number | null>;
  checkoutReady: boolean;
}

interface Catalogue {
  plans: PlanRow[];
  features: Record<string, { label: string; blurb: string; minPlan: string; soon: boolean }>;
  limits: Record<string, { label: string; unit: string; mode: string }>;
}

/** The comparison rows, grouped the way someone shopping actually thinks. */
const GROUPS: { title: string; rows: ({ limit: string } | { feature: string })[] }[] = [
  {
    title: "Build & collect",
    rows: [
      { limit: "responses_per_month" },
      { limit: "responses_ceiling_per_month" },
      { limit: "forms_count" },
      { limit: "blocks_per_form" },
      { limit: "workspaces_count" },
      { limit: "max_upload_mb_per_file" },
      { limit: "file_storage_mb" },
      { feature: "duplicate_prevention" },
      { feature: "multi_language" },
      { feature: "respondent_auth_google" },
      { feature: "respondent_auth_phone" },
      { feature: "collect_payments" },
    ],
  },
  {
    title: "Results",
    rows: [{ feature: "partial_responses" }, { feature: "advanced_analytics" }, { feature: "conversation_analytics" }, { feature: "export_partials" }, { feature: "ai_insights" }],
  },
  {
    title: "Brand & share",
    rows: [
      { feature: "remove_branding" },
      { feature: "brand_logo" },
      { feature: "custom_fonts" },
      { feature: "custom_domain" },
      { feature: "form_metadata" },
      { feature: "completion_redirect" },
      { feature: "auto_reply_email" },
      { feature: "refill_link" },
      { feature: "tracking_pixels" },
    ],
  },
  {
    title: "The interviewer",
    rows: [
      { limit: "ai_conversations_per_month" },
      { limit: "ai_generations_per_month" },
      { limit: "agent_max_turns" },
      { feature: "agent_persona" },
      { feature: "agent_knowledge" },
      { feature: "agent_guardrails" },
      { feature: "agent_model_picker" },
      { limit: "knowledge_entries" },
    ],
  },
  {
    title: "Team & integrations",
    rows: [{ limit: "seats" }, { limit: "webhooks_per_form" }, { feature: "api_access" }, { limit: "api_requests_per_month" }, { feature: "team_roles" }, { feature: "activity_log" }],
  },
];

function formatLimit(value: number | null, unit: string): string {
  if (value === null) return "Unlimited";
  if (value === 0) return "—";
  if (unit === "megabytes") return value >= 1024 ? `${Math.round(value / 1024)} GB` : `${value} MB`;
  if (unit === "tokens" && value >= 1_000_000) return `${value / 1_000_000}M`;
  if (unit === "tokens" && value >= 1_000) return `${value / 1_000}k`;
  if (unit === "chars") return `${value.toLocaleString()} chars`;
  return value.toLocaleString();
}

export default function PricingPage() {
  // Annual by default: it is the better deal for the customer and the better number for
  // us, and it is what every comparable product does.
  const [cycle, setCycle] = useState<"monthly" | "yearly">("yearly");
  const { data: raw } = useGetApiBillingPlans({
    query: { queryKey: getGetApiBillingPlansQueryKey(), staleTime: 5 * 60_000 },
  });
  const data = raw as Catalogue | undefined;
  const plans = data?.plans ?? [];

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-14">
      <header className="mx-auto max-w-2xl text-center">
        <h1 className="font-display text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
          Collect for free. Pay when you want to look closer.
        </h1>
        <p className="text-muted-foreground mt-4 text-lg text-pretty">
          Every plan includes unlimited forms and unlimited responses. Build it, publish it,
          and collect real answers without paying anything.
        </p>

        <div className="bg-muted mx-auto mt-8 inline-flex rounded-lg p-0.5 text-sm">
          {(["yearly", "monthly"] as const).map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCycle(c)}
              className={cn(
                "rounded-[0.4rem] px-4 py-1.5 font-medium transition-colors",
                cycle === c ? "bg-[var(--background)] shadow-sm" : "text-muted-foreground",
              )}
            >
              {c === "yearly" ? "Yearly" : "Monthly"}
              {c === "yearly" && plans[1] && (
                <span className="ml-1.5 text-xs text-[var(--primary)]">save {plans[1].yearlySavingPercent}%</span>
              )}
            </button>
          ))}
        </div>
      </header>

      <div className="mt-12 grid gap-4 md:grid-cols-3">
        {plans.map((plan) => {
          const perMonth = cycle === "yearly" ? plan.priceYearlyPerMonthCents : plan.priceMonthlyCents;
          const isTarget = plan.id === "pro";
          return (
            <div
              key={plan.id}
              className={cn(
                "bg-card relative flex flex-col rounded-2xl p-6",
                isTarget && "ring-2 ring-[var(--primary)]",
              )}
            >
              {isTarget && (
                <span className="absolute -top-2.5 left-6 rounded-full bg-[var(--primary)] px-2.5 py-0.5 text-[0.6875rem] font-medium text-[var(--primary-foreground)]">
                  Most popular
                </span>
              )}
              <h2 className="font-display text-lg font-semibold tracking-tight">{plan.name}</h2>
              <p className="text-muted-foreground mt-1 text-sm text-pretty">{plan.tagline}</p>

              <div className="mt-5 flex items-baseline gap-1.5">
                <span className="font-display text-4xl font-semibold tracking-tight tabular-nums">
                  ${(perMonth / 100).toFixed(0)}
                </span>
                <span className="text-muted-foreground text-sm">{plan.id === "free" ? "forever" : "/mo"}</span>
              </div>
              {plan.id !== "free" && (
                <p className="text-muted-foreground mt-1 text-xs">
                  {cycle === "yearly"
                    ? `$${(plan.priceYearlyCents / 100).toFixed(0)} billed yearly`
                    : "billed monthly"}
                </p>
              )}

              {plan.id === "free" ? (
                <Link
                  href="/signin"
                  className="mt-6 inline-flex h-10 items-center justify-center rounded-lg border border-[var(--border)] text-sm font-medium transition-colors hover:bg-[var(--muted)]"
                >
                  Start free
                </Link>
              ) : (
                <Link
                  href={`/billing?plan=${plan.id}&cycle=${cycle}`}
                  className={cn(
                    "mt-6 inline-flex h-10 items-center justify-center rounded-lg text-sm font-medium transition-opacity hover:opacity-90",
                    isTarget
                      ? "bg-[var(--primary)] text-[var(--primary-foreground)]"
                      : "border border-[var(--border)]",
                  )}
                >
                  Choose {plan.name}
                </Link>
              )}
              {/* Never offer a button that 503s: if the environment has no Dodo product for
                  this plan, say so rather than letting someone click into a dead end. */}
              {!plan.checkoutReady && (
                <p className="text-muted-foreground mt-2 text-center text-xs">Contact us to set this up</p>
              )}

              {plan.id === "business" && plan.seatPriceCents > 0 && (
                <p className="text-muted-foreground mt-3 text-xs">
                  {plan.limits.seats} seats included, then ${(plan.seatPriceCents / 100).toFixed(0)}/mo each
                </p>
              )}
            </div>
          );
        })}
      </div>

      {/* The full comparison. Built from the API payload so it can never claim something
          the gates do not honour. */}
      {data && (
        <div className="mt-16">
          <h2 className="font-display text-xl font-semibold tracking-tight">Everything, compared</h2>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[46rem] text-sm">
              <thead>
                <tr className="border-b border-[var(--border)]">
                  <th className="py-2.5 pr-4 text-left font-medium" />
                  {plans.map((p) => (
                    <th key={p.id} className="w-32 px-3 py-2.5 text-center text-xs font-medium">
                      {p.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {GROUPS.map((group) => (
                  <Fragment key={group.title}>
                    <tr>
                      <th
                        colSpan={plans.length + 1}
                        className="text-muted-foreground pt-6 pb-2 text-left text-[0.6875rem] font-semibold tracking-wider uppercase"
                      >
                        {group.title}
                      </th>
                    </tr>
                    {group.rows.map((row) => {
                      if ("limit" in row) {
                        const meta = data.limits[row.limit];
                        if (!meta) return null;
                        return (
                          <tr key={row.limit} className="border-b border-[var(--border)]/60">
                            <td className="py-2.5 pr-4">{meta.label}</td>
                            {plans.map((p) => (
                              <td key={p.id} className="px-3 py-2.5 text-center tabular-nums">
                                {formatLimit(p.limits[row.limit] ?? null, meta.unit)}
                              </td>
                            ))}
                          </tr>
                        );
                      }
                      const meta = data.features[row.feature];
                      if (!meta) return null;
                      return (
                        <tr key={row.feature} className="border-b border-[var(--border)]/60">
                          <td className="py-2.5 pr-4">
                            {meta.label}
                            {/* Priced, not built. Marked in plain sight: listing an unbuilt
                                feature as included in a paid plan is a misrepresentation. */}
                            {meta.soon && (
                              <span className="text-muted-foreground ml-1.5 text-xs">coming soon</span>
                            )}
                          </td>
                          {plans.map((p) => (
                            <td key={p.id} className="px-3 py-2.5 text-center">
                              {p.features.includes(row.feature) ? (
                                <Check className="mx-auto size-4 text-[var(--primary)]" aria-label="Included" />
                              ) : (
                                <Minus className="text-muted-foreground/40 mx-auto size-4" aria-label="Not included" />
                              )}
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>

          <div className="text-muted-foreground mt-8 space-y-2 text-xs">
            <p className="flex items-start gap-1.5">
              <Lock className="mt-0.5 size-3 shrink-0" aria-hidden />
              <span>
                <strong>“Unlimited responses”</strong> means no per-plan quota. There is a monthly
                ceiling for fair use — {formatLimit(plans[0]?.limits.responses_ceiling_per_month ?? null, "count")} on
                Free and {formatLimit(plans[1]?.limits.responses_ceiling_per_month ?? null, "count")} on paid plans.
                We would rather tell you the number than write “subject to fair usage”.
              </span>
            </p>
            <p>
              Every response is a real conversation with a language model, which costs us money —
              so AI conversations are metered. Past the monthly count your forms keep collecting,
              asking their questions directly instead of conversationally. Nothing breaks and no
              response is lost.
            </p>
            <p>Prices in USD. Tax is handled at checkout. Cancel any time from the billing portal.</p>
          </div>
        </div>
      )}
    </div>
  );
}
