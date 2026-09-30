import { Band, BandTitle, BandLede } from "./band";
import { InView } from "./in-view";
import { BookOpen } from "lucide-react";
import { study } from "@/content/research";

/**
 * The three pillars, directly under the hero.
 *
 * The hero makes one promise — more of the people who start will finish — and
 * this band is the whole of how, in three tiles, in the order a respondent
 * meets them: the questions adapt, the ones who leave get chased, and you can
 * measure whether the chasing worked.
 *
 * It used to be titled "Three things a form cannot do", which spent the
 * headline on the competition. Nobody arrives here to hear what other form
 * builders lack. The title now names our own claim, and every tile is one
 * short sentence — the earlier version ran three-line paragraphs plus a
 * two-line citation gloss plus a caption inside each graphic, which is four
 * blocks of prose to make one point three times.
 *
 * The row is a subgrid, so the four bands of every tile — title, sentence,
 * graphic, source — sit on the same four lines across all three. Before that
 * each tile was an independent flex column and the graphics started at three
 * different heights, which is the one thing a row of three cards must never
 * do.
 *
 * The third tile is the one a form cannot fake at all: a respondent asks
 * something back, and gets an answer from the docs and links the owner gave it
 * before the conversation carries on. The first and third tiles play as short
 * chats, typing dots and all, because a still of a chat undersells the part
 * where it replies.
 *
 * What this band must never grow: a recovery percentage. The number the
 * category quotes — some share of people who "convert on the third email" —
 * is conversion of emails sent, measured with no control group, by vendors
 * selling the emails. `content/research.ts` says why at more length.
 */

const TONE = {
  talk: "text",
  chase: "choice",
  answer: "scale",
} as const;

export function HowItConverts() {
  const xiao = study("xiao-2020");
  const sauermann = study("sauermann-2013");

  return (
    <Band id="how-it-works">
      <div className="max-w-2xl">
        <BandTitle accent="and zero tricks.">Three pillars behind more submissions.</BandTitle>
        <BandLede>It talks like a person, follows up on its own, and answers back.</BandLede>
      </div>

      {/* Four rows, shared by all three tiles: title, sentence, graphic, source.
          `1fr` on the graphic row is what makes the panels start and end on the
          same line no matter how tall their contents are. */}
      <ol className="mt-12 grid gap-4 lg:grid-cols-3 lg:grid-rows-[auto_auto_1fr_auto]">
        <Pillar
          tone={TONE.talk}
          title="Talks like a person"
          body="One question at a time, in plain words. A thin answer gets a follow-up question."
          source={xiao}
        >
          <MiniChat />
        </Pillar>

        <Pillar
          tone={TONE.chase}
          title="Automated follow-ups"
          body="An email brings the ones who left back to the question they stopped on."
          source={sauermann}
        >
          <Cadence />
        </Pillar>

        <Pillar
          tone={TONE.answer}
          title="Answers their questions"
          body="A form goes quiet when someone is unsure. chatform answers, then picks up where they were."
          note="Answers come from the docs and links you give it."
        >
          <AnswersBack />
        </Pillar>
      </ol>
    </Band>
  );
}

/**
 * A tile. The graphic sits on the page colour rather than on the tile's tint,
 * for the same reason it does in `HowItWorks` — these are drawings of product
 * surfaces, and a product surface tinted green is not what anybody will see.
 *
 * `grid-rows-subgrid` from `lg` up; a plain column below it, where the tiles
 * stack and there is nothing to align to.
 */
