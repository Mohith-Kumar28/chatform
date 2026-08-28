"use client";

import { Fragment, useState } from "react";
import { Check, Lock, Minus } from "lucide-react";
import { useGetApiBillingPlans, getGetApiBillingPlansQueryKey } from "@/lib/api/billing/billing";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Band, BandTitle, BandLede } from "@/components/marketing/band";
import { PlanCard } from "@/components/marketing/plan-card";
import { BlockTypeGrid } from "@/components/marketing/block-type-grid";
import { QUESTION_TYPE_COUNT_WORD } from "@/components/marketing/question-types";
import { ComparisonTable } from "@/components/marketing/comparison-table";
import { Faq } from "@/components/marketing/faq";
import { CtaBand } from "@/components/marketing/cta-band";

/**
 * The public pricing page — and now the page that carries everything the
 * landing page stopped carrying.
 *
 * The landing page had grown into a specification: a 26-tile question-type
 * grid, a seven-vendor comparison matrix with footnotes, and an eight-item FAQ
 * of paragraph answers, all above the fold of a decision nobody had made yet.
 * Those three things are not persuasion, they are due diligence, and due
 * diligence happens here — after somebody has decided they are interested and
 * gone looking for the price. So they live on this page, in that order:
 * price, then what you can ask, then how it compares, then the objections.
 *
 * The plan data still comes from `/api/billing/plans`, which serves the
 * **seeded** catalogue rather than the in-process one — so what this page
 * promises is what the gates actually enforce. A hardcoded table here would
 * drift from the database the first time a limit changed. The cards are the
 * shared `PlanCard`, fed from that payload.
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
    rows: [
      { feature: "partial_responses" },
      { feature: "advanced_analytics" },
      { feature: "conversation_analytics" },
      { feature: "export_partials" },
      { feature: "ai_insights" },
    ],
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
    rows: [
      { limit: "seats" },
      { limit: "webhooks_per_form" },
      { feature: "api_access" },
      { limit: "api_requests_per_month" },
      { feature: "team_roles" },
      { feature: "activity_log" },
    ],
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
  // Annual by default: it is the better deal for the customer and the better
  // number for us, and it is what every comparable product does.
  const [cycle, setCycle] = useState<"yearly" | "monthly">("yearly");
  const annual = cycle === "yearly";
  const { data: raw } = useGetApiBillingPlans({
    query: { queryKey: getGetApiBillingPlansQueryKey(), staleTime: 5 * 60_000 },
  });
  const data = raw as Catalogue | undefined;
  const plans = data?.plans ?? [];
  const saving = plans.find((p) => p.id === "pro")?.yearlySavingPercent;

  return (
    <>
      <Band size="tall">
        <div className="max-w-2xl">
          <BandTitle as="h1">Collect for free. Pay to look closer.</BandTitle>
          <BandLede>
            Unlimited forms and unlimited responses on every plan, including the free one.
          </BandLede>
        </div>

        <div className="mt-10 flex flex-col items-center gap-9">
          <SegmentedControl
            options={[
              { value: "yearly", label: saving ? `Yearly · save ${saving}%` : "Yearly" },
              { value: "monthly", label: "Monthly" },
            ]}
            value={cycle}
            onChange={setCycle}
            ariaLabel="Billing period"
          />

          <div className="grid w-full items-stretch gap-5 lg:grid-cols-3">
            {plans.length === 0
              ? // The catalogue is a client fetch, so the first paint has no plans.
                // Three cards' worth of shimmer holds the grid instead of letting
                // the page jump a screen-height when they land.
                [0, 1, 2].map((i) => (
                  <div key={i} className="shimmer h-[26rem] rounded-2xl" />
                ))
              : plans.map((plan) => (
                  <PlanCard
                    key={plan.id}
                    annual={annual}
                    featured={plan.id === "pro"}
                    plan={plan}
                    ctaHref={
                      plan.id === "free" ? "/signin" : `/billing?plan=${plan.id}&cycle=${cycle}`
                    }
                    ctaLabel={plan.id === "free" ? "Start free" : `Choose ${plan.name}`}
                    note={plan.checkoutReady ? undefined : "Contact us to set this up"}
                    soonLabels={plan.features
                      .filter((f) => data?.features[f]?.soon)
                      .map((f) => data!.features[f]!.label.toLowerCase())}
                  />
                ))}
          </div>

          {plans[0] && plans[1] && (
            <div className="text-caption text-muted-foreground mx-auto max-w-3xl space-y-2.5">
              <p className="flex items-start gap-2">
                <Lock className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                <span>
                  <strong className="text-foreground font-semibold">
                    &ldquo;Unlimited responses&rdquo;
                  </strong>{" "}
                  means no per-plan quota. There is a monthly ceiling for fair use —{" "}
                  {formatLimit(plans[0].limits.responses_ceiling_per_month ?? null, "count")} on
                  Free and{" "}
                  {formatLimit(plans[1].limits.responses_ceiling_per_month ?? null, "count")} on
                  paid plans. We would rather tell you the number than write
                  &ldquo;subject to fair usage&rdquo;.
                </span>
              </p>
              <p>
                Every response is a real conversation with a language model, which costs us
                money — so AI conversations are metered. Past the monthly count your forms
                keep collecting, asking their questions directly instead of conversationally.
                Nothing breaks and no response is lost.
              </p>
              <p>
                Prices in USD. Tax is handled at checkout. Cancel any time from the billing
                portal.
              </p>
            </div>
          )}
        </div>
      </Band>

      {/* Moved here from the landing page, where 26 tiles cost a full screen to
          say something the hero's spectrum strip now says in a fifth of it. */}
      <Band id="question-types" tone="number">
        <div className="max-w-2xl">
          <BandTitle>{QUESTION_TYPE_COUNT_WORD} ways to ask.</BandTitle>
          <BandLede tone="number">
            Each renders its own control in the conversation — and still accepts a typed
            answer.
          </BandLede>
        </div>
        <div className="mt-10">
          <BlockTypeGrid />
        </div>
      </Band>

      <Band id="compare" tone="sand">
        <div className="max-w-2xl">
          <BandTitle>Most of these render a field and wait.</BandTitle>
          <BandLede>
            Including where someone else already does what we do.
          </BandLede>
        </div>
        <div className="mt-10">
          <ComparisonTable />
        </div>
      </Band>

      {/* The full matrix, built from the API payload so it can never claim
          something the gates do not honour. */}
      {data && (
        <Band id="everything">
          <BandTitle className="max-w-2xl">Everything, compared.</BandTitle>
          <div className="mt-10 overflow-x-auto [overflow-y:visible]">
            <table className="w-full min-w-[46rem] text-sm">
              {/* Forty rows of ticks and numbers, and the only thing that says
                  which column is which is one row at the very top. Sticky, at
                  the height of the marketing nav so the two do not overlap —
                  DESIGN.md 4.4 asks for this on every table and this is the one
                  that most needs it. */}
              <thead className="bg-background sticky top-[3.375rem] z-[1]">
                <tr className="border-border border-b">
                  <th className="bg-background py-2.5 pr-4 text-left font-medium" />
                  {plans.map((p) => (
                    <th
                      key={p.id}
                      className={
                        p.id === "pro"
                          ? "text-primary bg-background w-32 px-3 py-2.5 text-center text-xs font-semibold"
                          : "bg-background w-32 px-3 py-2.5 text-center text-xs font-medium"
                      }
                    >
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
                        className="text-muted-foreground pt-7 pb-2 text-left text-[0.6875rem] font-semibold tracking-wider uppercase"
                      >
                        {group.title}
                      </th>
                    </tr>
                    {group.rows.map((row) => {
                      if ("limit" in row) {
                        const meta = data.limits[row.limit];
                        if (!meta) return null;
                        return (
                          <tr key={row.limit} className="border-border/60 border-b">
                            <td className="py-2.5 pr-4">{meta.label}</td>
                            {plans.map((p) => (
                              <td key={p.id} className="tabular px-3 py-2.5 text-center">
                                {formatLimit(p.limits[row.limit] ?? null, meta.unit)}
                              </td>
                            ))}
                          </tr>
                        );
                      }
                      const meta = data.features[row.feature];
                      if (!meta) return null;
                      return (
                        <tr key={row.feature} className="border-border/60 border-b">
                          <td className="py-2.5 pr-4">
                            {meta.label}
                            {/* Priced, not built. Marked in plain sight: listing an
                                unbuilt feature as included in a paid plan is a
                                misrepresentation. */}
                            {meta.soon && (
                              <span className="text-muted-foreground ml-1.5 text-xs">
                                coming soon
                              </span>
                            )}
                          </td>
                          {plans.map((p) => (
                            <td key={p.id} className="px-3 py-2.5 text-center">
                              {p.features.includes(row.feature) ? (
                                <Check
                                  className="text-primary mx-auto size-4"
                                  strokeWidth={2.5}
                                  aria-label="Included"
                                />
                              ) : (
                                <Minus
                                  className="text-muted-foreground/40 mx-auto size-4"
                                  aria-label="Not included"
                                />
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
        </Band>
      )}

      <Band id="faq" tone="content">
        <BandTitle className="mx-auto max-w-2xl text-center">
          The things people ask before they trust this.
        </BandTitle>
        <div className="mt-10">
          <Faq />
        </div>
      </Band>

      <CtaBand />
    </>
  );
}
