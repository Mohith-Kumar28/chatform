import { BookOpen, CornerDownLeft, Zap } from "lucide-react";
import { Band, BandTitle, BandLede } from "./band";
import { InView } from "./in-view";
import { ArrowMark, HandNote } from "./annotate";
import dynamic from "next/dynamic";
import { LazySection } from "./lazy-section";

/**
 * The page's second typewriter, several viewports below the fold.
 *
 * `dynamic` takes its chunk out of the route's static client references, so it
 * stops being one of the `<script async>` tags in `<head>`; `LazySection`
 * below means it is not even fetched until someone scrolls near it. Together
 * that is a 33 KB component, an IntersectionObserver and a 32 ms render loop
 * that a visitor who never reaches this band never pays for.
 */
const ChatDemo = dynamic(() => import("./chat-demo").then((m) => m.ChatDemo));
import { MOMENT_SCRIPT } from "./chat-demo-scripts";

/**
 * The differentiator, given the loudest band on the page.
 *
 * This exchange is the acceptance test for the whole product thesis — the
 * respondent interrupts with a question of their own, the agent answers it out
 * of the creator's knowledge base and returns to the question it was asking,
 * inside a single turn. A form can only ask.
 *
 * Which is why the copy here got cut hardest. The old version explained that
 * three times: a two-sentence lede, three callouts of two-to-three sentences
 * each, and then a closing paragraph that restated the heading in different
 * words. The demo already proves it in four bubbles. Everything else is now
 * one line per point — a caption on the evidence rather than a substitute for
 * looking at it.
 */

const CALLOUTS = [
  {
    icon: BookOpen,
    title: "Quotes your knowledge base",
    body: "Your documents, pages and notes, on Pro. It quotes you, not the internet.",
  },
  {
    icon: CornerDownLeft,
    title: "Never loses its place",
    body: "Your form is still in charge. Nothing gets skipped, nothing gets asked twice.",
  },
  {
    icon: Zap,
    title: "One turn, both jobs",
    body: "Records the answer and replies to the question in the same breath.",
  },
] as const;

export function TheMoment() {
  return (
    <Band id="the-moment" tone="brand" size="tall">
      <div className="max-w-2xl">
        <BandTitle>It answers their questions, too.</BandTitle>
        <BandLede tone="brand">
          Watch the respondent stop answering and start asking.
        </BandLede>
      </div>

      <div className="mt-12 grid gap-10 lg:grid-cols-[1.15fr_0.85fr] lg:items-center lg:gap-14">
        {/* The fallback reserves the feature variant's exact height
            (`h-[22rem]` in `chat-demo.tsx`) so the swap shifts nothing. */}
        <LazySection fallback={<div className="h-[22rem]" aria-hidden />} rootMargin="400px">
          <ChatDemo script={MOMENT_SCRIPT} variant="feature" label="Recording" />
        </LazySection>

        <ul className="flex flex-col gap-7">
          {CALLOUTS.map((c) => (
            <li key={c.title} className="flex gap-4">
              {/* Orange on violet: the mark's two hues, doing the same job here
                  that they do in the logo — the ground is the interviewer's
                  plate, the chip is the respondent's. */}
              <span className="bg-primary text-primary-foreground mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl">
                <c.icon className="size-4.5" strokeWidth={2} />
              </span>
              <div>
                <h3 className="text-h3">{c.title}</h3>
                <p
                  /* `--brand-violet-band-muted` was ink for the PASTEL violet
                     this band used to be — a pale tint of the hue, which on
                     the saturated ground it is now reads as light grey text on
                     a strong colour. The vivid tier's muted ink is a step down
                     from the near-black already on the band. */
                  className="text-body mt-1 leading-relaxed"
                  style={{ color: "var(--on-band-vivid-muted)" }}
                >
                  {c.body}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </div>

      {/* This band's one mark, under the callouts and pointing back at the
          transcript on the left. The band is named for a moment inside a
          recording that plays itself — somebody watching the demo has no
          reason to know which turn is the one worth watching for, and this
          says it in five words rather than in a fourth callout. */}
      <InView className="mt-10 flex items-start gap-2 lg:mt-4">
        {/* Up and to the left, at the transcript it is about — the note sits
            under the demo, so any arrow that curves downward points at the
            page's own margin. */}
        <ArrowMark
          dir="up-left"
          positioned={false}
          draw
          delay={260}
          className="size-12 shrink-0 opacity-60"
        />
        <HandNote
          tilt={-3}
          className="cf-a-rise mt-6"
          style={{ color: "var(--on-band-vivid)", animationDelay: "700ms" }}
        >
          nobody scripted that answer
        </HandNote>
      </InView>
    </Band>
  );
}
