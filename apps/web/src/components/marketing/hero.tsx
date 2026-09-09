import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ChatDemo } from "./chat-demo";
import { HERO_SCRIPT } from "./chat-demo-scripts";
import { GradientField } from "@/components/brand/gradient-field";
import { CircleMark } from "./annotate";

/**
 * The published demo form, or nothing.
 *
 * `NEXT_PUBLIC_DEMO_FORM_SLUG` replaces the hardcoded `/f/test-waitlist` the
 * old hero pointed at — a seed row that may or may not exist in any given
 * environment. Unset, the secondary pill falls back to the "how it works"
 * anchor rather than shipping a link to a 404.
 *
 * Inlined at build time, like every `NEXT_PUBLIC_*`. Two consequences worth
 * knowing before debugging this: changing it needs `pnpm deploy:web` and not
 * just an API deploy, and it will not render under `next dev` unless
 * `.env.local` sets it — which reads exactly like the change not working.
 *
 * The form itself is authored in `tooling/demo-form/` and published by
 * `pnpm seed:demo:remote`.
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
      {/* The wash, at strength, and moving.
           It used to be the `-band` tokens — 17% of each hue — at opacity 0.70
           behind a radial mask that faded most of what was left. Three
           reductions stacked on one another, and what reached the screen was a
           faint warm smudge that read as a rendering artefact rather than as
           the mark blown up to page scale, which is what it is.
           Then it was the vivid tier at full opacity: the right colour, in the
           right place, and a flat plate. `GradientField` keeps that exact
           ground and drifts five blurred lobes of the brand hues across it,
           with a sixth following the cursor. The seam still sits on the mark's
           diagonal and the two hues still meet as a sweep rather than a plate —
           the rule that has always governed these two at full strength.
           At full `strength`, and it was 0.7 for a while on the theory that a
           field with a headline, a lede, two buttons and a live chat demo on
           top of it should be quieter than one without. That theory was wrong
           in a specific way: dimming the lobes does not make the type easier
           to read — the ink clears AA against every hue in the field either
           way — it only makes the drift too faint to notice, which leaves the
           cost of the effect and none of it. The mask still softens the bottom
           edge into the page. */}
      <GradientField
        tier="vivid"
        className="-top-32 [mask-image:linear-gradient(to_bottom,black_0%,black_78%,transparent_100%)]"
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
          {/* The outcome, said outright.

              Four headlines have stood here. "An interviewer, not a form."
              read well and communicated nothing. "Turn any form into a chat."
              fixed that — plain words, no metaphor — but it described what the
              product *is* and left the visitor to work out why a chat should
              beat a form. "Stop losing people at question four." named the
              problem instead of the product, which was the right move, and
              then asked the reader to do arithmetic to collect the promise:
              question four of what, and losing them to where. A headline that
              needs a footnote is a headline still deciding what it wants to
              say.

              This one skips the problem and states the result, in the two
              words a person running a form actually measures. Everything the
              old line implied is still on the page and better placed for it:
              the band directly beneath breaks the claim into three mechanisms,
              and `TheDropOff` under that carries the evidence that long forms
              lose people, with citations.

              What it does not do is quote a rate. There is no cross-customer
              completion data in this product — analytics computes drop-off for
              one form at a time, for its owner — so "more" stays qualitative
              here and the numbers stay where they can be sourced.

              "more" is ringed by hand rather than coloured, because the ground
              here is the brand's two hues at full strength — the one place on
              the site where coloured type is guaranteed to disappear. */}
          {/*
            Sized here rather than by `text-display-2xl`, and this is the one
            place on the site allowed to do that.

            The shared utility tops out at 4.5rem, which was right for "Turn any
            form into a chat." at 26 characters. This headline is 34, and at
            72px a line that long overflows the 574px column and breaks with a
            word orphaned on its own. A type scale that cannot respond to the
            length of the line it is setting is a scale applied to the wrong
            thing.

            The clamp is tuned so the headline holds two lines from the `lg`
            breakpoint up, which is what keeps the ring on "more" mid-line
            rather than stranding it. */}
          <h1 className="font-display font-bold tracking-[-0.045em] text-balance text-[clamp(2.5rem,1.1rem+3.4vw,4rem)] leading-[1]">
            <span className="word-rise inline-block" style={{ animationDelay: "60ms" }}>
              Agentic forms that get {" "}

               <span className="relative me-3 inline-block">
                more
                {/* Drawn on, and last. The two words rise at 60ms and 150ms; the ring
                    starts once they have both landed, which is the order it would
                    happen if somebody were actually marking up the page. It needs no
                    `InView` — this is the top of the document, always on screen at
                    load — so it carries the armed attribute itself. */}
                <span data-armed="" data-inview="" className="contents">
                  <CircleMark
                    draw
                    delay={900}
                    className="text-[var(--on-band-vivid)] opacity-80"
                  />
                </span>
              </span>{" "}
            </span>{" "}
           
              {/* `me-3` because the ring is drawn `-inset-x-4` — a whole rem
                  wider than the word on each side, which is what makes it read
                  as a pen going round something rather than as a border. At
                  the end of a line that overhang costs nothing; mid-sentence
                  it lands on the next word, and "more" had its ring resting on
                  the S of "submissions". The word keeps its normal space and
                  the mark gets its own. */}
             
              responses.
            
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

          {/*
            Two sentences, and the second one is new.

            The old lede described the conversation three ways — reads, asks
            again, answers back — which is one mechanism stated three times and
            says nothing about what the visitor ends up with. The headline
            promises fewer people lost; the honest other half of that promise
            is the follow-up sequence, which is the only part of this product
            that adds answers rather than protecting the ones already coming.
            So the lede is now ask-then-chase, which is also the order of the
            first two tiles in the band directly beneath it.

            "answers their questions too" came out to make room. It is a real
            feature and it is on the page twice more, but it is the third-most
            interesting thing here and it was taking the position of the first.
          */}
          <p
            style={{ color: "var(--on-band-vivid-muted)" }}
            className="text-body-lg mt-6 max-w-md text-balance"
          >
            chatform turns your form into a conversation that asks again when an answer is
            thin, and follows up with the people who leave.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Button asChild size="lg" shape="pill" variant="on-brand" className="h-12 px-8">
              <Link href="/signin">Start free</Link>
            </Button>
            {/*
              Two pills, and the second one is the demo wherever there is a demo
              to point at.

              Not three. The pair reads as one decision with a secondary option;
              a third makes it a menu, and the third would have been an in-page
              anchor wearing the same weight as a real destination. So the demo
              takes the secondary slot and "see how it works" drops to the line
              below — someone who wants to be shown the product can now be shown
              it rather than read about it.

              It falls back rather than disappearing. Gating the button itself on
              the slug would leave a single-pill hero in every environment
              without the env var set — local dev, any preview deploy, and
              production too if the var is ever dropped or the demo unpublished.
              The row is two pills either way.
            */}
            <Button
              asChild
              size="lg"
              shape="pill"
              variant="on-brand-outline"
              className="h-12 px-7"
            >
              <Link href={DEMO_SLUG ? `/f/${DEMO_SLUG}` : "#how-it-works"}>
                {DEMO_SLUG ? "Try a demo form" : "See how it works"}
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
            {/*
              The demo is a pill above now, so the link that used to live here
              is gone: the same destination twice inside two hundred pixels is
              not emphasis. What takes its place is the anchor the pill
              displaced, which belongs in the quieter position anyway — reading
              about the product is what you do when you have decided not to try
              it. Only shown when the pill is the demo, or it would be a
              duplicate of the button directly above it.
            */}
            {DEMO_SLUG && (
              <>
                {" · "}
                <Link
                  href="#how-it-works"
                  className="underline underline-offset-4 hover:opacity-70"
                >
                  See how it works
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
