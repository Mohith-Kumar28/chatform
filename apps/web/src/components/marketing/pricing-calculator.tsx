"use client";

import { useState } from "react";

/**
 * "A little number play": what a month of responses costs here and at
 * Typeform, on each side's published monthly base plan. Laid out after
 * Youform's: a tinted panel with the count, the slider, the two prices side
 * by side and the difference, then the small print underneath.
 *
 * Typeform's figures are read off typeform.com/pricing and dated; they are a
 * competitor's prices and will change, so re-check the page and move the date
 * when they do. The slider stops at 10,000 because that is the largest volume
 * Typeform publishes a price for, so every number shown is a published one.
 */
const REVIEWED = "4 October 2026";
const TYPEFORM = [
  { plan: "Basic", upTo: 100, price: 39 },
  { plan: "Plus", upTo: 1_000, price: 79 },
  { plan: "Business", upTo: 10_000, price: 129 },
] as const;
const MAX = 10_000;
/* Typeform's face, getting worse as the count (and the bill) climbs. */
const FACES = [
  { upTo: 100, face: "\u{1F642}" },
  { upTo: 1_000, face: "\u{1F615}" },
  { upTo: 4_000, face: "\u{1F61F}" },
  { upTo: 7_000, face: "\u{1F630}" },
  { upTo: MAX, face: "\u{1F631}" },
] as const;
const INK = "var(--family-choice-ink)";

