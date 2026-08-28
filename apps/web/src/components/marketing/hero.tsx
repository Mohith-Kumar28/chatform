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
 * the mark, in the mark's two hues, at an opacity you notice only as warmth.
 * The logo is the page, at page scale.
 */
export function Hero() {
  return (
    <section className="relative overflow-hidden px-6 pt-14 pb-16 sm:pt-20 sm:pb-24">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -top-24 opacity-70 [mask-image:radial-gradient(ellipse_75%_65%_at_50%_10%,black,transparent)]"
        style={{
          background:
            "linear-gradient(115deg, var(--primary-soft) 0%, var(--primary-soft) 38%, var(--family-scale-band) 62%, var(--family-scale-band) 100%)",
        }}
      />
      {/* The dot grid keeps the wash from reading as a flat panel. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.045] [background-image:radial-gradient(var(--foreground)_1px,transparent_1px)] [background-size:20px_20px] [mask-image:radial-gradient(ellipse_70%_60%_at_50%_15%,black,transparent)]"
      />

      <div className="relative mx-auto grid max-w-6xl items-center gap-10 lg:grid-cols-[1.1fr_1fr] lg:gap-14">
        <div>
          <Headline
            segments={[
              { text: "The" },
              { text: "first" },
              { text: "form", br: true },
              { text: "that" },
              { text: "answers", tone: "primary" },
              { text: "back.", tone: "answer" },
            ]}
            className="max-w-[19ch]"
          />

          <p className="text-body-lg text-muted-foreground mt-6 max-w-md text-balance">
            An AI interviewer that asks your questions — and answers theirs.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Button asChild size="lg" shape="pill" className="px-7">
              <Link href="/signin">Start free</Link>
            </Button>
            <Button asChild size="lg" shape="pill" variant="ghost" className="px-5">
              <Link href="#the-moment">
                See it answer back
                <ArrowRight className="size-4" strokeWidth={2.25} />
              </Link>
            </Button>
          </div>

          <p className="text-caption text-muted-foreground mt-6">
            No card · 200 AI conversations a month, free
            {DEMO_SLUG && (
              <>
                {" · "}
                <Link
                  href={`/f/${DEMO_SLUG}`}
                  className="hover:text-foreground underline underline-offset-4"
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
