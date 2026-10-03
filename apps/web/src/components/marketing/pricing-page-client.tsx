"use client";

import { Fragment, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowDown, Check, Minus, Plus } from "lucide-react";
import { customFetch } from "@/lib/api/mutator";
import type { Catalogue } from "@/lib/pricing-catalogue";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Band, Eyebrow } from "@/components/marketing/band";
import { PlanCard } from "@/components/marketing/plan-card";
import { QUESTION_TYPE_COUNT } from "@/components/marketing/question-types";
import { PricingCalculator } from "@/components/marketing/pricing-calculator";
import { PRICING_FAQ } from "@/components/marketing/pricing-faq";
import { CtaBand } from "@/components/marketing/cta-band";
import { PrimaryCta, SECONDARY_CTA, SectionLede, SectionTitle, TextLink } from "@/components/marketing/kit";

/**
 * The public pricing page, on the structure of Youform's: what is free said
 * first and loudest, then the three plans, then a month of responses priced
 * here and at Typeform, then the full comparison, then the questions.
 *
 * The plan data comes from `/api/billing/plans`, which serves the **seeded**
 * catalogue rather than the in-process one, so what this page promises is what
 * the gates enforce. Rows that are not a gate (logic, signatures, embeds) are
 * `everyPlan`; a row that is being built says so with `soon` and is never
 * drawn as included.
 */

