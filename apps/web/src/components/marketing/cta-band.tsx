import Link from "next/link";
import { LogoMark } from "@/components/brand/logo";

/**
 * The close: full-strength orange, edge to edge, one line of type.
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
 * Type is `--on-primary`, not `--primary-foreground` — see the token's note.
 * White on this orange is 2.7:1.
 */
export function CtaBand() {
  return (
    <section
      className="relative overflow-hidden px-6 py-24 sm:py-28"
      style={{ background: "var(--primary)", color: "var(--on-primary)" }}
    >
      {/* The mark, oversized and bled off the right edge — the same shape the
          hero's wash is split on, closing the page where it opened. Ink at low
          opacity rather than a second hue: a violet plate on orange is a clash,
          and this is a texture, not a logo placement. */}
      <LogoMark
        variant="mono"
        className="pointer-events-none absolute -right-16 -bottom-24 size-96 opacity-[0.07] sm:-right-8 sm:size-[28rem]"
      />

      <div className="relative mx-auto max-w-4xl">
        <h2 className="text-display-2xl max-w-[20ch] font-bold tracking-[-0.045em] text-balance">
          Ask better questions. Get better answers.
        </h2>

        <div className="mt-9 flex flex-wrap items-center gap-3">
          <Link
            href="/signin"
            className="bg-background text-foreground hover:bg-card focus-visible:ring-offset-primary inline-flex h-12 items-center rounded-full px-8 font-medium transition-colors duration-[var(--duration-micro)] focus-visible:ring-2 focus-visible:ring-current focus-visible:ring-offset-2"
          >
            Start free
          </Link>
          <Link
            href="/pricing"
            className="inline-flex h-12 items-center rounded-full border-2 border-current px-8 font-medium transition-opacity duration-[var(--duration-micro)] hover:opacity-70"
          >
            See pricing
          </Link>
        </div>
      </div>
    </section>
  );
}
