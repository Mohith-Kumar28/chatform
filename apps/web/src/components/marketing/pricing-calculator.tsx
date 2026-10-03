"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

/**
 * "A little number play": what a month of responses costs here and at
 * Typeform, on each side's published monthly base plan.
 *
 * Typeform's figures are read off typeform.com/pricing and dated; they are a
 * competitor's prices and will change, so re-check the page and move the date
 * when they do. The slider stops at 10,000 because that is the largest volume
 * Typeform publishes a price for, and the most our Free plan's fair use allows
 * in a month, so every number shown is one somebody actually publishes.
 */
const REVIEWED = "4 October 2026";
const TYPEFORM = [
  { plan: "Basic", upTo: 100, price: 39 },
  { plan: "Plus", upTo: 1_000, price: 79 },
  { plan: "Business", upTo: 10_000, price: 129 },
] as const;
const MAX = 10_000;

export function PricingCalculator({ proPrice, freeCeiling }: { proPrice: number; freeCeiling: number }) {
  const [responses, setResponses] = useState(5_000);
  const [needsPro, setNeedsPro] = useState(false);

  /* Removing the badge starts at Plus over there, so "Pro features" never
     compares our Pro against their Basic. */
  const byVolume = TYPEFORM.find((t) => responses <= t.upTo) ?? TYPEFORM[TYPEFORM.length - 1]!;
  const theirs = needsPro && byVolume.plan === "Basic" ? TYPEFORM[1]! : byVolume;
  const ours = needsPro ? proPrice : 0;
  const difference = theirs.price - ours;

  return (
    <div className="mx-auto max-w-4xl">
      <div className="bg-card/60 border-border rounded-[18px] border p-6 sm:p-9">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <label htmlFor="responses" className="font-display text-lg font-semibold">
            Expected responses per month
          </label>
          <label className="flex cursor-pointer items-center gap-2.5 text-sm font-medium">
            <input
              type="checkbox"
              checked={needsPro}
              onChange={(e) => setNeedsPro(e.target.checked)}
              className="accent-primary size-4"
            />
            I need Pro features
          </label>
        </div>

        <div className="mt-5 flex items-center gap-5">
          <input
            id="responses"
            type="range"
            min={100}
            max={MAX}
            step={100}
            value={responses}
            onChange={(e) => setResponses(Number(e.target.value))}
            className="accent-primary h-2 flex-1 cursor-pointer"
          />
          <output htmlFor="responses" className="font-display tabular w-24 text-right text-2xl font-bold tracking-tight">
            {responses.toLocaleString("en-US")}
          </output>
        </div>
        <div className="text-muted-foreground mt-1.5 flex justify-between pr-[7.25rem] text-xs">
          <span>100</span>
          <span>{MAX.toLocaleString("en-US")} responses</span>
        </div>

        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-[color-mix(in_oklch,var(--family-choice)_28%,transparent)] bg-[var(--family-choice-soft)] p-6">
            <p className="text-sm font-semibold text-[var(--family-choice-ink)]">chatform</p>
            <p className="mt-3 flex items-baseline gap-1.5">
              <span className="font-display tabular text-5xl font-bold tracking-[-0.03em]">${ours}</span>
              <span className="text-muted-foreground">/ month</span>
            </p>
            <p className="text-muted-foreground mt-2 text-sm">{needsPro ? "Pro plan" : "Free plan"} · unlimited responses*</p>
          </div>
          <div className="border-border bg-background rounded-2xl border p-6">
            <p className="text-muted-foreground text-sm font-semibold">Typeform</p>
            <p className="mt-3 flex items-baseline gap-1.5">
              <span className="font-display tabular text-5xl font-bold tracking-[-0.03em]">${theirs.price}</span>
              <span className="text-muted-foreground">/ month</span>
            </p>
            <p className="text-muted-foreground mt-2 text-sm">
              {theirs.plan} · {theirs.upTo.toLocaleString("en-US")} responses a month included
            </p>
          </div>
        </div>

        <p className="mt-6 text-center">
          <span className="text-muted-foreground block text-xs font-bold tracking-[0.09em] uppercase">Monthly base-price difference</span>
          <span className="font-display mt-1.5 block text-2xl font-bold tracking-tight">
            chatform is <span className="text-primary">${difference} less</span> per month.
          </span>
        </p>
      </div>

      <div className="text-muted-foreground mt-5 space-y-2 text-xs leading-relaxed">
        <p>
          A response-volume illustration, not a like-for-like feature comparison. These are published monthly base
          plans in USD; add-ons, promotions, taxes and annual billing can change what you pay.
        </p>
        <p>
          * chatform&apos;s unlimited responses have a stated fair-use ceiling: {freeCeiling.toLocaleString("en-US")} a
          month on Free. This calculator runs only on this page; it does not choose a plan for you.
        </p>
        <details className="group">
          <summary className={cn("text-foreground cursor-pointer list-none font-semibold [&::-webkit-details-marker]:hidden")}>
            See the published rate card <span className="inline-block transition-transform group-open:rotate-45">+</span>
          </summary>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[26rem] text-left text-xs">
              <thead>
                <tr className="border-border border-b">
                  <th className="py-2 pr-4 font-semibold">Plan</th>
                  <th className="py-2 pr-4 font-semibold">Responses per month</th>
                  <th className="py-2 font-semibold">USD / month</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-border/60 border-b">
                  <td className="py-2 pr-4">chatform Free</td>
                  <td className="py-2 pr-4">Unlimited, fair use {freeCeiling.toLocaleString("en-US")}</td>
                  <td className="tabular py-2">$0</td>
                </tr>
                <tr className="border-border/60 border-b">
                  <td className="py-2 pr-4">chatform Pro</td>
                  <td className="py-2 pr-4">Unlimited, fair use applies</td>
                  <td className="tabular py-2">${proPrice}</td>
                </tr>
                {TYPEFORM.map((t) => (
                  <tr key={t.plan} className="border-border/60 border-b">
                    <td className="py-2 pr-4">Typeform {t.plan}</td>
                    <td className="tabular py-2 pr-4">{t.upTo.toLocaleString("en-US")}</td>
                    <td className="tabular py-2">${t.price}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3">
            Source:{" "}
            <a href="https://www.typeform.com/pricing/" rel="noopener nofollow" className="underline underline-offset-4">
              Typeform pricing
            </a>
            , monthly billing, reviewed {REVIEWED}.
          </p>
        </details>
      </div>
    </div>
  );
}
