"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { cn } from "@/lib/utils";

/**
 * Plays a graphic's entrance once, the first time it is scrolled to.
 *
 * `motion-config.tsx` records why the old `Reveal` was deleted: eleven
 * identical fades down one page, each of which made *whether the content was
 * visible at all* depend on an IntersectionObserver delivering. Both
 * objections are answered here rather than ignored.
 *
 * The second one first, because it is the load-bearing part. Nothing is hidden
 * in the server HTML. This wrapper renders its children exactly as they are,
 * and only once the effect has run — in the browser, with IO present and
 * reduced motion off — does it write `data-armed`, which is the attribute the
 * hiding rule in `globals.css` keys off. So a visitor whose JS never runs, or
 * whose browser has no IO, or who asked for less motion, gets the finished
 * drawing and no animation at all. There is no state in which content is
 * missing.
 *
 * `useLayoutEffect` rather than `useEffect` because arming after paint means
 * one frame of the finished graphic before it hides itself to animate in,
 * which reads as a flicker on anything already in the viewport at load.
 *
 * The first objection — sameness — is not this component's job. It only says
 * *when*; each graphic says *what* with its own `cf-a-*` class, and no two
 * tiles on the page use the same one.
 */

const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

export function InView({
  children,
  className,
  as: Tag = "div",
}: {
  children: React.ReactNode;
  className?: string;
  as?: "div" | "li" | "span";
}) {
  const ref = useRef<HTMLElement>(null);

  useIsomorphicLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

    let io: IntersectionObserver | undefined;

    const arm = () => {
      el.dataset.armed = "";
      io = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (!entry.isIntersecting) continue;
            el.dataset.inview = "";
            io?.disconnect();
          }
        },
        /* An edge trigger, not a ratio one.
           `threshold: 0.3` reads better on a small graphic and stalls forever
           on a tall one: an element taller than the viewport can never put 30%
           of itself on screen, so the widest tile on the page — whose preview
           is most of a screenful on a laptop — would sit at its opening frame
           and never play. Shrinking the root by 12% instead means "once the
           top edge is properly up from the fold", which is the same moment for
           a small graphic and a reachable one for any size. */
        { threshold: 0, rootMargin: "0px 0px -12% 0px" },
      );
      io.observe(el);
    };

    /* Nothing arms in a tab nobody is looking at.
     *
     * A hidden document does not run IntersectionObserver callbacks at all —
     * not even the initial one — so arming there would hide every graphic
     * behind an observer that cannot fire. This is the exact failure
     * `flow-preview.tsx` documents: open in a background tab, come back, and
     * the diagram has no arrows. Waiting for the first `visible` means the
     * page in a background tab is simply the finished, static page, and the
     * animation arms the moment somebody actually switches to it.
     */
    if (document.visibilityState === "visible") {
      arm();
      return () => io?.disconnect();
    }

    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      document.removeEventListener("visibilitychange", onVisible);
      arm();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      io?.disconnect();
    };
  }, []);

  return (
    <Tag ref={ref as never} className={cn(className)}>
      {children}
    </Tag>
  );
}
