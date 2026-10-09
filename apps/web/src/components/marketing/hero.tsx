import { Play } from "lucide-react";
import { ChatDemo } from "./chat-demo";
import { HERO_SCRIPT } from "./chat-demo-scripts";
import { GradientField } from "@/components/brand/gradient-field";
import { CircleMark, HandNote } from "./annotate";
import { WatchVideoButton } from "./launch-video";
import { HeroDemo } from "./hero-demo";
import { Eyebrow } from "./band";
import { PrimaryCta, SECONDARY_CTA } from "./kit";
import { Doodle } from "./doodles";
import { Check } from "lucide-react";

/**
 * The published demo form, or nothing.
 *
 * Inlined at build time, like every `NEXT_PUBLIC_*`: changing it needs
 * `pnpm deploy:web`, and under `next dev` it only renders when `.env.local`
 * sets it. The form is authored in `tooling/demo-form/`.
 */
const DEMO_SLUG = process.env.NEXT_PUBLIC_DEMO_FORM_SLUG;

/**
 * The hero, centred, after Youform's: a label, the headline, one sentence, two
 * buttons and three reassurances, then the real demo form in a browser window
 * underneath, so the first scroll lands on the product working.
 *
 * The headline is still ours, and still plain: the category's own name and
 * the outcome a person running a form counts. "AI-powered" sits in the lede
 * and the metadata, not the headline (see page.tsx for that history).
 *
 * The brand wash stays behind the top half, fading out above the demo window,
 * so the window sits on paper rather than on colour.
 */
export function Hero() {
  return (
    <section className="relative px-6 pt-14 pb-16 sm:pt-20 sm:pb-24">
      {/* `defer`: it sits behind the LCP headline, so it holds its opening
          frame until the page settles. The mask is a smoothstep so the fade
          leaves no visible edge. */}
      <GradientField
        tier="vivid"
        defer
        className="-top-32 h-[46rem] sm:h-[44rem] [mask-image:linear-gradient(to_bottom,#000_0%,#000_55%,#000000c2_68%,#0000006c_80%,#0000001a_92%,transparent_100%)]"
      />

      <div className="relative mx-auto max-w-6xl">
        <Doodle name="bubble" tilt={-8} className="top-10 left-2 lg:left-10" tone="violet" />
        <Doodle name="sparkle" tilt={10} className="top-64 left-16 size-10" />
        <Doodle name="check" tilt={8} className="top-16 right-4 lg:right-14" />

        <div style={{ color: "var(--on-band-vivid)" }} className="mx-auto flex max-w-4xl flex-col items-center text-center">
          <Eyebrow className="text-(--on-band-vivid) flex items-center gap-2">
            <span className="bg-(--on-band-vivid) size-1.5 rounded-full" />
            A free online form builder
          </Eyebrow>

          <h1 className="font-display mt-6 text-[clamp(2.6rem,1rem+5vw,5rem)] leading-[1.02] font-bold tracking-[-0.045em] text-balance">
            <span className="word-rise inline-block" style={{ animationDelay: "60ms" }}>
              Conversational forms people{" "}
              {/* "actually finish" held on one line: the ring is drawn wider
                  than the word, and a break beside it would hang the mark
                  outside the heading. */}
              <span className="whitespace-nowrap">
                actually{" "}
                <span className="relative mr-3 ml-2 inline-block">
                  finish
                  <span data-armed="" data-inview="" className="contents">
                    <CircleMark draw delay={900} className="text-[var(--on-band-vivid)] opacity-80" />
                  </span>
                </span>
                .
              </span>
            </span>
          </h1>

          <p style={{ color: "var(--on-band-vivid-muted)" }} className="mt-7 max-w-xl text-[1.125rem] leading-relaxed text-balance">
            Describe your form and AI builds it. Then it runs as a conversation that asks again when an answer is thin,
            and follows up with the people who leave.
          </p>

          <div className="mt-9 flex w-full flex-wrap items-center justify-center gap-3">
            <PrimaryCta className="bg-(--on-band-vivid) px-8 text-white hover:bg-[color-mix(in_oklch,var(--on-band-vivid)_86%,white)] max-sm:w-full">
              Create free account
            </PrimaryCta>
            <WatchVideoButton className={`${SECONDARY_CTA} bg-white text-(--on-band-vivid) hover:bg-white/90 max-sm:w-full`}>
              <Play className="size-4 fill-current" strokeWidth={2.25} />
              Watch the tour
            </WatchVideoButton>
          </div>

          <ul style={{ color: "var(--on-band-vivid-muted)" }} className="mt-7 flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm font-medium">
            {["Free forever", "Unlimited submissions", "No credit card required"].map((t) => (
              <li key={t} className="flex items-center gap-1.5">
                <Check className="size-4" strokeWidth={2.5} />
                {t}
              </li>
            ))}
          </ul>
        </div>

        <div id="try-it" className="relative mx-auto mt-14 max-w-5xl scroll-mt-24">
          <p className="mb-4 text-center">
            <HandNote tilt={-2} className="text-foreground/80">
              A real chatform. Go on, answer it.
            </HandNote>
          </p>
          {DEMO_SLUG ? <HeroDemo slug={DEMO_SLUG} /> : <ChatDemo script={HERO_SCRIPT} variant="hero" />}
        </div>
      </div>
    </section>
  );
}