/** What Free includes, the list a visitor does not expect to be free. */
const FREE_INCLUDES = (maxFileMb: number, aiConversations: number) => [
  `All ${QUESTION_TYPE_COUNT} question types`,
  "Logic, branching and multiple endings",
  "Scores and quizzes",
  "Signatures",
  `File uploads up to ${maxFileMb} MB`,
  "Themes, colours and built-in fonts",
  "Hidden fields",
  "Website embeds, popups and QR codes",
  "Email alerts to yourself",
  "Google Sheets and Excel",
  "Webhooks",
  "Scheduling links",
  "An AI form builder",
  `${aiConversations} AI conversations a month`,
  "A knowledge base it answers from",
  "Claude and ChatGPT connector",
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
      { limit: "responses_per_month" },
      { limit: "forms_count" },
      { limit: "blocks_per_form" },
      { everyPlan: `All ${QUESTION_TYPE_COUNT} question types` },
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

const Included = () => <Check className="text-primary mx-auto size-4" strokeWidth={2.5} aria-label="Included" />;
const NotIncluded = () => <Minus className="text-muted-foreground/40 mx-auto size-4" aria-label="Not included" />;

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
  // Annual by default: it is the better deal for the customer and the better
  // number for us, and it is what every comparable product does.
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
  const saving = pro?.yearlySavingPercent;
  const cell = "px-3 py-3 text-center";

  return (
    <>
      <Band size="tall">
        <div className="mx-auto flex max-w-3xl flex-col items-center text-center">
          <Eyebrow>chatform pricing</Eyebrow>
          <h1 className="font-display mt-5 text-[clamp(2.6rem,1.2rem+4.6vw,4.5rem)] leading-[1.02] font-bold tracking-[-0.045em] text-balance">
            Unlimited responses.
            <span className="block">{free?.limits.forms_count ?? 100} forms.</span>
            <span className="font-hand text-primary block text-[1.12em] leading-[1.05] font-normal tracking-normal">Free forever.</span>
          </h1>
          <p className="text-muted-foreground mt-6 max-w-xl text-[1.0625rem] leading-relaxed text-pretty">
            Build, style and share conversational forms on a free plan you can keep using. More responses never mean
            a bigger bill. Upgrade only when you need the advanced features.
          </p>
          <div className="mt-8 flex w-full flex-wrap items-center justify-center gap-3">
            <PrimaryCta className="max-sm:w-full">Create your free account</PrimaryCta>
            <a href="#plans" className={`${SECONDARY_CTA} max-sm:w-full`}>
              Compare plans
            </a>
          </div>
          <p className="text-muted-foreground mt-5 text-sm">No credit card. No trial countdown. Fair use applies.</p>
        </div>

        <div className="mt-16 rounded-[18px] border border-[color-mix(in_oklch,var(--family-choice)_24%,transparent)] bg-[var(--family-choice-soft)] px-7 py-10 sm:px-12 sm:py-12">
          <h2 className="font-display text-[1.75rem] leading-tight font-bold tracking-[-0.03em] sm:text-[2.25rem]">
            Yes, all this is free.
          </h2>
          <ul className="mt-7 grid gap-x-8 gap-y-3.5 sm:grid-cols-2 lg:grid-cols-4">
            {FREE_INCLUDES(free?.limits.max_upload_mb_per_file ?? 5, free?.limits.ai_conversations_per_month ?? 200).map((item) => (
              <li key={item} className="flex items-start gap-2.5 text-[0.9375rem] font-medium">
                <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-[var(--family-choice-ink)] text-[var(--background)]">
                  <Check className="size-3" strokeWidth={3} />
                </span>
                {item}
              </li>
            ))}
          </ul>
          <div className="mt-8">
            <TextLink href="#everything">See every included feature</TextLink>
          </div>
        </div>
      </Band>

      <Band id="plans">
        <div className="mx-auto flex max-w-3xl flex-col items-center text-center">
          <SectionTitle accent="Our prices let you keep it.">Our forms get the answer.</SectionTitle>
          <SectionLede className="max-w-xl">
            Stay on Free for as long as it fits. Choose Pro for your own branding, payments and follow-ups. Business
            adds verified answers and more seats.
          </SectionLede>
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
            {plans.map((plan) => (
              <PlanCard
                key={plan.id}
                annual={annual}
                featured={plan.id === "pro"}
                plan={plan}
                ctaHref={plan.id === "free" ? "/signin?mode=signup" : `/usage?plan=${plan.id}&cycle=${cycle}`}
                ctaLabel={plan.id === "free" ? "Start for free" : `Get started with ${plan.name}`}
                note={plan.checkoutReady === false ? "Contact us to set this up" : undefined}
              />
            ))}
          </div>

          <p className="text-muted-foreground text-center text-sm">
            All prices in USD. Tax is handled at checkout. Fair use applies.
          </p>
          <a href="#everything" className="text-foreground inline-flex items-center gap-1.5 text-[0.9375rem] font-semibold underline-offset-[5px] hover:underline">
            A closer look at what&apos;s included
            <ArrowDown className="size-4" />
          </a>
        </div>
      </Band>

      {pro && free && (
        <Band id="typeform">
          <div className="mx-auto flex max-w-3xl flex-col items-center text-center">
            <SectionTitle eyebrow="chatform and Typeform · a little number play" accent="What's the monthly bill?">
              More people answering.
            </SectionTitle>
            <SectionLede className="max-w-xl">
              Slide to your expected response volume and see how the published monthly base plans compare.
            </SectionLede>
          </div>
          <div className="mt-10">
            <PricingCalculator
              proPrice={Math.round(pro.priceMonthlyCents / 100)}
              freeCeiling={free.limits.responses_ceiling_per_month ?? 10_000}
            />
          </div>
        </Band>
      )}

      {/* The full matrix, built from the API payload so it can never claim
          something the gates do not honour. */}
      <Band id="everything">
        <div className="mx-auto flex max-w-3xl flex-col items-center text-center">
          <SectionTitle eyebrow="The little details" accent="plan by plan.">
            Find your kind of fit,
          </SectionTitle>
        </div>
        <div className="bg-card/60 border-border mt-10 overflow-x-auto rounded-[18px] border px-5 pb-4 sm:px-8">
          <table className="w-full min-w-[40rem] text-[0.9375rem]">
            <thead>
              <tr className="border-border border-b">
                <th className="py-4 pr-4 text-left text-sm font-semibold">What&apos;s included</th>
                {plans.map((p) => (
                  <th key={p.id} className={`font-display w-32 px-3 py-4 text-center text-base font-semibold ${p.id === "pro" ? "text-primary" : ""}`}>
                    {p.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {GROUPS.map((group) => (
                <Fragment key={group.title}>
                  <tr>
                    <th colSpan={plans.length + 1} className="text-primary-soft-foreground pt-8 pb-2 text-left text-xs font-bold tracking-[0.09em] uppercase">
                      {group.title}
                    </th>
                  </tr>
                  {group.rows.map((row) => {
                    if ("everyPlan" in row) {
                      return (
                        <tr key={row.everyPlan} className="border-border/60 border-b">
                          <td className="py-3 pr-4">{row.everyPlan}</td>
                          {plans.map((p) => (
                            <td key={p.id} className={cell}>
                              <Included />
                            </td>
                          ))}
                        </tr>
                      );
                    }
                    if ("soon" in row) {
                      return (
                        <tr key={row.soon} className="border-border/60 border-b">
                          <td className="py-3 pr-4">{row.soon}</td>
                          <td colSpan={plans.length} className="text-muted-foreground px-3 py-3 text-center text-sm">
                            Being built, not available yet
                          </td>
                        </tr>
                      );
                    }
                    if ("text" in row) {
                      return (
                        <tr key={row.text} className="border-border/60 border-b">
                          <td className="py-3 pr-4">{row.text}</td>
                          {row.cells.map((value, i) => (
                            <td key={i} className={`${cell} text-sm`}>
                              {value || <NotIncluded />}
                            </td>
                          ))}
                        </tr>
                      );
                    }
                    if ("limit" in row) {
                      const meta = data.limits[row.limit];
                      if (!meta) return null;
                      return (
                        <tr key={row.limit} className="border-border/60 border-b">
                          <td className="py-3 pr-4">{row.label ?? meta.label}</td>
                          {plans.map((p) => {
                            const value = formatLimit(p.limits[row.limit] ?? null, meta.unit);
                            return (
                              <td key={p.id} className={`tabular ${cell} text-sm`}>
                                {value === "—" ? <NotIncluded /> : value}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    }
                    const meta = data.features[row.feature];
                    if (!meta) return null;
                    return (
                      <tr key={row.feature} className="border-border/60 border-b">
                        <td className="py-3 pr-4">
                          {row.label ?? meta.label}
                          {/* Priced, not built. Marked in plain sight: listing an
                              unbuilt feature as included in a paid plan is a
                              misrepresentation. */}
                          {meta.soon && <span className="text-muted-foreground ml-1.5 text-xs">coming soon</span>}
                        </td>
                        {plans.map((p) => (
                          <td key={p.id} className={cell}>
                            {p.features.includes(row.feature) ? <Included /> : <NotIncluded />}
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
          <p className="text-muted-foreground mx-auto mt-5 max-w-3xl text-center text-sm leading-relaxed">
            Unlimited responses means no per-plan quota. Fair use is a stated ceiling:{" "}
            {formatLimit(free.limits.responses_ceiling_per_month ?? null, "count")} a month on Free and{" "}
            {formatLimit(pro.limits.responses_ceiling_per_month ?? null, "count")} on paid plans. Past your AI
            conversations, forms keep collecting and ask their questions as written.{" "}
            <Link href="/contact" className="text-foreground font-medium underline underline-offset-4">
              Ask us about a feature.
            </Link>
          </p>
        )}
      </Band>

      <Band id="faq">
        <div className="grid gap-12 lg:grid-cols-[0.85fr_1.15fr] lg:gap-16">
          <div>
            <SectionTitle eyebrow="No small print energy">A few good questions.</SectionTitle>
            <p className="text-muted-foreground mt-5">Not sure which plan fits?</p>
            <div className="mt-2">
              <TextLink href="/contact">Talk to a real person</TextLink>
            </div>
          </div>
          <div className="divide-border/70 divide-y">
            {PRICING_FAQ.map((item) => (
              <details key={item.question} className="group py-1">
                <summary className="font-display flex cursor-pointer list-none items-center justify-between gap-6 py-4 text-lg font-semibold [&::-webkit-details-marker]:hidden">
                  {item.question}
                  <Plus className="text-muted-foreground size-5 shrink-0 transition-transform duration-200 group-open:rotate-45" />
                </summary>
                <p className="text-muted-foreground animate-message-in pb-5 leading-relaxed">{item.answer}</p>
              </details>
            ))}
          </div>
        </div>
      </Band>

      <CtaBand />
    </>
  );
}
