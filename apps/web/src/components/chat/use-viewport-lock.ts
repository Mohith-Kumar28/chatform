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
    /*
      The tallest this viewport has been, which is the same thing as "no
      keyboard". There is no event for the keyboard and no property that
      reports it; what there is, is a rectangle that suddenly loses a third of
      itself. Comparing against the peak rather than against `innerHeight`
      covers both behaviours — iOS shrinks only the visual viewport, Android
      may shrink the layout one with it — because in either case the number we
      already measure is what drops.
    */
    let peak = 0;
    // Only where a keyboard can cover the screen. A desktop window being
    // dragged smaller is the same measurement and must not read as one.
    const coarse = window.matchMedia("(pointer: coarse)").matches;
    const apply = () => {
      frame = 0;
      const height = Math.round(vv.height);
      root.style.setProperty("--cf-vh", `${height}px`);
      // iOS keeps the layout viewport still and slides the visible rectangle
      // around inside it, and a fixed element is placed against the former.
      // Without this the shell is the right height in the wrong place.
      root.style.setProperty("--cf-vv-top", `${Math.round(vv.offsetTop)}px`);
      if (height > peak) peak = height;
      // Comfortably more than a collapsing address bar (~60-100px) and
      // comfortably less than any on-screen keyboard.
      root.classList.toggle("cf-keyboard-open", coarse && peak - height > 140);
      notify.current?.();
    };
    // Coalesced: the keyboard animating produces a burst of these, and writing
    // a custom property on the root invalidates style for the whole document.
    const schedule = () => {
      if (frame) return;
      frame = requestAnimationFrame(apply);
    };
    /** A rotation is a new screen; the old peak belongs to the old one. */
    const rebase = () => {
      peak = 0;
      schedule();
    };

    apply();
    vv.addEventListener("resize", schedule);
    vv.addEventListener("scroll", schedule);
    /*
     * The same measurement, from the events that are hardest to miss.
     *
     * `--cf-vh` is a number written once and then trusted until something says
     * otherwise, and the failure mode if that "otherwise" never arrives is not
     * subtle: a value captured mid-rotation or mid-restore leaves a shell
     * hundreds of pixels short of the screen, with the conversation stopping in
     * a band and dead space under it, and nothing to correct it. A missed
     * `visualViewport` event is silent, so it cannot be the only witness.
     *
     * `pageshow` is the one that matters most: coming back through the
     * bfcache restores the DOM — this custom property included — from a
     * snapshot taken on a screen that may have been a different size or
     * orientation, and it fires no resize of any kind.
     *
     * All three are the same coalesced `apply`, so a browser firing every one
     * of them costs a single frame.
     */
    window.addEventListener("resize", schedule);
    window.addEventListener("orientationchange", rebase);
    window.addEventListener("pageshow", schedule);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      vv.removeEventListener("resize", schedule);
      vv.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("orientationchange", rebase);
      window.removeEventListener("pageshow", schedule);
      root.classList.remove("cf-viewport-locked");
      root.classList.remove("cf-keyboard-open");
      root.style.removeProperty("--cf-vh");
      root.style.removeProperty("--cf-vv-top");
    };
  }, [active]);
}
