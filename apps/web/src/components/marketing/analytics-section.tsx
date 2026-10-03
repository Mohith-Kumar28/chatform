import { Band } from "./band";
import { CheckItem, PANEL_SHADOW, SectionLede, SectionTitle, Split, TextLink } from "./kit";

/**
 * Form analytics, shown as the real results screen
 * (`public/marketing/analytics.webp`): a local form with seeded sample
 * responses, captured at 2x. Retake it when that screen changes.
 */
export function AnalyticsSection() {
  return (
    <Band id="analytics">
      <Split cols="lg:grid-cols-[0.9fr_1.2fr]">
        <div>
          <SectionTitle eyebrow="Understand every step of your form" accent="See what works.">
            Form analytics.
          </SectionTitle>
          <SectionLede>
            Views, starts, completions and how long people take, with where they came from and the device they used.
          </SectionLede>
          <ul className="mt-7 space-y-3 text-[0.9375rem]">
            <CheckItem>Responses over time, and the hours people actually answer</CheckItem>
            <CheckItem>
              The drop-off funnel and answer rate for every question
            </CheckItem>
          </ul>
          <div className="mt-8">
            <TextLink href="/signin?mode=signup">Start measuring</TextLink>
          </div>
        </div>

        <figure>
          <div className={`ring-foreground/10 overflow-hidden rounded-[18px] ring-1 ${PANEL_SHADOW}`}>
            {/* eslint-disable-next-line @next/next/no-img-element -- a static asset; no optimiser on Workers */}
            <img
              src="/marketing/analytics.webp"
              alt="The results page: views, starts, completions, completion rate, median time and drop-outs above a chart of responses and views over a month."
              width={1600}
              height={825}
              loading="lazy"
              decoding="async"
              className="block h-auto w-full"
            />
          </div>
          <figcaption className="text-muted-foreground mt-3 text-center text-sm">The real results page, filled with sample responses.</figcaption>
        </figure>
      </Split>
    </Band>
  );
}
