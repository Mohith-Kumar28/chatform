import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ChatDemo } from "./chat-demo";
import { HERO_SCRIPT } from "./chat-demo-scripts";
import { Headline } from "./headline";

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
              and communicates nothing to the one person it is for: someone who
              has been on this page for one second and does not yet know what
              the product is. Nobody arrives wanting an "interviewer". They
              understand "form" and they understand "chat", so the headline is
              built out of those two words and nothing else.
              No tones on the words either: the ground behind them is now those
              two hues at full strength, and orange type on an orange wash is
              the one thing guaranteed to disappear. Emphasis is weight and
              scale, which is where it belongs at this size. */}
          <Headline
            segments={[
              { text: "Turn" },
              { text: "any" },
              { text: "form", br: true },
              { text: "into" },
              { text: "a" },
              { text: "chat." },
            ]}
            className="max-w-[13ch]"
          />

          <p
            style={{ color: "var(--on-band-vivid-muted)" }}
            className="text-body-lg mt-6 max-w-md text-balance"
          >
            AI asks one question at a time, understands what people write, and answers their
            questions too. More people finish.
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

          <p style={{ color: "var(--on-band-vivid-muted)" }} className="text-caption mt-6">
            No card · 200 AI conversations a month, free
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
