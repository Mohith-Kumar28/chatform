import { Band, BandTitle, BandLede } from "./band";
import { study } from "@/content/research";

/**
 * The three mechanisms, directly under the hero.
 *
 * The hero makes an outcome claim — people stop leaving — and until now the
 * page answered it with evidence that the *problem* is real (`TheDropOff`) and
 * then, four bands later, with how you *build* a form (`HowItWorks`: describe,
 * shape, share). Nowhere between those did it say what the product actually
 * does to change the outcome. A visitor who wanted to know why a chat should
 * beat a form had to infer it from a demo.
 *
 * So this band says it in three, in the order they happen to a respondent:
 * it asks better, it comes back for the ones who left, and it can tell you
 * whether the second one worked. That last is the least obvious and the
 * hardest for anyone else to copy, which is why it is here rather than buried
 * in the docs.
 *
 * Two of the three carry a citation, and the third deliberately does not.
 * Holding back a control group is not a claim about human behaviour that needs
 * a paper behind it — it is arithmetic, and the tile explains the arithmetic.
 * Attaching a study to it anyway would be decoration, and decorated citations
 * are how the honest ones stop being worth anything.
 *
 * What this band must never grow: a recovery percentage. The number the
 * category quotes — some share of people who "convert on the third email" —
 * is conversion of emails sent, measured with no control group, by vendors
 * selling the emails. `content/research.ts` says why at more length. The
 * strongest honest version of that claim is the one on the third tile: we are
 * the only ones who will tell you the real number for your own form.
 */

const TONE = {
  ask: "text",
  chase: "choice",
  prove: "scale",
} as const;

export function HowItConverts() {
  const xiao = study("xiao-2020");
  const sauermann = study("sauermann-2013");

  return (
    <Band id="how-it-works">
      <div className="max-w-2xl">
        <BandTitle>Three things a form cannot do.</BandTitle>
        <BandLede>
          More answers, and fewer people gone by question four. This is the whole of how.
        </BandLede>
      </div>

      <ol className="mt-12 grid gap-4 lg:grid-cols-3">
        <Pillar
          tone={TONE.ask}
          title="It asks like a person"
          body="One question at a time, in a conversation that reads what you write. When an answer is too thin to use, it asks again instead of filing it."
          source={xiao}
          sourceNote="More informative, more specific answers than the same questions as a web survey."
        >
          <MiniChat />
        </Pillar>

        <Pillar
          tone={TONE.chase}
          title="It goes back for the ones who left"
          body="Most people who abandon a form never return on their own. This emails them, with a link that reopens the conversation on the question they stopped on — every answer they already gave still in it."
          source={sauermann}
          sourceNote="Reminders that change their wording across a sequence beat reminders that repeat themselves."
        >
          <Cadence />
        </Pillar>

        <Pillar
          tone={TONE.prove}
          title="It proves that worked"
          body="Hold a slice of the people who left out of the sequence and send them nothing. Whatever comes back from them was coming back anyway. The gap is what the reminders actually earned."
          note="No other form builder we could find offers one, which is why every recovery percentage in this category is a count of clicks."
        >
          <Holdout />
        </Pillar>
      </ol>
    </Band>
  );
}

/**
 * A tile. The graphic sits on the page colour rather than on the tile's tint,
 * for the same reason it does in `HowItWorks` — these are drawings of product
 * surfaces, and a product surface tinted green is not what anybody will see.
 */
function Pillar({
  tone,
  title,
  body,
  source,
  sourceNote,
  note,
  children,
}: {
  tone: "text" | "choice" | "scale";
  title: string;
  body: string;
  source?: ReturnType<typeof study>;
  sourceNote?: string;
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
      className="flex h-full min-w-0 flex-col rounded-2xl p-6"
    >
      <h3 className="text-h1 font-bold tracking-[-0.02em] text-balance">{title}</h3>
      <p
        className="text-body mt-2 leading-relaxed"
        style={{ color: "var(--on-band-vivid-muted)" }}
      >
        {body}
      </p>

      <div className="mt-5 flex-1">{children}</div>

      {/* The citation, and the sentence that says what was found — because a
          bare "CHI '19" under a marketing claim is a link nobody follows and
          everybody discounts. The finding is one line and it is not about
          chatform.

          All three tiles close on a line in this slot, citation or not. When
          only two of them did, the third's graphic stretched to fill the
          height the others spent on text and the row read as a tile with
          something missing from it. */}
      {source ? (
        <p className="text-micro mt-5 leading-relaxed" style={{ color: "var(--on-band-vivid-muted)" }}>
          {sourceNote}{" "}
          <a href={source.url} className="underline underline-offset-4" rel="noopener">
            {source.authors.split(" and ")[0]!.split(",")[0]} et al., {source.venue.split(",")[0]},{" "}
            {source.year}
          </a>
        </p>
      ) : note ? (
        <p className="text-micro mt-5 leading-relaxed" style={{ color: "var(--on-band-vivid-muted)" }}>
          {note}
        </p>
      ) : null}
    </li>
  );
}

