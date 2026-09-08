import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ChatDemo } from "./chat-demo";
import { HERO_SCRIPT } from "./chat-demo-scripts";
import { CircleMark } from "./annotate";

/**
 * `NEXT_PUBLIC_DEMO_FORM_SLUG` replaces the hardcoded `/f/test-waitlist` the
 * old hero pointed at — a seed row that may or may not exist in any given
 * environment. With no slug configured the link is simply not rendered, rather
 * than shipping a link to a 404.
 */
const DEMO_SLUG = process.env.NEXT_PUBLIC_DEMO_FORM_SLUG;

/**
 * What came out of this hero, and why.
 *
 * Out: the pill badge above the headline ("Agentic forms · free forever plan").
 * A label above an `h1` is an eyebrow, and an eyebrow is a heading admitting it
 * cannot carry itself. Out: two of the three sentences under it. The old lede
 * explained the mechanism, named the competition and described the knowledge
 * base before anyone had reason to care about any of it — 47 words to set up a
 * demo that is playing four inches to the right and says it better.
 *
 * In: the seam. The wash behind this section is split on the same diagonal as
 * the mark, in the mark's two hues. The logo is the page, at page scale.
 *
 * It is now the `-band-vivid` tier at full opacity, where it was the quiet
 * `-band` tier at 0.70 behind a radial mask — the hue reduced three times over
 * before it reached anyone. A hero whose ground you notice "only as warmth" is
 * a hero with no ground. Both halves still derive from one mix, so the seam
 * weighs the same on each side, which is the only way it reads as a seam
 * rather than as a fade.
 */
