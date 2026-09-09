import Link from "next/link";
import { Button } from "@/components/ui/button";
import { LogoMark } from "@/components/brand/logo";
import { InView } from "./in-view";
import { UnderlineMark } from "./annotate";

/**
 * The close: full-strength brand, edge to edge, one line of type.
 *
 * The old version was a rounded card of `--primary-soft` floating in white
 * space with a heading, a two-sentence paragraph and two buttons — a polite
 * suggestion at the end of a scroll. This is the loudest thing on the page and
 * the last thing you see, which is the correct order.
 *
 * The paragraph is gone. Everything it said (unlimited responses, 200 free
 * conversations, no card) is already in the hero's fine print and on the plan
 * cards immediately above. Repeating it a third time at maximum volume is not
 * emphasis.
 *
 * The ground is `--brand-gradient` — orange at the left, violet at the right,
 * on the mark's diagonal. It was flat orange, and the note here used to say a
 * violet plate on orange is a clash. That is still true of a *plate*: a hard
 * edge between the two at full strength is two posters fighting. A sweep is
 * not a plate. There is no edge to clash on, and it is the only place in the
 * product where both hues run at full strength across the same surface, which
 * is what earns it the last band on the page.
 *
 * Type is `--on-primary`, not `--primary-foreground` — see the token's note.
 * The gradient is exactly why the violet was nudged a step lighter: this one
 * ink has to hold from end to end, and it does, at 5.8:1 over the orange and
 * 4.7:1 over the violet. White would be 2.7:1 and 3.5:1 — unreadable at both.
 */
export function CtaBand() {
  return (
    <section
      className="bg-brand-gradient relative overflow-hidden px-6 py-24 sm:py-28"
      style={{ color: "var(--on-primary)" }}
    >
      {/* The mark, oversized and bled off the right edge — the same shape the
          hero's wash is split on, closing the page where it opened. Ink at low
          opacity rather than a second hue: the ground is already carrying both
          of them, and this is a texture, not a logo placement. */}
      <LogoMark
        variant="mono"
        className="pointer-events-none absolute -right-16 -bottom-24 size-96 opacity-[0.07] sm:-right-8 sm:size-[28rem]"
      />

      <div className="relative mx-auto max-w-4xl">
        {/* The bookend. The hero rings "four." — the number people are lost
            at — and the close scores the word they are kept to. A ring at both
            ends would read as a device; a different pen at the second one
            reads as the same hand. */}
        <h2 className="text-display-2xl max-w-[20ch] font-bold tracking-[-0.045em] text-balance">
          Ask like a person. Watch them{" "}
          <InView as="span" className="inline">
            <span className="relative inline-block">
              finish.
              <UnderlineMark draw delay={260} className="opacity-80" />
            </span>
          </InView>
        </h2>

        {/* These two were hand-rolled here first. They are now `on-brand` and
            `on-brand-outline` on `Button`, because the hero needed the same
            pair on the same kind of ground and a second hand-rolled copy is
            where a pattern starts drifting. */}
        <div className="mt-9 flex flex-wrap items-center gap-3">
          <Button asChild size="lg" shape="pill" variant="on-brand" className="h-12 px-8">
            <Link href="/signin">Start free</Link>
          </Button>
          <Button asChild size="lg" shape="pill" variant="on-brand-outline" className="h-12 px-8">
            <Link href="/pricing">See pricing</Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
