import Link from "next/link";
import { cn } from "@/lib/utils";
import { Band, BandTitle, BandLede } from "./band";
import { MessageSquareText, Link2, Wand2 } from "lucide-react";
import { AgentPanelPreview } from "./agent-panel-preview";
import { AiBuildPreview } from "./ai-build-preview";
import { ArrowMark, HandNote } from "./annotate";
import { ResultsPreview } from "./results-preview";
import { FlowPreview } from "./flow-preview";
import { InView } from "./in-view";

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

/**
 * What a person types, and what lands in the row.
 *
 * Each one is a different failure of the thing a form field would do instead:
 * "a dozen" is a number with no digits in it, "five and ten grand" is a range
 * in words, the HubSpot line is a negation wearing an affirmative sentence,
 * and "after the holidays" is a date that only exists relative to today. None
 * of them are edge cases — they are how people answer when the question feels
 * like a conversation, which is the whole point.
 */
const READS = [
  { typed: "we're about a dozen people right now", field: "Team size", value: "12" },
  {
    typed: "somewhere between five and ten grand a month",
    field: "Budget",
    value: "$5\u201310k",
  },
  {
    typed: "yeah we tried HubSpot, dropped it last year",
    field: "Current CRM",
    value: "None",
  },
  { typed: "right after the holidays", field: "Timeline", value: "January" },
] as const;

/**
 * The four routes a finished form takes to a person, each drawn rather than
 * described.
 *
 * A bulleted list would have said the same words in a fifth of the space, and
 * that is exactly the problem: "an embed" means nothing until you have seen
 * where the thing lands on the page. The four drawings are deliberately at the
 * same scale and in the same frame, so what the eye compares is the placement,
 * which is the only thing that actually differs between them.
 */
