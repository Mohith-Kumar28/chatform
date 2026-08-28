import Link from "next/link";
import { cn } from "@/lib/utils";
import { Band, BandTitle } from "./band";
import { AgentPanelPreview } from "./agent-panel-preview";
import { ResultsPreview } from "./results-preview";
import { FlowPreview } from "./flow-preview";

/**
 * One mosaic, where there used to be three grids of fourteen identical cards.
 *
 * `feature-acts.tsx` shipped Build, Converse and Collect as three consecutive
 * sections, each a `sm:2 lg:3` grid of `BentoCard`s — icon chip, heading,
 * paragraph, same corner radius, same padding, same everything, fourteen times
 * down the page. Same-size cards of icon-plus-heading-plus-text is the lazy
 * page scaffold: it makes every claim look equally important, which means none
 * of them look important, and it turns reading the page into reading a table.
 *
 * This is five tiles on a 12-column grid, and no two are the same kind of
 * object: one wide tile led by a product panel, one medium tile led by a
 * different product panel, one tile that is nothing but type, one drawn
 * diagram, and one dense list. Width, content type and internal rhythm all
 * vary, so the eye gets hierarchy for free and the important claim is
 * obviously the important one.
 *
 * The fourteen paragraphs are now five one-liners plus one list. Nothing true
 * was dropped — the settings inventory, the seat counts and the quota numbers
 * moved to `/pricing`, where somebody comparing plans actually wants them.
 */

/** The last tile: everything that is genuinely a one-liner, kept as one. */
const REST = [
  {
    tone: "contact",
    label: "Verified respondents",
    detail: "Google or a six-digit SMS code, one response each",
  },
  {
    tone: "choice",
    label: "Leave and come back",
    detail: "Answers persist; any earlier one can be changed",
  },
  {
    tone: "advanced",
    label: "Signed webhooks",
    detail: "HMAC-SHA256, delivery log, queued retries",
  },
  {
    tone: "scale",
    label: "Branch-aware analytics",
    detail: "Drop-off along the path each person actually took",
  },
  { tone: "number", label: "CSV export", detail: "One column per question" },
  {
    tone: "content",
    label: "Your brand, not ours",
    detail: "Fonts, logo, colours; drop the badge on Pro",
  },
] as const;

export function WhatItDoes() {
  return (
    <Band id="features" tone="sand">
      <BandTitle className="max-w-2xl">
        Everything a form builder does — then the part it can&rsquo;t.
      </BandTitle>

      <div className="mt-12 grid gap-4 lg:grid-cols-12">
        {/* Lead tile. The agent brief is the most differentiated thing in the
            builder and the only one with a panel worth showing at this size. */}
        <Tile tone="content" span={12} className="lg:grid lg:grid-cols-[1fr_0.85fr] lg:gap-10">
          <div className="flex flex-col justify-center">
            <TileTitle className="text-display font-bold tracking-[-0.025em]">
              Brief it the way you&rsquo;d brief a person.
            </TileTitle>
            <TileBody tone="content" className="text-body-lg max-w-md">
              A persona, a goal, a knowledge base it can quote — and the topics it
              will not touch.
            </TileBody>
          </div>
          <div className="mt-6 lg:mt-0 lg:self-center">
            <AgentPanelPreview />
          </div>
        </Tile>

        <Tile tone="contact" span={7}>
          <TileTitle>Read the conversation, not the row.</TileTitle>
          <TileBody tone="contact">
            What you asked, what they said, and what got recorded — side by side.
          </TileBody>
          <div className="mt-5">
            <ResultsPreview />
          </div>
        </Tile>

        {/* The type tile. No icon, no panel — the transformation is the graphic,
            and it is the single clearest proof that this is not a text field. */}
        <Tile tone="text" span={5} className="justify-between">
          <div>
            <TileTitle>It understands what people type.</TileTitle>
            <TileBody tone="text">
              Choices stay exact-match and instant. Only free text goes to the model,
              and a low-confidence read becomes a follow-up rather than a guess.
            </TileBody>
          </div>
          <div className="mt-8 flex items-baseline gap-4">
            <span className="text-caption text-muted-foreground max-w-[9rem] font-mono leading-snug">
              &ldquo;we&rsquo;re about a dozen people right now&rdquo;
            </span>
            <span
              aria-hidden
              className="h-px flex-1 self-center"
              style={{ background: "var(--family-text)" }}
            />
            <span
              className="text-display-lg tabular font-mono font-bold"
              style={{ color: "var(--family-text-ink)" }}
            >
              12
            </span>
          </div>
        </Tile>

        <Tile tone="number" span={5}>
          <TileTitle>It can&rsquo;t publish a dead end.</TileTitle>
          <TileBody tone="number">
            Nineteen operators, nested groups, scoring. The linter walks every path
            before publish.
          </TileBody>
          <div className="border-border/70 bg-background mt-5 rounded-xl border p-2">
            <FlowPreview />
          </div>
        </Tile>

        {/* The list tile. Six claims that are honestly one line each, kept as one
            line each instead of inflated into six more cards. */}
        <Tile tone="choice" span={7}>
          <TileTitle>And the ordinary things, done properly.</TileTitle>
          <dl className="mt-5 flex flex-col gap-3">
            {REST.map((item) => (
              <div key={item.label} className="flex items-baseline gap-3">
                <span
                  aria-hidden
                  className="size-2 shrink-0 translate-y-[-0.15em] rounded-full"
                  style={{ background: `var(--family-${item.tone})` }}
                />
                <dt className="text-body shrink-0 font-semibold">{item.label}</dt>
                <dd
                  className="text-caption min-w-0 flex-1 leading-snug"
                  style={{ color: "var(--family-choice-band-muted)" }}
                >
                  {item.detail}
                </dd>
              </div>
            ))}
          </dl>
          <p className="text-caption mt-6">
            <Link
              href="/pricing"
              className="font-medium underline underline-offset-4"
              style={{ color: "var(--family-choice-ink)" }}
            >
              Every limit, per plan →
            </Link>
          </p>
        </Tile>
      </div>
    </Band>
  );
}

const SPANS: Record<number, string> = {
  5: "lg:col-span-5",
  7: "lg:col-span-7",
  12: "lg:col-span-12",
};

function Tile({
  tone,
  span,
  children,
  className,
}: {
  tone: "content" | "text" | "contact" | "number" | "choice";
  span: 5 | 7 | 12;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      style={{ background: `var(--family-${tone}-band)` }}
      className={cn("flex flex-col rounded-2xl p-6 sm:p-7", SPANS[span], className)}
    >
      {children}
    </div>
  );
}

function TileTitle({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <h3 className={cn("text-h1 font-bold tracking-[-0.02em] text-balance", className)}>
      {children}
    </h3>
  );
}

function TileBody({
  children,
  tone,
  className,
}: {
  children: React.ReactNode;
  tone: "content" | "text" | "contact" | "number" | "choice";
  className?: string;
}) {
  return (
    <p
      style={{ color: `var(--family-${tone}-band-muted)` }}
      className={cn("text-body mt-2 leading-relaxed", className)}
    >
      {children}
    </p>
  );
}