function Panel({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={["border-border/70 bg-background rounded-xl border p-3", className ?? ""].join(" ")}>
      {children}
    </div>
  );
}

/** Two turns: a thin answer, and the question that refuses to accept it. */
function MiniChat() {
  return (
    <Panel className="flex flex-col gap-2">
      <p
        className="text-micro rounded-lg px-2.5 py-2"
        style={{ background: "var(--family-text-soft)", color: "var(--family-text-ink)" }}
      >
        What went wrong with the last tool you tried?
      </p>
      <p className="text-micro text-muted-foreground border-border/60 self-end rounded-lg border px-2.5 py-2">
        it was bad
      </p>
      <p
        className="text-micro rounded-lg px-2.5 py-2"
        style={{ background: "var(--family-text-soft)", color: "var(--family-text-ink)" }}
      >
        Bad how — the price, or something it couldn&rsquo;t do?
      </p>
    </Panel>
  );
}

/**
 * The cadence, drawn to scale.
 *
 * The gaps widen — four hours, then a day, then three days — and the only
 * honest way to show that is to put the marks where the hours actually fall on
 * a linear axis rather than spacing them evenly and captioning them. Evenly
 * spaced dots labelled "4h / 1 day / 3 days" would be a picture of a claim the
 * picture contradicts.
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
      <p className="text-micro text-muted-foreground">They stop answering here</p>

      {/* The inset wrapper is what makes the labels work.
          `left: 100%` resolves against the padding box, so padding on the
          positioned element itself would not move the last mark inward — it
          has to come from a parent. With the track inset by `px-6`, a label
          centred on the 72-hour mark has 24px here plus the panel's own 12px
          to overhang into, which is more than half of the widest of them. The
          first attempt at this put the dots on a full-width track and the
          labels in a `justify-between` row underneath, which reads fine until
          you notice "1 day" sitting at the halfway point above a dot at a
          third — a picture of even spacing captioned as uneven. */}
      <div className="mt-6 mb-2 px-6">
        {/* The rule is its own element rather than the dots' parent. It was
            the parent, carrying `opacity-25` — which cascades to the whole
            subtree, so the marks came out at a quarter strength too and the
            cadence read as three grey smudges on a grey line. Only the line
            is meant to recede. */}
        <div className="relative h-2.5 w-full">
          <div
            aria-hidden
            className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-current opacity-25"
          />
          {STEPS.map((step) => (
            <span
              key={step.at}
              aria-hidden
              className="absolute top-1/2 block size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full"
              style={{
                left: `${(step.at / 72) * 100}%`,
                background: step.optional ? "var(--background)" : "var(--family-choice-ink)",
                border: step.optional ? "1.5px dashed var(--family-choice-ink)" : undefined,
              }}
            />
          ))}
        </div>
        <div className="relative mt-3 h-4">
          {STEPS.map((step) => (
            <span
              key={step.at}
              className="text-micro text-muted-foreground absolute -translate-x-1/2 whitespace-nowrap"
              style={{ left: `${(step.at / 72) * 100}%` }}
            >
              {step.label}
            </span>
          ))}
        </div>
      </div>

      <p className="text-micro text-muted-foreground border-border/60 mt-2 border-t pt-2.5">
        Three is the ceiling, and the third one — dashed — is off until you turn it on.
      </p>
    </Panel>
  );
}

/** Two bars and the difference between them, which is the entire idea. */
function Holdout() {
  return (
    <Panel className="flex flex-col gap-2.5">
      <Bar label="Reminded" width="72%" filled />
      <Bar label="Held back" width="46%" />
      <p className="text-micro text-muted-foreground border-border/60 mt-0.5 border-t pt-2.5">
        The difference between the two bars is the recovery.
      </p>
    </Panel>
  );
}

function Bar({ label, width, filled }: { label: string; width: string; filled?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="text-micro text-muted-foreground w-16 shrink-0">{label}</span>
      <span className="bg-muted h-2.5 flex-1 overflow-hidden rounded-full">
        <span
          className="block h-full rounded-full"
          style={{
            width,
            background: filled ? "var(--family-scale-ink)" : "var(--family-scale-soft)",
          }}
        />
      </span>
    </div>
  );
}
