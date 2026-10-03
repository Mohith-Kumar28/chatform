"use client";

import { Fragment, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowDown, Check, Minus, Plus } from "lucide-react";
import { customFetch } from "@/lib/api/mutator";
import type { Catalogue, CataloguePlan } from "@/lib/pricing-catalogue";
import { Band, Eyebrow } from "@/components/marketing/band";
import { PLAN_HIGHLIGHTS } from "@/components/marketing/plan-card";
import { QUESTION_TYPE_COUNT } from "@/components/marketing/question-types";
import { PricingCalculator } from "@/components/marketing/pricing-calculator";
import { PRICING_FAQ } from "@/components/marketing/pricing-faq";
import { GradientBand } from "@/components/marketing/cta-band";
import { InkCta, PrimaryCta, TextLink } from "@/components/marketing/kit";
import { cn } from "@/lib/utils";

/**
 * The public pricing page, laid out after Youform's section for section: a
 * split hero with what is free beside the headline, three plan cards, a month
 * of responses priced here and at Typeform, the full comparison under a dark
 * header with the Pro column tinted, the questions, and a centred close.
 *
 * Fair use is small print here, the way it is there: a linked line, and the
 * figures once, under the table. It is never a headline.
 *
 * The plan data comes from `/api/billing/plans`, which serves the **seeded**
 * catalogue rather than the in-process one, so what this page promises is what
 * the gates enforce. Rows that are not a gate (logic, signatures, embeds) are
 * `everyPlan`; a row that is being built says so with `soon` and is never
 * drawn as included.
 */

/** What Free includes, the list a visitor does not expect to be free. */
const FREE_INCLUDES = (maxFileMb: number) => [
  "Conditional logic",
  "Scores and quizzes",
  "Signatures",
  `File uploads up to ${maxFileMb} MB`,
  "Themes, colours and built-in fonts",
  "Hidden fields and multiple endings",
  "Website embeds and QR codes",
  "Email alerts to yourself",
  "Google Sheets and Excel",
  "Webhooks",
  "Scheduling links",
  "Claude and ChatGPT connector",
  "An AI form builder",
  "A knowledge base it answers from",
];

type Row =
  | { limit: string; label?: string }
  | { feature: string; label?: string }
  | { everyPlan: string }
  /** Hand-written cells, for a row that is words rather than a gate. */
  | { text: string; cells: [string, string, string] }
  | { soon: string };

/** The comparison rows, grouped the way someone shopping actually thinks. */
const GROUPS: { title: string; rows: Row[] }[] = [
  {
    title: "Make it yours",
    rows: [
      { everyPlan: `Unlimited responses, all ${QUESTION_TYPE_COUNT} question types` },
      { everyPlan: "Themes, colours and built-in fonts" },
      { everyPlan: "Logic, scores and calculations" },
      { everyPlan: "Hidden fields and multiple endings" },
      { everyPlan: "Signatures" },
      { limit: "max_upload_mb_per_file", label: "File uploads, per file" },
      { limit: "file_storage_mb" },
      { feature: "remove_branding" },
      { feature: "brand_logo", label: "Your logo and brand name" },
      { feature: "custom_fonts" },
      { feature: "form_metadata", label: "Link preview title and image" },
      { feature: "custom_domain" },
      { feature: "multi_language" },
    ],
  },
  {
    title: "The conversation",
    rows: [
      { limit: "ai_conversations_per_month" },
      { limit: "ai_generations_per_month" },
      { everyPlan: "Asks again when an answer is thin" },
      { everyPlan: "A switch to ask every question word for word" },
      { feature: "agent_knowledge" },
      { limit: "knowledge_sources_count" },
      { limit: "knowledge_bytes" },
      { feature: "agent_persona" },
      { feature: "agent_guardrails" },
    ],
  },
  {
    title: "Share and connect",
    rows: [
      { everyPlan: "Share links, website embeds and QR codes" },
      { everyPlan: "Google Sheets and Excel" },
      { limit: "webhooks_per_form" },
      { everyPlan: "Claude and ChatGPT connector" },
      { everyPlan: "Scheduling links" },
      { everyPlan: "Email alerts to yourself" },
      { soon: "Zapier, Make and Slack" },
      { feature: "api_access" },
      { limit: "api_requests_per_month" },
      { feature: "completion_redirect" },
      { feature: "auto_reply_email" },
      { feature: "collect_payments", label: "Collect payments with Stripe" },
      { feature: "tracking_pixels" },
    ],
  },
  {
    title: "Learn and work together",
    rows: [
      { text: "Response analytics", cells: ["Basic", "Advanced", "Advanced"] },
      { feature: "advanced_analytics", label: "Drop-off rates and per-question answer rates" },
      { feature: "conversation_analytics" },
      { feature: "partial_responses" },
      { feature: "followup_email" },
      { feature: "export_partials" },
      { feature: "refill_link" },
      { limit: "workspaces_count" },
      { limit: "seats" },
      { text: "Additional team seats", cells: ["", "", "$10 / month each"] },
      { feature: "team_roles" },
      { feature: "duplicate_prevention" },
      { feature: "respondent_auth_google", label: "Respondent sign-in with Google" },
      { feature: "respondent_auth_email", label: "Respondent sign-in by email code" },
      { feature: "respondent_auth_phone", label: "Respondent sign-in by SMS code" },
      { feature: "verified_answers" },
      { feature: "one_response_per_identity" },
      { feature: "activity_log", label: "Activity log with CSV export" },
    ],
  },
];

