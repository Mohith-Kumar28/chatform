import Link from "next/link";
import { QUESTION_TYPES } from "./question-types";

/**
 * Every question type, moving, in its own family colour.
 *
 * This replaces two things at once. It replaces `MetricBand` — four big
 * numbers over four small labels, which is the stock hero-metric strip and
 * which spent a quarter of its area telling visitors we deploy to 330
 * Cloudflare cities. And it replaces the 26-tile question-type grid, which ate
 * a full screen of the landing page to say one thing: there are a lot of them,
 * and each has a colour.
 *
 * A moving strip says that in a fifth of the space and is the better evidence,
 * because it shows the range instead of counting it. It also introduces the
 * palette the rest of the page is built on before any band uses it — by the
 * time a violet band arrives, violet already means "scale".
 *
 * Read from the builder's own registry via `question-types`, so a new block
 * type appears here on the next build and cannot drift from the product.
 */

const TYPES = QUESTION_TYPES;

export function SpectrumStrip() {
  return (
    <section
      aria-label={`${TYPES.length} question types`}
      className="border-border/60 relative overflow-hidden border-y py-5"
    >
      {/* The track holds the list twice; the keyframe travels exactly -50%. */}
      <div className="marquee-track flex w-max gap-2.5 pl-2.5">
        {[0, 1].map((copy) => (
          <ul key={copy} aria-hidden={copy === 1} className="flex shrink-0 gap-2.5">
            {TYPES.map((block, i) => {
              // Alternating fill and wash. A strip of one treatment reads as a
              // legend; two treatments read as a spectrum. The filled pill uses
              // `-ink` as its ground with the page colour as type, because the
              // raw family hue is a mark tier and never carries small text.
              const filled = (i + copy) % 3 === 0;
              return (
                <li
                  key={block.type}
                  style={
                    filled
                      ? {
                          background: `var(--family-${block.tone}-ink)`,
                          color: "var(--background)",
                        }
                      : {
                          background: `var(--family-${block.tone}-soft)`,
                          color: `var(--family-${block.tone}-ink)`,
                        }
                  }
                  className="text-caption flex items-center gap-1.5 rounded-full px-3.5 py-1.5 font-medium whitespace-nowrap"
                >
                  <block.icon className="size-3.5 shrink-0" strokeWidth={2} />
                  {block.label}
                </li>
              );
            })}
          </ul>
        ))}
      </div>

      {/* Fades the track into the page rather than letting pills get guillotined
          at the viewport edge. Two solid stops so it works on any ground. */}
      <div
        aria-hidden
        className="from-background pointer-events-none absolute inset-y-0 left-0 w-20 bg-gradient-to-r sm:w-32 to-transparent"
      />
      <div
        aria-hidden
        className="from-background pointer-events-none absolute inset-y-0 right-0 w-20 bg-gradient-to-l sm:w-32 to-transparent"
      />

      {/* What a screen reader and a search engine get, since the track is a
          decorative loop. Also the only honest place for the count. */}
      <p className="sr-only">
        chatform has {TYPES.length} question types, colour-coded by what they collect.{" "}
        <Link href="/pricing#question-types">See the full list.</Link>
      </p>
    </section>
  );
}
