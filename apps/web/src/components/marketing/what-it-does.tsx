import Link from "next/link";
import { cn } from "@/lib/utils";
import { Band, BandTitle, BandLede } from "./band";
import { MessageSquareText, Link2, Wand2 } from "lucide-react";
import { AgentPanelPreview } from "./agent-panel-preview";
import { AiBuildPreview } from "./ai-build-preview";
import { ArrowMark, HandNote } from "./annotate";
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

/**
 * The three ways a form gets built here, in the order somebody would try them.
 * All three are shipped endpoints, not a roadmap — see the note on the lead
 * tile for which is which.
 */
const BUILD_WAYS = [
  {
    icon: MessageSquareText,
    label: "Type what you want.",
    detail: "\u201cOnboarding for a design agency\u201d \u2192 a whole form.",
  },
  {
    icon: Link2,
    label: "Or paste your website.",
    detail: "It reads your pages and asks in your own vocabulary.",
  },
  {
    icon: Wand2,
    label: "Then just ask for changes.",
    detail: "\u201cAdd a budget question and skip it under 10 people.\u201d",
  },
] as const;

/**
 * The last tile: everything that is genuinely a one-liner, kept as one.
 *
 * Written for whoever is reading, which on this band is everybody. Two of
 * these used to be spec sheet — "Signed webhooks / HMAC-SHA256, delivery log,
 * queued retries" and "Branch-aware analytics" — sitting in a list that is
 * otherwise about not losing people's answers. Nobody who needs an HMAC
 * signature is finding out about it from a landing page tile; they are reading
 * the webhook documentation. Anyone else was being shown four words of
 * cryptography in the middle of a sentence about their own form.
 */
const REST = [
  {
    tone: "contact",
    label: "Know who answered",
    detail: "Sign-in or a texted code, one response each",
  },
  {
    tone: "choice",
    label: "Leave and come back",
    detail: "Answers are kept; any earlier one can be changed",
  },
  {
    tone: "advanced",
    label: "Tell your other tools",
    detail: "New answers can be pushed anywhere you like",
  },
  {
    tone: "scale",
    label: "See where people stop",
    detail: "Drop-off along the path each person actually took",
  },
  { tone: "number", label: "Download it all", detail: "A spreadsheet, one column per question" },
  {
    tone: "content",
    label: "Your brand, not ours",
    detail: "Fonts, logo, colours; drop the badge on Pro",
  },
] as const;