const TINT = "bg-[var(--family-choice-soft)]";
const Included = () => <Check className="mx-auto size-[1.125rem] text-[var(--family-choice-ink)]" strokeWidth={2} aria-label="Included" />;
const NotIncluded = () => <Minus className="text-muted-foreground/50 mx-auto size-4" aria-label="Not included" />;
const usd = (cents: number) => `$${Math.round(cents / 100)}`;

/** One plan card, after Youform's: name, a line, the price, the button, a rule, the list. */
function Plan({ plan, annual, cycle }: { plan: CataloguePlan; annual: boolean; cycle: string }) {
  const free = plan.priceMonthlyCents === 0;
  const pro = plan.id === "pro";
  const href = free ? "/signin?mode=signup" : `/usage?plan=${plan.id}&cycle=${cycle}`;
  const label = free ? "Start for free" : `Get started with ${plan.name}`;
  const tagline: Record<string, string> = {
    free: "Unlimited responses with tons of features",
    pro: "Your branding, payments, follow-ups and advanced analytics",
    business: "Verified answers, activity logs and 5 team members",
  };
  return (
    <div className={cn("flex flex-col rounded-[22px] border p-7", pro ? `${TINT} border-[var(--family-choice-ink)]` : "bg-card/60 border-border")}>
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="font-display text-[1.75rem] font-semibold tracking-[-0.02em]">{plan.name}</h3>
        {pro && <span className="text-xs font-bold tracking-[0.09em] text-[var(--family-choice-ink)] uppercase">Make it yours</span>}
      </div>
      <p className="text-muted-foreground mt-3 min-h-[3rem] max-w-[17rem] text-[0.9375rem] leading-relaxed">{tagline[plan.id] ?? plan.tagline}</p>

      <p className="mt-7 flex items-baseline gap-2">
        <span className="font-display tabular text-[3.5rem] leading-none font-bold tracking-[-0.04em]">
          {usd(annual ? plan.priceYearlyPerMonthCents : plan.priceMonthlyCents)}
        </span>
        {!free && <span className="text-muted-foreground text-sm">/ month</span>}
      </p>
      <p className="mt-5 text-sm">{free ? "Forever. No credit card needed." : annual ? `Billed yearly at ${usd(plan.priceYearlyCents)}` : "Billed monthly"}</p>
      <p className="text-muted-foreground mt-1 text-sm">
        {free
          ? "No trial countdown, either."
          : annual
            ? `Or ${usd(plan.priceMonthlyCents)}/month, billed monthly`
            : `Or ${usd(plan.priceYearlyPerMonthCents)}/month, billed yearly at ${usd(plan.priceYearlyCents)}`}
      </p>

      <Link
        href={href}
        className={cn(
          "mt-6 inline-flex h-[3.25rem] items-center justify-center rounded-xl text-[0.9375rem] font-semibold transition-[background-color,transform] duration-150 ease-out active:scale-[0.98]",
          pro ? "bg-foreground text-background hover:bg-foreground/90" : "border-border bg-background hover:bg-muted border",
        )}
      >
        {label}
      </Link>
      {plan.checkoutReady === false && <p className="text-muted-foreground mt-2 text-center text-xs">Contact us to set this up</p>}

      <ul className={cn("mt-7 flex flex-col gap-4 border-t pt-7 text-[0.9375rem]", pro ? "border-[color-mix(in_oklch,var(--family-choice-ink)_30%,transparent)]" : "border-border")}>
        {[...(free ? [] : [`Everything in ${pro ? "Free" : "Pro"}, plus:`]), ...(PLAN_HIGHLIGHTS[plan.id] ?? [])].map((line) => (
          <li key={line} className="flex items-start gap-3">
            <Check className="mt-0.5 size-4 shrink-0 text-[var(--family-choice-ink)]" strokeWidth={2} />
            {line}
          </li>
        ))}
      </ul>
    </div>
  );
}