export function PricingCalculator({ proPrice }: { proPrice: number }) {
  const [responses, setResponses] = useState(5_000);
  const [needsPro, setNeedsPro] = useState(false);
  const count = Math.min(MAX, Math.max(0, responses));

  /* Removing the badge starts at Plus over there, so "Pro features" never
     compares our Pro against their Basic. */
  const byVolume = TYPEFORM.find((t) => count <= t.upTo) ?? TYPEFORM[TYPEFORM.length - 1]!;
  const theirs = needsPro && byVolume.plan === "Basic" ? TYPEFORM[1]! : byVolume;
  const ours = needsPro ? proPrice : 0;
  const theirFace = (FACES.find((f) => count <= f.upTo) ?? FACES[FACES.length - 1]!).face;

  return (
    <>
      <div className="rounded-[22px] bg-[var(--family-choice-soft)] px-6 py-9 sm:px-12 sm:py-12">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div>
            <label htmlFor="responses" className="font-display text-lg font-semibold">
              Expected responses per month
            </label>
            <p className="mt-1.5 text-[0.9375rem]" style={{ color: INK }}>
              Slide to explore. Type for an exact count.
            </p>
            <label className="mt-4 flex cursor-pointer items-center gap-2.5 text-sm">
              <input type="checkbox" checked={needsPro} onChange={(e) => setNeedsPro(e.target.checked)} className="size-[1.125rem] accent-[var(--family-choice-ink)]" />
              <span>
                I need <a href="#plans" className="underline decoration-dotted underline-offset-4">Pro features</a>
              </span>
            </label>
          </div>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            max={MAX}
            value={responses}
            onChange={(e) => setResponses(Number(e.target.value) || 0)}
            aria-label="Exact response count"
            className="font-display bg-background tabular w-36 rounded-xl border px-4 py-3 text-xl font-semibold outline-none focus-visible:ring-2"
            style={{ borderColor: INK }}
          />
        </div>

        <input
          id="responses"
          type="range"
          min={0}
          max={MAX}
          step={100}
          value={count}
          onChange={(e) => setResponses(Number(e.target.value))}
          className="mt-9 h-2 w-full cursor-pointer accent-[var(--family-choice-ink)]"
        />
        <div className="mt-2 flex justify-between text-xs" style={{ color: INK }}>
          <span>0</span>
          <span>{MAX.toLocaleString("en-US")} responses</span>
        </div>

        <div className="mt-8 grid sm:grid-cols-2">
          {[
            { name: "chatform", face: "\u{1F601}", price: ours, note: `${needsPro ? "Pro" : "Free"} plan · unlimited responses*` },
            { name: "Typeform", face: theirFace, price: theirs.price, note: `${theirs.plan} published base plan` },
          ].map((side, i) => (
            <div key={side.name} className={i === 1 ? "max-sm:mt-8 max-sm:border-t max-sm:pt-8 sm:border-l sm:pl-8" : "sm:pr-8"} style={{ borderColor: INK }}>
              <p className="font-display flex items-center gap-3 text-2xl font-semibold tracking-tight">
                {side.name}
                {/* Keyed, so a new face pops in instead of swapping silently. */}
                <span key={side.face} aria-hidden className="animate-message-in inline-block text-[2.75rem] leading-none">
                  {side.face}
                </span>
              </p>
              <p className="mt-6 flex items-baseline gap-2" style={{ color: INK }}>
                <span className="font-display tabular text-[4.5rem] leading-none font-bold tracking-[-0.045em]">${side.price}</span>
                <span className="text-sm">/ month</span>
              </p>
              <p className="mt-4 text-sm" style={{ color: INK }}>
                {side.note}
              </p>
            </div>
          ))}
        </div>

        <p className="mt-7 text-[0.9375rem]" style={{ color: INK }}>
          For <strong className="font-semibold">{count.toLocaleString("en-US")}</strong> responses per month
          <span className="ml-2 text-xs">· USD · billed monthly</span>
        </p>

        <div className="mt-6 border-t pt-7" style={{ borderColor: INK }}>
          <p className="text-xs font-bold tracking-[0.09em] uppercase" style={{ color: INK }}>
            Monthly base-price difference
          </p>
          <p className="font-display mt-2.5 text-[1.75rem] leading-tight font-semibold tracking-[-0.02em] sm:text-[2rem]" style={{ color: INK }}>
            chatform is ${theirs.price - ours} less per month.
          </p>
        </div>
      </div>

      <div className="text-muted-foreground mt-7 max-w-2xl space-y-3 text-sm leading-relaxed">
        <p>
          <strong className="text-foreground font-semibold">A response-volume illustration, not a like-for-like feature comparison.</strong>{" "}
          These are published base plans, not the cheapest possible combination of add-ons. Features, response
          add-ons, account offers, promotions, taxes and annual billing can change what you pay.
        </p>
        <p>
          * chatform&apos;s unlimited responses are subject to{" "}
          <a href="#fair-use" className="underline underline-offset-4">
            fair use
          </a>
          . This calculator runs only on this page; it does not select a plan.
        </p>
      </div>

      <details className="group border-border mt-7 border-y">
        <summary className="flex cursor-pointer list-none items-center justify-between py-5 font-semibold [&::-webkit-details-marker]:hidden">
          See the published rate card
          <span className="text-xl leading-none transition-transform duration-200 group-open:rotate-45">+</span>
        </summary>
        <div className="overflow-x-auto pb-5">
          <p className="text-muted-foreground mb-3 text-xs">USD monthly base plans, reviewed {REVIEWED}</p>
          <table className="w-full min-w-[26rem] text-left text-sm">
            <thead>
              <tr className="border-border border-b">
                <th className="py-2.5 pr-4 font-semibold">Plan</th>
                <th className="py-2.5 pr-4 font-semibold">Responses per month</th>
                <th className="py-2.5 font-semibold">USD / month</th>
              </tr>
            </thead>
            <tbody>
              {[
                ["chatform Free", "Unlimited, subject to fair use", "$0"],
                ["chatform Pro", "Unlimited, subject to fair use", `$${proPrice}`],
                ...TYPEFORM.map((t) => [`Typeform ${t.plan}`, t.upTo.toLocaleString("en-US"), `$${t.price}`]),
              ].map(([plan, volume, price]) => (
                <tr key={plan} className="border-border/60 border-b last:border-b-0">
                  <td className="py-2.5 pr-4">{plan}</td>
                  <td className="tabular py-2.5 pr-4">{volume}</td>
                  <td className="tabular py-2.5">{price}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
      <p className="text-muted-foreground mt-4 text-xs">
        Sources reviewed {REVIEWED}:{" "}
        <a href="https://www.typeform.com/pricing/" rel="noopener nofollow" className="underline underline-offset-4">
          Typeform pricing
        </a>{" "}
        ·{" "}
        <a href="#plans" className="underline underline-offset-4">
          chatform plans
        </a>
        . Published figures are a planning illustration.
      </p>
    </>
  );
}
