"use client";

import { useEffect, useRef } from "react";

/**
 * The chat owns the window it is standing in.
 *
 * Two problems, one cause. A phone browser's chrome is not part of the page:
 * the address bar collapses as you scroll and the visible area grows, and the
 * on-screen keyboard covers the bottom of it without the page being told at
 * all. Every CSS answer to "how tall is the screen" is a different guess at
 * that moving target — `100vh` is the largest it ever gets, `svh` the smallest,
 * `dvh` tracks the toolbar but is blind to the keyboard — so a shell sized in
 * any of them is wrong for some of the time.
 *
 * What is *not* a guess is `visualViewport`: it is the rectangle the respondent
 * can actually see, keyboard and toolbar included, and it says when it moves.
 * `--cf-vh` is that number, and `.cf-chat-viewport` is a shell exactly that
 * tall — so the composer sits on top of the keyboard rather than behind it.
 *
 * The lock is the other half. With the document itself scrollable the first
 * swipe went into collapsing the address bar and only the second reached the
 * thread — which is the extra swipe at both ends of a conversation, and the
 * reason scrolling never seemed to arrive at the bottom. `overflow: hidden` on
 * the document leaves exactly one scrollable thing on the screen: the messages.
 *
 * `overscroll-behavior: none` goes with it, so a swipe past the end of the
 * thread cannot turn into a pull-to-refresh and throw the conversation away.
 *
 * Not used by the builder's preview, which is a panel inside a page that has
 * its own scrolling to do.
 */
export function useViewportLock(active: boolean, onViewportChange?: () => void) {
  // Held in a ref so a fresh callback cannot re-subscribe the listeners, which
  // on iOS fire continuously while the keyboard animates.
  const notify = useRef(onViewportChange);
  useEffect(() => {
    notify.current = onViewportChange;
  }, [onViewportChange]);

  useEffect(() => {
    if (!active || typeof window === "undefined") return;
    const root = document.documentElement;
    root.classList.add("cf-viewport-locked");

    const vv = window.visualViewport;
    if (!vv) return () => root.classList.remove("cf-viewport-locked");

    let frame = 0;
    const apply = () => {
      frame = 0;
      root.style.setProperty("--cf-vh", `${Math.round(vv.height)}px`);
      // iOS keeps the layout viewport still and slides the visible rectangle
      // around inside it, and a fixed element is placed against the former.
      // Without this the shell is the right height in the wrong place.
      root.style.setProperty("--cf-vv-top", `${Math.round(vv.offsetTop)}px`);
      notify.current?.();
    };
    // Coalesced: the keyboard animating produces a burst of these, and writing
    // a custom property on the root invalidates style for the whole document.
    const schedule = () => {
      if (frame) return;
      frame = requestAnimationFrame(apply);
    };

    apply();
    vv.addEventListener("resize", schedule);
    vv.addEventListener("scroll", schedule);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      vv.removeEventListener("resize", schedule);
      vv.removeEventListener("scroll", schedule);
      root.classList.remove("cf-viewport-locked");
      root.style.removeProperty("--cf-vh");
      root.style.removeProperty("--cf-vv-top");
    };
  }, [active]);
}