function formatLimit(value: number | null, unit: string): string {
  if (value === null) return "Unlimited";
  if (value === 0) return "—";
  if (unit === "megabytes") return value >= 1024 ? `${Math.round(value / 1024)} GB` : `${value} MB`;
  if (unit === "tokens" && value >= 1_000_000) return `${value / 1_000_000}M`;
  if (unit === "tokens" && value >= 1_000) return `${value / 1_000}k`;
  if (unit === "chars") return `${value.toLocaleString()} chars`;
  if (unit === "bytes") {
    const mb = value / (1024 * 1024);
    return mb >= 1024 ? `${Math.round(mb / 1024)} GB` : `${Math.round(mb)} MB`;
  }
  return value.toLocaleString();
}

export function PricingPageClient({ initial }: { initial: Catalogue }) {
  // Yearly first and selected, the owner's call: it is the lower figure, and
  // the card still says what monthly billing would be.
  const [cycle, setCycle] = useState<"yearly" | "monthly">("yearly");
  const annual = cycle === "yearly";
  /**
   * A plain fetch rather than the generated react-query hook.
   *
   * That hook was the only thing on any marketing route that needed a
   * `QueryClientProvider`, and keeping it meant mounting TanStack Query — and,
   * through it, the whole signed-in app shell — on public pages to overlay one
   * boolean onto a catalogue the server had already rendered.
   *
   * Nothing here wanted a cache: the query had no invalidation, no mutation
   * and no second reader, and a `staleTime` on a page people open once is not
   * doing work. One request on mount, and `live ?? initial` below is unchanged.
   */
  const [live, setLive] = useState<Catalogue | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    customFetch<Catalogue>("/api/billing/plans", { method: "GET" })
      .then((next) => {
        if (alive) setLive(next);
      })
      // The authoring catalogue is already on screen and already right about
      // everything but `checkoutReady`; a failed refresh should leave it there.
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  /**
   * The seeded catalogue when it arrives, the authoring catalogue until then.
   *
   * `initial` is built on the server from `@repo/entitlements` — the same
   * source the seed SQL is generated from, with `pnpm plans:verify` asserting
   * they have not drifted. So this page now renders its prices, its plan names
   * and its whole feature matrix into the HTML, and the live fetch replaces
   * them with values it already agrees with.
   *
   * `live` is kept separate from `data` for exactly one field: `checkoutReady`
   * depends on a Dodo product id that only the database knows, and rendering a
   * "contact us to set this up" note against a guess would put a false claim in
   * the prerendered HTML — which is the thing this whole change exists to stop.
   */
  const data = live ?? initial;
  const plans = data.plans;
  const free = plans.find((p) => p.id === "free");
  const pro = plans.find((p) => p.id === "pro");
  const saving = Math.max(...plans.map((p) => p.yearlySavingPercent));
  const cell = "px-1 py-[1.125rem] text-center sm:px-4";

  return (
    <>
      <Band>
        <div className="grid items-center gap-12 lg:grid-cols-[1fr_0.95fr] lg:gap-20">
          <div>
            <Eyebrow>chatform pricing</Eyebrow>
            <h1 className="font-display mt-7 text-[clamp(2.6rem,1.3rem+3.9vw,3.75rem)] leading-[1.06] font-semibold tracking-[-0.04em] text-balance">
              Forms that talk.
              <span className="block sm:whitespace-nowrap">Unlimited responses.</span>
              <span className="font-hand text-primary block text-[1.18em] leading-[1] font-normal tracking-normal">Free forever.</span>
            </h1>
            <p className="text-muted-foreground mt-7 max-w-lg text-[1.0625rem] leading-relaxed text-pretty">
              Create, customise and share forms that talk, on a free plan you can keep using. More responses don&apos;t
              mean a bigger bill. Upgrade only when you need advanced features.
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-x-7 gap-y-4">
              <PrimaryCta className="h-[3.25rem] rounded-xl">Create your free account</PrimaryCta>
              <TextLink href="#plans">Compare plans</TextLink>
            </div>
            <p className="text-muted-foreground mt-5 text-xs">
              No credit card. No trial countdown.{" "}
              <a href="#fair-use" className="underline underline-offset-4">
                Fair use applies.
              </a>
            </p>
          </div>

          <div className={`rounded-[22px] ${TINT} px-7 py-9 sm:px-9 sm:py-10`}>
            <h2 className="font-display text-2xl font-semibold tracking-[-0.025em]">Yes, all this is free.</h2>
            <ul className="mt-7 grid gap-x-8 gap-y-6 text-[0.9375rem] sm:grid-cols-2">
              {FREE_INCLUDES(free?.limits.max_upload_mb_per_file ?? 5).map((item) => (
                <li key={item} className="flex items-start gap-3">
                  <Check className="mt-0.5 size-4 shrink-0 text-[var(--family-choice-ink)]" strokeWidth={2} />
                  {item}
                </li>
              ))}
            </ul>
            <div className="mt-9">
              <TextLink href="#everything" className="text-sm">
                See every included feature
              </TextLink>
            </div>
          </div>
        </div>
      </Band>

      <Band id="plans">
        <div className="mx-auto max-w-4xl text-center">
          <h2 className="font-display text-[clamp(1.9rem,1.1rem+2.6vw,2.9rem)] leading-[1.25] font-semibold tracking-[-0.035em]">
            Our forms do the <span className="font-hand text-primary text-[1.2em] font-normal tracking-normal">talking.</span>
            <span className="block">
              Our prices leave you <span className="font-hand text-primary text-[1.2em] font-normal tracking-normal">speechless.</span>
            </span>
          </h2>
          <p className="text-muted-foreground mx-auto mt-6 max-w-2xl text-[1.0625rem] leading-relaxed">
            Stay on Free for as long as it fits. Choose Pro for your own branding, payments and advanced features.
            Business adds verified answers and more team seats.
          </p>
        </div>

        <div role="radiogroup" aria-label="Billing period" className="border-border bg-card/60 mx-auto mt-9 flex w-fit rounded-xl border p-1.5">
          {(["yearly", "monthly"] as const).map((value) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={cycle === value}
              onClick={() => setCycle(value)}
              className={cn(
                "rounded-lg border px-4 py-2.5 text-[0.9375rem] font-semibold transition-colors duration-150",
                cycle === value ? "border-foreground bg-background" : "border-transparent",
              )}
            >
              {value === "monthly" ? "Monthly" : "Yearly"}
              {value === "yearly" && <span className="ml-2.5 text-sm font-normal">Save up to {saving}%</span>}
            </button>
          ))}
        </div>

        <div className="mt-11 grid items-stretch gap-5 lg:grid-cols-3">
          {plans.map((plan) => (
            <Plan key={plan.id} plan={plan} annual={annual} cycle={cycle} />
          ))}
        </div>

        <p className="text-muted-foreground mt-7 text-center text-xs">
          All prices in USD. Choose your plan in your account.{" "}
          <a href="#fair-use" className="underline underline-offset-4">
            Fair use
          </a>{" "}
          applies.
        </p>
        <a href="#everything" className="mt-9 inline-flex items-center gap-2 text-[0.9375rem] font-semibold underline-offset-[5px] hover:underline">
          A closer look at what&apos;s included
          <ArrowDown className="size-4" />
        </a>
      </Band>

      {pro && (
        <Band id="typeform" containerClassName="max-w-[65rem]">
          <Eyebrow>chatform &amp; Typeform · a little number play</Eyebrow>
          <div className="mt-5 grid items-end gap-6 lg:grid-cols-[1.25fr_0.75fr] lg:gap-16">
            <h2 className="font-display text-[clamp(2rem,1.2rem+2.6vw,3rem)] leading-[1.12] font-semibold tracking-[-0.04em]">
              More people answering.
              <span className="font-hand text-primary block text-[1.18em] leading-[1.05] font-normal tracking-normal">What&apos;s the monthly bill?</span>
            </h2>
            <p className="text-muted-foreground text-[1.0625rem] leading-relaxed lg:pb-2">
              Try your expected response volume and see how the published monthly base plans compare.
            </p>
          </div>
          <div className="mt-9">
            <PricingCalculator proPrice={Math.round(pro.priceMonthlyCents / 100)} />
          </div>
        </Band>
      )}

      {/* The full matrix, built from the API payload so it can never claim
          something the gates do not honour. */}
      <Band id="everything" className="overflow-visible">
        <Eyebrow>The little details</Eyebrow>
        <h2 className="font-display mt-5 text-[clamp(2rem,1.2rem+2.6vw,3rem)] leading-[1.1] font-semibold tracking-[-0.04em]">Find your kind of fit.</h2>
        <p className="text-muted-foreground mt-5 text-[1.0625rem]">A clear look at what comes with each plan.</p>

        {/* No sideways scroller round the table: a scroll container would
            capture `position: sticky`, and the header has to hold to the top
            of the window for as long as the table is on screen. So the table
            fits the phone instead, with tighter cells. */}
        <div className="border-border mt-9 rounded-[14px] border">
          <table className="w-full table-fixed border-separate border-spacing-0 text-[0.8125rem] sm:text-[0.9375rem]">
            <thead>
              <tr>
                <th className="bg-foreground text-background sticky top-0 z-10 rounded-tl-[13px] px-3 py-4 text-left text-sm font-medium sm:px-6 sm:py-6 sm:text-base">
                  What&apos;s included
                </th>
                {plans.map((p, i) => (
                  <th
                    key={p.id}
                    className={cn(
                      "bg-foreground text-background sticky top-0 z-10 w-[19%] px-0.5 py-4 text-center text-xs font-medium sm:w-[18%] sm:px-4 sm:py-6 sm:text-base",
                      i === plans.length - 1 && "rounded-tr-[13px]",
                    )}
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
                    <th colSpan={plans.length + 1} className="border-border bg-muted/60 border-t px-3 py-4 text-left text-sm font-bold text-[var(--family-choice-ink)] sm:px-6">
                      {group.title}
                    </th>
                  </tr>
                  {group.rows.map((row) => {
                    const key = "everyPlan" in row ? row.everyPlan : "soon" in row ? row.soon : "text" in row ? row.text : "limit" in row ? row.limit : row.feature;
                    let label: React.ReactNode;
                    let cells: React.ReactNode[];
                    if ("everyPlan" in row) {
                      label = row.everyPlan;
                      cells = plans.map(() => <Included key="i" />);
                    } else if ("soon" in row) {
                      label = (
                        <>
                          {row.soon}
                          <span className="text-muted-foreground ml-1.5 text-xs">coming soon</span>
                        </>
                      );
                      cells = plans.map(() => <NotIncluded key="n" />);
                    } else if ("text" in row) {
                      label = row.text;
                      cells = row.cells.map((value) => value || <NotIncluded key="n" />);
                    } else if ("limit" in row) {
                      const meta = data.limits[row.limit];
                      if (!meta) return null;
                      label = row.label ?? meta.label;
                      cells = plans.map((p) => {
                        const value = formatLimit(p.limits[row.limit] ?? null, meta.unit);
                        return value === "—" ? <NotIncluded key="n" /> : value;
                      });
                    } else {
                      const meta = data.features[row.feature];
                      if (!meta) return null;
                      /* Priced, not built. Marked in plain sight: listing an
                         unbuilt feature as included in a paid plan is a
                         misrepresentation. */
                      label = (
                        <>
                          {row.label ?? meta.label}
                          {meta.soon && <span className="text-muted-foreground ml-1.5 text-xs">coming soon</span>}
                        </>
                      );
                      cells = plans.map((p) => (p.features.includes(row.feature) ? <Included key="i" /> : <NotIncluded key="n" />));
                    }
                    return (
                      <tr key={key}>
                        <td className="border-border border-t px-3 py-[1.125rem] sm:px-6">{label}</td>
                        {cells.map((value, i) => (
                          <td key={i} className={cn("tabular border-border border-t", cell, plans[i]?.id === "pro" && TINT)}>
                            {value}
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
        {free && pro && (
          <p id="fair-use" className="text-muted-foreground mx-auto mt-6 max-w-3xl scroll-mt-24 text-center text-xs leading-relaxed">
            Fair use applies to responses and file uploads: {formatLimit(free.limits.responses_ceiling_per_month ?? null, "count")}{" "}
            responses a month on Free, {formatLimit(pro.limits.responses_ceiling_per_month ?? null, "count")} on paid plans. Past
            your AI conversations, forms keep collecting and ask their questions as written.{" "}
            <Link href="/contact" className="underline underline-offset-4">
              Ask us about a feature
            </Link>
            .
          </p>
        )}
      </Band>

      <Band id="faq">
        <div className="grid gap-12 lg:grid-cols-[0.8fr_1.2fr] lg:gap-20">
          <div>
            <Eyebrow>No small print energy</Eyebrow>
            <h2 className="font-display mt-5 text-[clamp(2rem,1.2rem+2.6vw,3rem)] leading-[1.1] font-semibold tracking-[-0.04em]">A few good questions.</h2>
            <p className="text-muted-foreground mt-7 text-sm">Not sure which plan fits?</p>
            <div className="mt-4">
              <TextLink href="/contact" className="text-sm">
                Talk to a real person
              </TextLink>
            </div>
          </div>
          <div className="divide-border border-border divide-y border-y">
            {PRICING_FAQ.map((item) => (
              <details key={item.question} className="group">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-6 text-[1.0625rem] font-semibold [&::-webkit-details-marker]:hidden">
                  {item.question}
                  <Plus className="text-muted-foreground size-4 shrink-0 transition-transform duration-200 group-open:rotate-45" />
                </summary>
                <p className="text-muted-foreground animate-message-in pb-6 leading-relaxed">{item.answer}</p>
              </details>
            ))}
          </div>
        </div>
      </Band>

      {/* The close, centred on the hero's moving gradient. */}
      <GradientBand className="text-center">
        <p className="text-xs font-bold tracking-[0.09em] uppercase opacity-75">Start with what you need today.</p>
        <h2 className="font-display mt-6 text-[clamp(2.5rem,1.4rem+3.6vw,4.25rem)] leading-[1.02] font-bold tracking-[-0.045em]">
          A little ask.
          <span className="font-hand block text-[1.15em] font-normal tracking-normal">A lot of answers.</span>
        </h2>
        <p className="mt-6 text-[1.0625rem] opacity-85">Your first form is on us.</p>
        <div className="mt-8">
          <InkCta href="/signin?mode=signup" className="h-[3.25rem] rounded-xl px-8">
            Create your free account
          </InkCta>
        </div>
        <p className="mt-5 text-sm opacity-80">No credit card. No response limits.</p>
      </GradientBand>
    </>
  );
}