export function WhatItDoes() {
  return (
    <Band id="features" tone="sand">
      {/* The heading names the thing you do instead of the thing you used to
          do. "Everything a form builder does — then the part it can't" was
          written from a competitor's point of view: it needs you to already
          know what a form builder does before it lands, and it never once says
          what you actually do here. You do not build. You ask. */}
      <BandTitle className="max-w-3xl">You don&rsquo;t build it. You just ask.</BandTitle>
      <BandLede>
        The AI writes the questions, the wording and the branching. You change your mind by
        saying so.
      </BandLede>

      <div className="mt-12 grid gap-4 lg:grid-cols-12">
        {/* The lead tile is now the build story, which had been missing from
            this page entirely. Every one of these three is a shipped endpoint —
            `POST /ai/generate-form` for the prompt, the researcher that fetches
            and reads a URL before drafting, and `POST /ai/edit-form`, which
            proposes a document and waits rather than saving over your work. */}
        <Tile tone="content" span={12} className="lg:grid lg:grid-cols-[1fr_0.9fr] lg:gap-10">
          <div className="flex flex-col justify-center">
            <TileTitle className="text-display font-bold tracking-[-0.025em]">
              Describe your form. Get your form.
            </TileTitle>
            <TileBody className="text-body-lg max-w-md">
              One sentence about what you need, and every question is written for you —
              wording, order, question types and the branching between them.
            </TileBody>

            <ul className="mt-6 flex flex-col gap-3">
              {BUILD_WAYS.map((w) => (
                <li key={w.label} className="flex items-start gap-3">
                  <span
                    aria-hidden
                    className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg"
                    style={{
                      background: "var(--on-band-vivid)",
                      color: "var(--family-content-band-vivid)",
                    }}
                  >
                    <w.icon className="size-3.5" strokeWidth={2.25} />
                  </span>
                  <p className="text-body leading-snug">
                    <span className="font-semibold">{w.label}</span>{" "}
                    <span style={{ color: "var(--on-band-vivid-muted)" }}>{w.detail}</span>
                  </p>
                </li>
              ))}
            </ul>
          </div>

          <div className="mt-6 lg:mt-0 lg:self-center">
            <AiBuildPreview readUrl="northwind.co" readPages={6} />
            {/* One pen mark in this band, on the line people do not believe
                until they see it. In normal flow rather than absolutely
                positioned: the first attempt floated it over the panel's
                bottom-left corner, where the panel simply painted on top of
                it. A note that can be covered is a note that will be. */}
            <div className="mt-3 flex items-center justify-end gap-1 pr-1">
              <ArrowMark dir="up-right" positioned={false} className="size-10 shrink-0 opacity-60" />
              <HandNote tilt={-5} style={{ color: "var(--on-band-vivid)" }}>
                it really reads your site
              </HandNote>
            </div>
          </div>
        </Tile>

        {/* The agent brief. Demoted from the lead but not dropped: it is about
            how the conversation RUNS, where the tile above is about how the
            form gets made, and the page needs both. */}
        <Tile tone="scale" span={5}>
          <TileTitle>Then brief it like a person.</TileTitle>
          <TileBody>
            A persona, a goal, a knowledge base it can quote — and the topics it will not
            touch.
          </TileBody>
          <div className="mt-5">
            <AgentPanelPreview />
          </div>
        </Tile>

        <Tile tone="contact" span={7}>
          <TileTitle>Read the conversation, not the row.</TileTitle>
          <TileBody>
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
            <TileBody>
              Choices stay exact-match and instant. Only free text goes to the model,
              and a low-confidence read becomes a follow-up rather than a guess.
            </TileBody>
          </div>
          {/* The extraction, shown rather than described — and it has to say
              what it is, which the old version did not.

              It was a grey quote, a hairline, and a bare "12" in
              `--family-text-ink`: two colours meant for a pale tint, now sitting
              on the saturated blue, so the sentence was barely legible and the
              number was a mystery. Nobody could tell what 12 referred to, which
              made the one graphic that proves the feature the one graphic that
              needed explaining. Labels on both ends, the band's own inks, and
              an arrow that says which way the transformation runs. */}
          <div className="mt-8">
            <div className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-micro font-semibold uppercase tracking-[0.1em] opacity-70">
                  They typed
                </p>
                <p className="text-caption mt-1 font-mono leading-snug">
                  &ldquo;we&rsquo;re about a dozen people right now&rdquo;
                </p>
              </div>

              <svg
                aria-hidden
                viewBox="0 0 40 24"
                fill="none"
                className="h-5 w-9 shrink-0 opacity-60"
              >
                <path
                  d="M2 12 H32"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinecap="round"
                />
                <path
                  d="M25 5 L34 12 L25 19"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>

              <div className="shrink-0 text-right">
                <p className="text-micro font-semibold uppercase tracking-[0.1em] opacity-70">
                  Team size
                </p>
                <p className="font-display tabular mt-0.5 text-4xl leading-none font-bold">12</p>
              </div>
            </div>
          </div>
        </Tile>

        <Tile tone="number" span={7}>
          <TileTitle>It can&rsquo;t publish a dead end.</TileTitle>
          <TileBody>
            Nineteen operators, nested groups, scoring. The linter walks every path
            before publish.
          </TileBody>
          <div className="border-border/70 bg-background mt-5 rounded-xl border p-2">
            <FlowPreview />
          </div>
        </Tile>

        {/* The list tile. Six claims that are honestly one line each, kept as one
            line each instead of inflated into six more cards. */}
        <Tile tone="choice" span={12}>
          <TileTitle>And the ordinary things, done properly.</TileTitle>
          <dl className="mt-5 grid gap-3 sm:grid-cols-2 sm:gap-x-10">
            {REST.map((item) => (
              <div key={item.label} className="flex items-baseline gap-3">
                <span
                  aria-hidden
                  className="size-2 shrink-0 translate-y-[-0.15em] rounded-full"
                  style={{ background: "var(--on-band-vivid)", opacity: 0.55 }}
                />
                <dt className="text-body shrink-0 font-semibold">{item.label}</dt>
                <dd
                  className="text-caption min-w-0 flex-1 leading-snug"
                  style={{ color: "var(--on-band-vivid-muted)" }}
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
              style={{ color: "var(--on-band-vivid)" }}
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
  tone: "content" | "text" | "contact" | "number" | "choice" | "scale";
  span: 5 | 7 | 12;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      /* Vivid, like the bands, and for the same reason: five pastel tiles on a
         sand ground is five ways of saying "off-white". The mosaic's whole
         argument is that no two of these are the same kind of object, and
         colour is the fastest way to say so. */
      style={{
        background: `var(--family-${tone}-band-vivid)`,
        color: "var(--on-band-vivid)",
      }}
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

/**
 * `tone` is gone from the signature, not just unused.
 *
 * On the pastel tier this had to be told which family it sat on, so the
 * secondary line could be pulled toward that family's own dark ink instead of
 * going grey on a coloured ground. The vivid tier needs no such thing: one
 * step down from the near-black already on the tile is the same colour on all
 * five of them.
 */
function TileBody({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <p
      style={{ color: "var(--on-band-vivid-muted)" }}
      className={cn("text-body mt-2 leading-relaxed", className)}
    >
      {children}
    </p>
  );
}