const REACH = [
  {
    label: "A link",
    detail: "Send it, post it, put it in a signature.",
    art: <LinkArt />,
  },
  {
    label: "A QR code",
    detail: "Generated in the browser. Download it and print it.",
    art: <QrArt />,
  },
  {
    label: "An embed",
    detail: "Popup, side tab, inline or full page \u2014 one script tag.",
    art: <EmbedArt />,
  },
  {
    label: "The API",
    detail: "Build your own front end on the same endpoints.",
    art: <ApiArt />,
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

          <InView className="mt-6 lg:mt-0 lg:self-center">
            <AiBuildPreview readUrl="northwind.co" readPages={6} />
            {/* One pen mark in this band, on the line people do not believe
                until they see it. In normal flow rather than absolutely
                positioned: the first attempt floated it over the panel's
                bottom-left corner, where the panel simply painted on top of
                it. A note that can be covered is a note that will be. */}
            <div className="cf-a-rise mt-3 flex items-center justify-end gap-1 pr-1" style={{ animationDelay: "860ms" }}>
              <ArrowMark
                dir="up-right"
                positioned={false}
                draw
                delay={900}
                className="size-10 shrink-0 opacity-60"
              />
              <HandNote tilt={-5} style={{ color: "var(--on-band-vivid)" }}>
                it really reads your site
              </HandNote>
            </div>
          </InView>
        </Tile>

        <Tile tone="contact" span={7}>
          <TileTitle>Read the conversation, not the row.</TileTitle>
          <TileBody>
            What you asked, what they said, and what got recorded — side by side.
          </TileBody>
          <InView className="mt-5">
            <ResultsPreview />
          </InView>
        </Tile>

        {/* The agent brief, second in its row rather than first.

            It led this row when the row was [5, 7], which put the two rows of
            the mosaic at [5, 7] and [5, 7] — the same shape twice, which is a
            grid pretending to be a mosaic. Swapping this row to [7, 5] makes
            the widths alternate down the page, and it happens to be the better
            reading order too: the output people care about goes first, and how
            you brief the thing that produced it goes beside it. */}
        <Tile tone="scale" span={5}>
          <TileTitle>Then brief it like a person.</TileTitle>
          <TileBody>
            A persona, a goal, a knowledge base it can quote — and the topics it will not
            touch.
          </TileBody>
          <InView className="mt-5">
            <AgentPanelPreview />
          </InView>
        </Tile>

        {/* The type tile. No icon, no panel — the transformation is the graphic,
            and it is the single clearest proof that this is not a text field. */}
        {/* The type tile. No icon, no panel — the transformation is the graphic,
            and it is the single clearest proof that this is not a text field. */}
        <Tile tone="text" span={5} className="justify-between">
          <div>
            <TileTitle>It understands what people type.</TileTitle>
            <TileBody>
              Choices stay instant and exact. Free text goes to the model — and when it
              isn&rsquo;t sure, it asks instead of guessing.
            </TileBody>
          </div>

          {/* Four reads, not one.
              It was a single row — a quote, an arrow and a bare "12" — pinned to
              the bottom of a tile with a third of its height empty above it. One
              example proves nothing: a reader assumes "a dozen" was hardcoded and
              moves on. Four, each a different kind of read, is the argument.
              They are chosen to be things a person would actually type and a
              regex would actually miss: a number written as a word behind a
              hedge, a range in words, a negation buried in an affirmative
              sentence, and a date with no numbers in it at all.

              The arrow per row is gone with them. Two column labels say which
              way the transformation runs once, and four arrows down the middle
              of a narrow tile were four pieces of furniture doing that job
              again. */}
          <InView className="mt-8">
            <div className="flex items-baseline justify-between gap-4">
              <p className="text-micro font-semibold tracking-[0.1em] uppercase opacity-70">
                They typed
              </p>
              <p className="text-micro font-semibold tracking-[0.1em] uppercase opacity-70">
                Recorded as
              </p>
            </div>

            <ul className="mt-3 flex flex-col">
              {READS.map((read, i) => (
                <li
                  key={read.field}
                  /* The rule between rows is `currentColor` at low alpha rather
                     than `--border`: this tile's ground is the saturated text
                     blue, and the neutral border token disappears on it. */
                  className="grid grid-cols-[1fr_auto] items-center gap-x-4 border-t border-current/15 py-2.5 first:border-t-0 first:pt-0 last:pb-0"
                >
                  {/* The typed line arrives, then the read of it — a beat
                      later, every row, so the eye learns the pattern by the
                      second one and reads the other three as cause and effect
                      rather than as a two-column table. */}
                  <p
                    className="cf-a-slide-l text-caption min-w-0 font-mono leading-snug opacity-80"
                    style={{ animationDelay: `${120 + i * 260}ms` }}
                  >
                    &ldquo;{read.typed}&rdquo;
                  </p>
                  <div
                    className="cf-a-slide-r shrink-0 text-right"
                    style={{ animationDelay: `${300 + i * 260}ms` }}
                  >
                    <p className="text-micro tracking-[0.08em] uppercase opacity-70">
                      {read.field}
                    </p>
                    <p className="text-body font-display tabular leading-tight font-bold">
                      {read.value}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </InView>
        </Tile>

        <Tile tone="number" span={7}>
          <TileTitle>It can&rsquo;t publish a dead end.</TileTitle>
          <TileBody>
            Nineteen operators, nested groups, scoring. The linter walks every path
            before publish.
          </TileBody>
          <InView className="border-border/70 bg-background mt-5 rounded-xl border p-2">
            <FlowPreview />
          </InView>
        </Tile>

        {/* Row four: how a finished form reaches people.

            This was a third of `how-it-works.tsx` — a "Share it" beat next to
            "Describe it" and "Shape it", in a band that restated this entire
            mosaic in three cards. The band is gone; the one thing in it that
            this page did not already say is here, at full width, with the four
            routes drawn instead of listed. All four are shipped: the public
            `/f/:slug` page, the QR generated in the browser, `embed.js` with
            its four `data-mode` values, and the same REST API the dashboard
            itself runs on. */}
        <Tile tone="advanced" span={12}>
          <TileTitle>Then put it anywhere.</TileTitle>
          <TileBody className="max-w-lg">
            One form, four ways out — and nothing to rebuild for any of them.
          </TileBody>

          <InView as="div" className="mt-6">
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {REACH.map((way, i) => (
              <li
                key={way.label}
                className="cf-a-rise border-border/70 bg-background flex flex-col rounded-xl border p-3"
                style={{ animationDelay: `${100 + i * 110}ms` }}
              >
                {/* Fixed height, so four drawings of four different natural
                    sizes still put their captions on one line. */}
                <div className="grid h-24 place-items-center px-1">{way.art}</div>
                {/* `text-foreground`, explicitly. The tile sets the near-black
                    `--on-band-vivid` on itself and every child inherits it —
                    correct on the coral ground, invisible inside a panel whose
                    background flips to charcoal in the dark theme. The detail
                    line below was already fine because `text-muted-foreground`
                    is theme-aware; the label was the one thing on this row
                    still wearing the tile's ink. */}
                <p className="text-caption text-foreground mt-1 font-semibold">{way.label}</p>
                <p className="text-micro text-muted-foreground mt-1 leading-snug">
                  {way.detail}
                </p>
              </li>
            ))}
            </ul>
          </InView>
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
  tone: "content" | "text" | "contact" | "number" | "choice" | "scale" | "advanced";
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

/**
 * The four reach drawings.
 *
 * All four sit inside the same 132×72 frame at the same stroke weight, because
 * the row is a comparison and a comparison drawn at four scales is not one.
 * `--family-advanced-ink` is the tile's own family, so the accent in each
 * drawing belongs to the tile it is on rather than to the brand generally.
 */

const ACCENT = "var(--family-advanced-ink)";

/** A browser chrome, which three of the four drawings need. */
function Frame({ children }: { children: React.ReactNode }) {
  return (
    <svg viewBox="0 0 132 72" className="h-[72px] w-[132px]" aria-hidden>
      <rect
        x="0.75"
        y="0.75"
        width="130.5"
        height="70.5"
        rx="6"
        fill="var(--muted)"
        stroke="var(--border)"
        strokeWidth="1.5"
      />
      <path d="M0 14 H132" stroke="var(--border)" strokeWidth="1.5" />
      <circle cx="9" cy="7.5" r="2" fill="var(--border)" />
      <circle cx="16" cy="7.5" r="2" fill="var(--border)" />
      <circle cx="23" cy="7.5" r="2" fill="var(--border)" />
      {children}
    </svg>
  );
}

/** Page lines, the grey furniture the accent sits on top of. */
function PageLines({ x = 10, width = 60 }: { x?: number; width?: number }) {
  return (
    <g fill="var(--border)">
      <rect x={x} y="24" width={width} height="4" rx="2" />
      <rect x={x} y="33" width={width * 0.75} height="4" rx="2" />
      <rect x={x} y="42" width={width * 0.9} height="4" rx="2" />
      <rect x={x} y="51" width={width * 0.55} height="4" rx="2" />
    </g>
  );
}

/** The URL in the address bar, because a link is a thing you read. */
function LinkArt() {
  return (
    <Frame>
      <rect x="32" y="3.5" width="92" height="8" rx="4" fill="var(--background)" />
      {/* The URL fills the address bar rather than being in it, which is the
          only thing that distinguishes this drawing from the embed one. */}
      <g className="cf-a-grow" style={{ animationDelay: "260ms", transformOrigin: "36px 7.5px" }}>
        <rect x="36" y="6" width="52" height="3" rx="1.5" fill={ACCENT} />
      </g>
      <PageLines width={112} />
    </Frame>
  );
}

/**
 * A QR code as a glyph, not as a payload.
 *
 * The first attempt placed data modules on an 8px pitch inside a 72-unit
 * viewBox and ran seven of them off the right edge, so what shipped was three
 * finder squares and a spill. This is the real geometry instead — 21 modules,
 * finders in three corners with their separator ring, a timing row that
 * alternates — written out as a bitmap so the picture is legible in the source
 * as well as on the page.
 *
 * It does not encode anything and is not meant to scan; the product's QR is
 * generated from the form's own URL in the browser. This is the shape of one,
 * at 72px, next to three other drawings of the same size.
 */
const QR = [
  "#######.#.#.#.#######",
  "#.....#...##..#.....#",
  "#.###.#.#.#...#.###.#",
  "#.###.#..##.#.#.###.#",
  "#.###.#.#..##.#.###.#",
  "#.....#..#.#..#.....#",
  "#######.#.#.#.#######",
  ".........#...........",
  "##.#.##.#..#..#.##..#",
  ".#..#..#.##.##..#.##.",
  "#.##.#..#.#...##..#.#",
  "..#..###..##.#.#.##..",
  "#.#.#....##..#.#..#.#",
  ".......#.#.#.###.#..#",
  "#######.#.#....#.##.#",
  "#.....#...##.###..#..",
  "#.###.#.#..#...###.#.",
  "#.###.##.##.#.#..##.#",
  "#.###.#.#.#..#.#.#..#",
  "#.....#...#.#.##..##.",
  "#######.#..##..#.#.##",
] as const;

function QrArt() {
  return (
    <svg viewBox="0 0 21 21" className="size-[72px]" aria-hidden shapeRendering="crispEdges">
      {/* The data modules resolve on a diagonal sweep — `x + y` rather than a
          per-module random — so the whole code fills from the top-left corner
          in one pass instead of flickering module by module. */}
      {QR.flatMap((row, y) =>
        [...row].map((cell, x) =>
          cell === "#" ? (
            <rect
              key={`${x}-${y}`}
              x={x}
              y={y}
              width="1"
              height="1"
              fill={ACCENT}
              className="cf-a-rise"
              style={{ animationDelay: `${380 + (x + y) * 14}ms` }}
            />
          ) : null,
        ),
      )}
    </svg>
  );
}

/** The launcher pill, sitting in the corner of somebody else's page. */
function EmbedArt() {
  return (
    <Frame>
      <PageLines width={70} />
      {/* The pill arrives after the page it is landing on, because that is
          the sequence: somebody's site loads, then the launcher appears in
          the corner of it. */}
      <g className="cf-a-pop" style={{ animationDelay: "420ms", transformOrigin: "102px 54px" }}>
        <rect x="82" y="46" width="40" height="17" rx="8.5" fill={ACCENT} />
        <rect x="90" y="53" width="24" height="3" rx="1.5" fill="var(--background)" />
      </g>
    </Frame>
  );
}

/** Two calls, which is genuinely the whole of it. */
function ApiArt() {
  return (
    <svg viewBox="0 0 132 72" className="h-[72px] w-[132px]" aria-hidden>
      <rect
        x="0.75"
        y="0.75"
        width="130.5"
        height="70.5"
        rx="6"
        fill="var(--muted)"
        stroke="var(--border)"
        strokeWidth="1.5"
      />
      <text
        x="10"
        y="27"
        fontSize="9"
        fontFamily="ui-monospace, monospace"
        fill={ACCENT}
        fontWeight="600"
      >
        POST
      </text>
      <rect x="42" y="21" width="58" height="4" rx="2" fill="var(--border)" />
      <rect x="10" y="36" width="80" height="4" rx="2" fill="var(--border)" />
      <rect x="10" y="45" width="62" height="4" rx="2" fill="var(--border)" />
      {/* The 200 comes back after the request goes out — a half-second of
          latency, drawn. */}
      <g className="cf-a-rise" style={{ animationDelay: "520ms" }}>
        <text
          x="10"
          y="63"
          fontSize="9"
          fontFamily="ui-monospace, monospace"
          fill={ACCENT}
          fontWeight="600"
        >
          200
        </text>
        <rect x="34" y="57" width="44" height="4" rx="2" fill="var(--border)" />
      </g>
    </svg>
  );
}