export function Hero() {
  return (
    /* No `overflow-hidden`. The wash is offset `-top-32` precisely so it runs
       up behind the transparent nav — and the clip was quietly cancelling
       that, leaving a charcoal strip across the top of the brightest section
       on the site. The header is `sticky` with its own z-index, so the wash
       passes under it rather than over it. Nothing else in here overflows. */
    <section className="relative px-6 pt-14 pb-16 sm:pt-20 sm:pb-24">
      <div
        aria-hidden
        /* The wash, at strength.
           It used to be the `-band` tokens — 17% of each hue — at opacity 0.70
           behind a radial mask that faded most of what was left. Three
           reductions stacked on one another, and what reached the screen was a
           faint warm smudge that read as a rendering artefact rather than as
           the mark blown up to page scale, which is what it is.
           Now it is the vivid tier at full opacity, and the mask only softens
           the bottom edge into the page instead of eating the whole thing. The
           seam still sits on the mark's diagonal, and the two hues still meet
           as a sweep rather than a plate — the rule that has always governed
           these two at full strength. */
        className="pointer-events-none absolute inset-0 -top-32 [mask-image:linear-gradient(to_bottom,black_0%,black_78%,transparent_100%)]"
        style={{
          background:
            "linear-gradient(115deg, var(--brand-orange-band-vivid) 0%, var(--brand-orange-band-vivid) 30%, var(--brand-violet-band-vivid) 74%, var(--brand-violet-band-vivid) 100%)",
        }}
      />
      {/* The dot grid keeps the wash from reading as a flat panel. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.07] [background-image:radial-gradient(var(--on-band-vivid)_1px,transparent_1px)] [background-size:22px_22px] [mask-image:linear-gradient(to_bottom,black_0%,black_62%,transparent_100%)]"
      />

      {/* Ink for everything on the wash. Set once here rather than per
          element: `--foreground` is near-white in the dark theme and would
          vanish on a ground that is now bright in BOTH themes. This is the
          same near-black the bands and the gradient button use. */}
      <div
        style={{ color: "var(--on-band-vivid)" }}
        className="relative mx-auto grid max-w-6xl items-center gap-10 lg:grid-cols-[1.1fr_1fr] lg:gap-14"
      >
        <div>
          {/* The outcome, not the mechanism.
              Three headlines have stood here. "An interviewer, not a form."
              read well and communicated nothing. "Turn any form into a chat."
              fixed that — plain words, no metaphor to decode — but it still
              described what the product *is*, and left the visitor to work out
              on their own why a chat should be better than a form. Nobody
              arrives wanting a chat. They arrive because a form is losing
              them.
              So the line names the loss. "Question four" is deliberately a low
              number and deliberately not a statistic: it is the shape of the
              problem, not a measurement, and there is no cross-customer
              completion data in this product to make a measurement from. The
              claim with real evidence behind it lives one band down, with its
              citations, at /why-conversation-works.
              "four." is ringed by hand rather than coloured, because the ground
              here is the brand's two hues at full strength — the one place
              where coloured type is guaranteed to disappear. */}
          {/*
            Sized here rather than by `text-display-2xl`, and this is the one
            place on the site allowed to do that.

            The shared utility tops out at 4.5rem, which was right for "Turn any
            form into a chat." at 26 characters. This headline is 36, and at
            72px "Stop losing people" measures 621px inside a 574px column — so
            it broke to three lines with "people" orphaned on the middle one.
            A type scale that cannot respond to the length of the line it is
            setting is a scale being applied to the wrong thing.

            The clamp is tuned so "Stop losing people" fits one line at every
            width from the `lg` breakpoint up, which is what puts the ring on
            "four." at the end of line two instead of stranding it. */}
          <h1 className="font-display font-bold tracking-[-0.045em] text-balance text-[clamp(2.5rem,1.1rem+3.4vw,4rem)] leading-[1]">
            <span className="word-rise inline-block" style={{ animationDelay: "60ms" }}>
              Stop losing people
            </span>{" "}
            <span className="word-rise inline-block" style={{ animationDelay: "150ms" }}>
              at question{" "}
              <span className="relative inline-block">
                four.
                <CircleMark className="text-[var(--on-band-vivid)] opacity-80" />
              </span>
            </span>
          </h1>

          {/*
            The margin note is gone, and its arrow with it.

            It was `one question at a time`, positioned for a headline that
            occupied one line at `13ch`. This headline is two, and the note
            landed directly on the ring around "four." — the annotation
            obscuring the thing it was annotating.

            It could have been repositioned. It was deleted instead, for two
            reasons. `annotate.tsx` allows one pen mark per section and this
            section already has the ring, which is the mark that earns its
            place: it puts the emphasis on the number the whole headline turns
            on. And the note said "one question at a time" — the mechanism,
            written in the margin of a headline that had just been rewritten to
            stop selling the mechanism.
          */}

          <p
            style={{ color: "var(--on-band-vivid-muted)" }}
            className="text-body-lg mt-6 max-w-md text-balance"
          >
            chatform turns your form into a conversation. It reads what people write, asks again
            when an answer is too thin to use, and answers their questions too — so they stay.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Button asChild size="lg" shape="pill" variant="on-brand" className="h-12 px-8">
              <Link href="/signin">Start free</Link>
            </Button>
            <Button
              asChild
              size="lg"
              shape="pill"
              variant="on-brand-outline"
              className="h-12 px-7"
            >
              <Link href="#the-moment">
                See how it works
                <ArrowRight className="size-4" strokeWidth={2.25} />
              </Link>
            </Button>
          </div>

          {/* "200 AI conversations a month" is a metering detail nobody has
              the context to value before they have used the product once. The
              two facts that actually decide whether somebody signs up are that
              it costs nothing and that the thing they collect is not capped. */}
          <p style={{ color: "var(--on-band-vivid-muted)" }} className="text-caption mt-6">
            Free forever · Unlimited forms and responses · No card
            {DEMO_SLUG && (
              <>
                {" · "}
                <Link
                  href={`/f/${DEMO_SLUG}`}
                  className="underline underline-offset-4 hover:opacity-70"
                >
                  try a real one
                </Link>
              </>
            )}
          </p>
        </div>

        <ChatDemo script={HERO_SCRIPT} variant="hero" />
      </div>
    </section>
  );
}