function Pillar({
  tone,
  title,
  body,
  source,
  note,
  children,
}: {
  tone: "text" | "choice" | "scale";
  title: string;
  body: string;
  source?: ReturnType<typeof study>;
  /** The closing line for the tile that has no paper behind it. */
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <li
      style={{
        background: `var(--family-${tone}-band-vivid)`,
        color: "var(--on-band-vivid)",
      }}
      className="flex h-full min-w-0 flex-col rounded-2xl p-6 lg:row-span-4 lg:grid lg:grid-rows-subgrid lg:gap-y-0"
    >
      <h3 className="text-h2 font-bold tracking-[-0.02em] text-balance">{title}</h3>
      <p
        className="text-body mt-2 leading-relaxed"
        style={{ color: "var(--on-band-vivid-muted)" }}
      >
        {body}
      </p>

      <div className="mt-5 flex-1">{children}</div>

      {/* One line, and never more than one: the finding's authors and where it
          was published. The gloss that used to sit in front of it restated the
          sentence above the graphic in slightly different words. */}
      <p
        className="text-micro mt-5 leading-relaxed"
        style={{ color: "var(--on-band-vivid-muted)" }}
      >
        {source ? (
          <a href={source.url} className="underline underline-offset-4" rel="noopener">
            {source.authors.split(" and ")[0]!.split(",")[0]} et al., {source.venue.split(",")[0]},{" "}
            {source.year}
          </a>
        ) : (
          note
        )}
      </p>
    </li>
  );
}

/**
 * The graphics all fill their row and centre what is inside them, so three
 * drawings of different natural heights read as one line across the row.
 */
function Panel({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <InView
      className={[
        "border-border/70 bg-background flex h-full flex-col justify-center rounded-xl border p-4",
        className ?? "",
      ].join(" ")}
    >
      {children}
    </InView>
  );
}

/**
 * The chat graphics share one timeline: each turn arrives on its own delay,
 * and a reply from chatform is preceded by typing dots that hold its place and
 * clear as it lands. Played once, by the `Panel`'s `InView`, when the tile
 * scrolls into view. Without motion (or before arming) every bubble is simply
 * there and the dots are not.
 */
type Turn = { from: "bot" | "person"; text: React.ReactNode; at: number; tag?: string };

const TYPING_MS = 700;

function Thread({ turns, tone }: { turns: Turn[]; tone: "text" | "scale" }) {
  return (
    <Panel className="gap-2">
      {turns.map((turn, i) =>
        turn.from === "person" ? (
          <p
            key={i}
            className="cf-a-slide-r text-micro text-muted-foreground border-border/60 self-end rounded-lg border px-2.5 py-2"
            style={{ animationDelay: `${turn.at}ms` }}
          >
            {turn.text}
          </p>
        ) : (
          // The dots and the bubble share one grid cell, so the dots take
          // exactly the room the reply will, and nothing jumps when it lands.
          <div key={i} className="grid">
            {i > 0 ? (
              <span
                aria-hidden
                className="cf-a-typing flex items-center gap-1 self-start justify-self-start rounded-lg px-2.5 py-2.5 [grid-area:1/1]"
                style={{
                  background: `var(--family-${tone}-soft)`,
                  animationDelay: `${turn.at - TYPING_MS}ms`,
                }}
              >
                {[0, 1, 2].map((dot) => (
                  <span
                    key={dot}
                    className="block size-1 rounded-full [animation:cf-typing-dot_1.1s_ease-in-out_infinite]"
                    style={{
                      background: `var(--family-${tone}-ink)`,
                      animationDelay: `${dot * 140}ms`,
                    }}
                  />
                ))}
              </span>
            ) : null}
            <div
              className="cf-a-slide-l flex flex-col items-start gap-1 [grid-area:1/1]"
              style={{ animationDelay: `${turn.at}ms` }}
            >
              <p
                className="text-micro rounded-lg px-2.5 py-2"
                style={{
                  background: `var(--family-${tone}-soft)`,
                  color: `var(--family-${tone}-ink)`,
                }}
              >
                {turn.text}
              </p>
              {turn.tag ? (
                <span
                  className="cf-a-pop text-micro inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium"
                  style={{
                    animationDelay: `${turn.at + 260}ms`,
                    color: `var(--family-${tone}-ink)`,
                    border: `1px solid color-mix(in oklch, var(--family-${tone}-ink) 30%, transparent)`,
                  }}
                >
                  <BookOpen aria-hidden className="size-3" strokeWidth={2} />
                  {turn.tag}
                </span>
              ) : null}
            </div>
          </div>
        ),
      )}
    </Panel>
  );
}

