import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ChatDemo } from "./chat-demo";
import { HERO_SCRIPT } from "./chat-demo-scripts";
import { ArrowMark, CircleMark, HandNote } from "./annotate";

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
          {/* Plain words, and that is the whole brief.
              This said "An interviewer, not a form." — a line that reads well
              and communicates nothing to the one person it is for: someone one
              second into the page who does not yet know what this is. Everyone
              knows what a form is and what a chat is, so the headline is built
              from those two words and nothing else.
              "chat" is ringed by hand and annotated, which does two jobs at
              once. It puts the emphasis on the word the whole product turns
              on, and it does it without colour — the ground behind this is the
              brand's two hues at full strength, where coloured type is the one
              thing guaranteed to disappear. */}
          <h1 className="text-display-2xl font-bold tracking-[-0.045em] max-w-[13ch] text-balance">
            <span className="word-rise inline-block" style={{ animationDelay: "60ms" }}>
              Turn any form
            </span>{" "}
            <span className="word-rise inline-block" style={{ animationDelay: "150ms" }}>
              into a{" "}
              <span className="relative inline-block">
                chat.
                <CircleMark className="text-[var(--on-band-vivid)] opacity-80" />
              </span>
            </span>
          </h1>

          {/* The note goes in the margin, which is the space to the RIGHT of a
              13ch headline — not under it, where the first attempt put it and
              where it landed straight on top of the paragraph. Zero height and
              absolutely positioned, so it can never push the copy around, and
              not drawn below `lg` where there is no margin to write in. */}
          <div className="pointer-events-none relative hidden h-0 lg:block" aria-hidden>
            <div className="absolute -top-24 left-[27rem] flex items-start gap-0.5">
              <ArrowMark dir="down-left" className="mt-1 size-12 opacity-65" />
              <HandNote className="mt-8 whitespace-nowrap opacity-80" tilt={-8}>
                one question at a time
              </HandNote>
            </div>
          </div>

          <p
            style={{ color: "var(--on-band-vivid-muted)" }}
            className="text-body-lg mt-6 max-w-md text-balance"
          >
            Describe what you need and AI writes the whole thing — or paste your website and it
            reads that instead. Then it runs the conversation and gets you real answers.
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
