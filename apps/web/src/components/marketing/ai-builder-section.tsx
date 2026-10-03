import { Link2, MessageSquareText, Wand2 } from "lucide-react";
import { AiBuildPreview } from "./ai-build-preview";
import { ArrowMark, HandNote } from "./annotate";
import { InView } from "./in-view";
import { Band } from "./band";
import { PrimaryCta, SectionLede, SectionTitle, Split, TextLink } from "./kit";

const BUILD_WAYS = [
  { icon: MessageSquareText, label: "Type what you want.", detail: "\u201cOnboarding for a design agency\u201d becomes a whole form." },
  { icon: Link2, label: "Or paste your website.", detail: "It reads your pages and asks in your own words." },
  { icon: Wand2, label: "Then just ask for changes.", detail: "\u201cAdd a budget question and skip it under 10 people.\u201d" },
] as const;

function Sparkle({ className }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 48 48" className={className}>
      <path d="M24 3c1.3 11 5 15.7 17 17-12 1.3-15.7 6-17 17-1.3-11-5-15.7-17-17 12-1.3 15.7-6 17-17z" fill="var(--primary)" stroke="var(--on-primary)" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

export function AiBuilderSection() {
  return (
    <Band id="ai-builder">
      <Split cols="lg:grid-cols-2">
        <div>
          <SectionTitle eyebrow="Meet your AI form builder" accent="AI builds it.">
            Describe your form.
          </SectionTitle>
          <SectionLede>
            You get the questions, the wording, the order and the branching, ready to edit and publish. Then it stays on
            to ask them.
          </SectionLede>
          <ul className="mt-7 flex flex-col gap-4">
            {BUILD_WAYS.map((w) => (
              <li key={w.label} className="flex items-start gap-3">
                <span aria-hidden className="bg-primary-soft text-primary-soft-foreground mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg">
                  <w.icon className="size-4" strokeWidth={2} />
                </span>
                <p className="leading-snug">
                  <span className="font-semibold">{w.label}</span>{" "}
                  <span className="text-muted-foreground">{w.detail}</span>
                </p>
              </li>
            ))}
          </ul>
          <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-4">
            <PrimaryCta>Build a form with AI</PrimaryCta>
            <TextLink href="/ai-form-builder">How the AI builder works</TextLink>
          </div>
        </div>

        <div className="relative rounded-[18px] border border-[color-mix(in_oklch,var(--primary)_22%,transparent)] bg-[color-mix(in_oklch,var(--primary-soft)_70%,var(--card))] p-5 sm:p-8">
          <Sparkle className="absolute -top-7 -right-5 size-16 rotate-12" />
          <p className="text-primary-soft-foreground mb-4 text-xs font-bold tracking-[0.09em] uppercase">It starts with a sentence</p>
          <InView>
            <AiBuildPreview readUrl="northwind.co" readPages={6} />
            <div className="cf-a-rise mt-3 flex items-center justify-end gap-1 pr-1" style={{ animationDelay: "860ms" }}>
              <ArrowMark dir="up-right" positioned={false} draw delay={900} className="text-primary-soft-foreground size-10 shrink-0 opacity-60" />
              <HandNote tilt={-5} className="text-primary-soft-foreground">
                it really reads your site
              </HandNote>
            </div>
          </InView>
        </div>
      </Split>
    </Band>
  );
}