/** A thin answer, and the question that refuses to accept it. */
function MiniChat() {
  return (
    <Thread
      tone="text"
      turns={[
        { from: "bot", text: "What went wrong with the last tool you tried?", at: 150 },
        { from: "person", text: "it was bad", at: 750 },
        {
          from: "bot",
          text: <>Bad how? The price, or something it couldn&rsquo;t do?</>,
          at: 1650,
        },
      ]}
    />
  );
}

/** The respondent asks back, gets an answer, and the form carries on. */
function AnswersBack() {
  return (
    <Thread
      tone="scale"
      turns={[
        { from: "bot", text: "How many people are on your team?", at: 150 },
        { from: "person", text: "wait, who sees my answers?", at: 750 },
        {
          from: "bot",
          text: "Only the Northwind team. Nothing is shared outside it.",
          at: 1650,
          tag: "From your docs",
        },
        { from: "bot", text: "So, how many on your team?", at: 2700 },
      ]}
    />
  );
}

/**
 * The cadence, drawn to scale.
 *
 * The gaps widen — four hours, then a day, then three days — and the only
 * honest way to show that is to put the marks where the hours actually fall on
 * a linear axis rather than spacing them evenly and captioning them.
 *
 * The third mark is dashed because it is off by default. Three is the ceiling
 * the schema enforces, and the default sequence is two.
 */
const STEPS = [
  { at: 4, label: "4h", optional: false },
  { at: 24, label: "1 day", optional: false },
  { at: 72, label: "3 days", optional: true },
] as const;

function Cadence() {
  return (
    <Panel>
      {/* The inset wrapper is what makes the labels work.
          `left: 100%` resolves against the padding box, so padding on the
          positioned element itself would not move the last mark inward — it
          has to come from a parent. With the track inset by `px-6`, a label
          centred on the 72-hour mark has 24px here plus the panel's own to
          overhang into, which is more than half of the widest of them. */}
      <div className="px-6">
        {/* The rule is its own element rather than the dots' parent, because
            `opacity-25` on a parent cascades to the whole subtree and the
            marks came out as grey smudges too. Only the line recedes.

            `bg-border`, not `bg-current`: `current` here is the near-black the
            tile sets on itself, which is right on the green ground outside and
            invisible inside a panel whose background goes charcoal in the dark
            theme. The line was simply not there in dark mode, so the cadence
            read as three dots floating in a box. */}
        <div className="relative h-2.5 w-full">
          {/* Both the rule and the marks are two elements each: an outer one
              that does the positioning, and an inner one that does the moving.
              `transform` is a single property — an animation that sets
              `scaleX` overwrites the `-translate-y-1/2` that centres the rule
              on the track, and the pop overwrote the `-translate-x-1/2` that
              puts each mark on its own hour. Splitting them is the fix that
              does not need the animation to know where the element sits. */}
          <div aria-hidden className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2">
            <div className="cf-a-grow bg-border h-px w-full" />
          </div>
          {STEPS.map((step) => (
            <span
              key={step.at}
              aria-hidden
              className="absolute top-1/2 block -translate-x-1/2 -translate-y-1/2"
              style={{ left: `${(step.at / 72) * 100}%` }}
            >
              <span
                className="cf-a-pop block size-2.5 rounded-full"
                style={{
                  /* Timed off the mark's own hour, so the dots land in step
                     with the rule drawing under them rather than all at once
                     over a line still on its way. */
                  animationDelay: `${240 + (step.at / 72) * 620}ms`,
                  background: step.optional ? "var(--background)" : "var(--family-choice-ink)",
                  border: step.optional ? "1.5px dashed var(--family-choice-ink)" : undefined,
                }}
              />
            </span>
          ))}
        </div>
        <div className="relative mt-3 h-4">
          {STEPS.map((step) => (
            <span
              key={step.at}
              className="text-micro text-muted-foreground absolute -translate-x-1/2 whitespace-nowrap"
              style={{ left: `${(step.at / 72) * 100}%` }}
            >
              <span
                className="cf-a-rise block"
                style={{ animationDelay: `${380 + (step.at / 72) * 620}ms` }}
              >
                {step.label}
              </span>
            </span>
          ))}
        </div>
      </div>
    </Panel>
  );
}
