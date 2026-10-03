import { LogoMark } from "@/components/brand/logo";
import { InkCta } from "./kit";

/**
 * The close: a full-bleed orange band, the last thing on the page and the
 * loudest, after Youform's yellow one. One heading, one dark button, one line
 * of reassurance, and the mark saying something from the side.
 *
 * Ink is `--on-primary`, which clears AA on the orange in both themes; white
 * would not.
 */
export function CtaBand() {
  return (
    <section className="bg-primary relative overflow-hidden px-6 py-20 sm:py-24" style={{ color: "var(--on-primary)" }}>
      <div className="relative mx-auto grid max-w-6xl items-center gap-10 lg:grid-cols-[auto_1fr]">
        <div aria-hidden className="relative hidden w-56 lg:block">
          <span className="font-hand bg-card text-foreground absolute -top-4 left-6 rounded-[16px_16px_16px_3px] px-4 py-2 text-2xl whitespace-nowrap shadow-md">
            Go on. Ask away.
          </span>
          <LogoMark className="mt-16 size-40 -rotate-6 drop-shadow-lg" />
        </div>

        <div className="text-center lg:text-left">
          <p className="text-xs font-bold tracking-[0.09em] uppercase opacity-75">There is a good answer on the other side</p>
          <h2 className="font-display mt-4 text-[clamp(2.5rem,1.4rem+3.6vw,4.25rem)] leading-[1.02] font-bold tracking-[-0.045em] text-balance">
            You bring the question.
            <span className="font-hand block text-[1.1em] font-normal tracking-normal">We&apos;ll get it answered.</span>
          </h2>
          <div className="mt-9 flex flex-col items-center gap-4 lg:flex-row">
            <InkCta href="/signin?mode=signup" className="px-8">
              Start for free
            </InkCta>
            <p className="text-sm font-medium opacity-80">Free forever. No credit card. Unlimited submissions.</p>
          </div>
        </div>
      </div>
    </section>
  );
}
