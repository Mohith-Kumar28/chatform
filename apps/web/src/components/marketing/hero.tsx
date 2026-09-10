import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ChatDemo } from "./chat-demo";
import { HERO_SCRIPT } from "./chat-demo-scripts";
import { GradientField } from "@/components/brand/gradient-field";
import { ArrowMark, CircleMark, HandNote } from "./annotate";

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
      {/* The mask is a smoothstep, not a ramp, and that is the whole point of
          the stop list.

          It was `black 78% → transparent 100%`: a straight line in alpha, which
          ends by walking into zero at a constant rate and then stopping dead.
          The value is continuous there and the SLOPE is not, and a slope
          discontinuity across a full-bleed edge is exactly the thing the eye
          is built to find — it showed up as a hairline ruled across the page
          at the section boundary, most visible on the violet end where the
          wash is furthest from the charcoal underneath it.

          These nine stops sample `1 - (3t² - 2t³)` over the last third. The
          curve leaves full opacity gently and arrives at zero asymptotically,
          so there is no rate for the eye to catch at either end. The plateau
          also runs to 66% now rather than 78% — the fade is longer AND it
          starts lower, because the visible fade has to finish before the
          section does, not at it.

          Two-thirds of the field is still flat colour, which is what keeps the
          headline, the buttons and the caption line on full-strength ground. */}
      <GradientField
        tier="vivid"
        className="-top-32 [mask-image:linear-gradient(to_bottom,#000_0%,#000_66%,#000000ee_71%,#000000c2_76%,#00000093_81%,#0000006c_85%,#0000003e_89%,#0000001a_93%,#00000007_97%,transparent_100%)]"
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

              It quotes a rate now. "more" was doing the work of a number and
              a qualitative word cannot: a visitor who has read three of these
              pages this morning has been told "more" by all of them. The
              figure is the owner's to stand behind — it is not computed from
              anything in this codebase, and nothing here should imply it is —
              so if it ever needs a citation on the page, it belongs under the
              caption line below, beside the free-forever facts, and not as a
              footnote hanging off the headline.

              The figure is ringed by hand rather than coloured, because the
              ground here is the brand's two hues at full strength — the one
              place on the site where coloured type is guaranteed to
              disappear. */}
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
              AI forms that get{" "}
              {/* The ring moved from "more" to the number.

                  "more" is the qualitative word in the sentence and it was the
                  one being circled, which is the opposite of what a pen does:
                  you ring the thing that is hard to believe. With a figure in
                  the line, the figure is that thing. */}
              <span className="relative me-3 inline-block">
                2.3&#215;
                {/* Drawn on, and last. The words rise first; the ring starts once
                    they have landed, which is the order it would happen if
                    somebody were actually marking up the page. It needs no
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
              {/* `me-3` above because the ring is drawn `-inset-x-4` — a whole
                  rem wider than the word on each side, which is what makes it
                  read as a pen going round something rather than as a border.
                  Mid-sentence that overhang lands on the next word, so the
                  number keeps its normal space and the mark gets its own. */}
              more submissions.
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

          {/*
            Signing up is the primary action; trying it is the strong second.

            Both matter, and the order between them is a judgement about who is
            reading. Someone ready to build wants the sign-up, and burying it
            behind a demo costs the visit. Someone not ready yet wants to see
            the thing work — so the second button is not a "secondary" in the
            faint sense at all. Both are opaque and both are loud; what tells
            them apart is which end of the range they take, ink against white.

            Not three pills, and no fourth link either. "See how it works" is
            reached from the nav and from the band it names; it is not worth an
            underline in the caption under two pills this deliberate.

            The demo button falls back to that anchor when no demo is
            configured, rather than disappearing: gating the button on the slug
            would leave a one-pill hero in every environment without the env var
            set — local dev, previews, and production if the demo is ever
            unpublished.
          */}
          <div className="mt-8 flex flex-wrap items-center gap-3">
            {/* Both pills are opaque, and they are told apart by which end of
                the range they sit at rather than by one of them being faint.

                The ink one first: `--on-band-vivid` is the same near-black the
                type on this wash is set in, so the primary is the darkest mark
                in the section and reads as primary from across the room. It is
                stated here rather than left to `on-brand`, whose `bg-background`
                is charcoal in the dark theme — right, by accident — and warm
                cream in the light one, where it would land a shade off the
                white pill beside it and the pair would read as one button cut
                in half. One value, both themes, because the ink and the wash
                under it are both theme-stable already. */}
            <Button
              asChild
              size="lg"
              shape="pill"
              variant="on-brand"
              className="h-12 bg-[var(--on-band-vivid)] px-8 text-white hover:bg-[color-mix(in_oklch,var(--on-band-vivid)_86%,white)]"
            >
              <Link href="/signin">Start free</Link>
            </Button>
            {/* And the white one, which was `on-brand-outline` — a fifth of the
                band's own ink over the band, so it took the wash's colour and
                sat about as far from it as a disabled control does. On a ground
                this saturated a translucent fill is not a quieter button, it is
                a smudge, and this is the pill for the visitor who is not ready
                to sign up yet — the larger half of the traffic.

                White, because white is the one fill that is not on the wash's
                own scale: every hue this field drifts through is a mid-tone, so
                a paper-white rectangle is the brightest thing available and it
                cannot be mistaken for part of the ground. With the ink pill
                beside it the pair now brackets the wash from both ends.

                `on-brand-outline` is left as it is: the closing CTA still uses
                it over the full-strength gradient, where the ink is
                `--on-primary` and the calculus is different. */}
            {/*
              The white pill and the hand pointing at it, as one unit.

              `annotate.tsx` asks for one pen mark per section and this section
              already spends its allowance on the ring. This is the exception
              worth making, and only because the two marks are doing different
              jobs at different moments: the ring lands on the claim while you
              are still reading the headline, and this lands on the button once
              you have decided the claim needs testing. They never share the
              eye. Two is the ceiling; a third would make the page a design
              system made of pens.

              The note sits *after* the pill in the DOM and is pulled back over
              it, so a screen reader reaches the button first and the aside
              second — which is the order they matter in. `aria-hidden`, because
              "it's our own demo form" is a thing you see, not a thing you
              need read out before a link.
            */}
            <div className="relative">
              <Button
                asChild
                size="lg"
                shape="pill"
                variant="on-brand"
                className="h-12 bg-white px-7 text-[var(--on-band-vivid)] hover:bg-white/90"
              >
                <Link href={DEMO_SLUG ? `/f/${DEMO_SLUG}` : "#how-it-works"}>
                  {DEMO_SLUG ? "Try it yourself" : "See how it works"}
                  <ArrowRight className="size-4" strokeWidth={2.25} />
                </Link>
              </Button>

              {/* Below the pill and tilted off it, on the two breakpoints that
                  have the room. On a phone the buttons wrap and there is no
                  margin left to write in, so the note simply is not there —
                  a margin note squeezed into the column is not a margin note. */}
              <span
                aria-hidden
                className="pointer-events-none absolute top-full left-2 hidden select-none sm:block"
                style={{ color: "var(--on-band-vivid)" }}
              >
                {/* Armed here rather than by an `InView`: the hero is the top
                    of the document and is on screen at load, so waiting for an
                    intersection would only mean the mark is already finished
                    by the time anyone could have watched it draw. */}
                <span data-armed="" data-inview="" className="relative block">
                  <ArrowMark
                    dir="up-left"
                    positioned={false}
                    draw
                    delay={1500}
                    className="ms-6 size-12 opacity-70"
                  />
                  <HandNote
                    tilt={-6}
                    className="absolute top-7 left-14 whitespace-nowrap opacity-85"
                  >
                    it&rsquo;s a real form &mdash; try it
                  </HandNote>
                </span>
              </span>
            </div>
          </div>

          {/* "200 AI conversations a month" is a metering detail nobody has
              the context to value before they have used the product once. The
              two facts that actually decide whether somebody signs up are that
              it costs nothing and that the thing they collect is not capped. */}
          <p style={{ color: "var(--on-band-vivid-muted)" }} className="text-caption mt-6">
            {/* Three facts and no fourth link. "See how it works" used to hang
                off the end of this line, underlined, and an underline inside a
                caption is a fourth thing competing with two pills that had just
                been made loud on purpose — it pulled the eye down and past
                them. The anchor still exists; the nav and the section below
                both reach it. */}
            Free forever · Unlimited forms and responses · No card
          </p>
        </div>

        <ChatDemo script={HERO_SCRIPT} variant="hero" />
      </div>
    </section>
  );
}
