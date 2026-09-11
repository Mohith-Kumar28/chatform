"use client";

import { useEffect, type RefObject } from "react";

/**
 * Click the preview, find the setting.
 *
 * The centre preview looks like the thing you edit, so people click it and
 * expect to type. They can't — every setting lives in the inspector on the
 * right, often scrolled out of view. Youform's answer, copied here: a click on
 * any part of the preview scrolls the inspector to the field that controls it
 * and shakes that field until the eye goes there.
 *
 * The contract is two attributes rather than refs threaded between panels:
 * the preview marks a region with `data-inspect="<target>"`, the inspector
 * marks the field that edits it with `data-inspect-target="<target>"`. Same
 * idea as `data-shortcut-target` in `lib/shortcuts`.
 */

const REVEAL_EVENT = "builder:reveal";

/**
 * Where to look when the preview names a field this block's inspector doesn't
 * have (an email input has no placeholder setting). `answer` is the whole
 * type-specific section; `title` is always there.
 */
const FALLBACKS = ["answer", "title"];

export function revealInInspector(target: string) {
  window.dispatchEvent(new CustomEvent<string>(REVEAL_EVENT, { detail: target }));
}

/** For a collapsed section that should open when one of its fields is asked for. */
export function useRevealOpens(targets: readonly string[], open: () => void) {
  useEffect(() => {
    const onReveal = (e: Event) => {
      if (targets.includes((e as CustomEvent<string>).detail)) open();
    };
    window.addEventListener(REVEAL_EVENT, onReveal);
    return () => window.removeEventListener(REVEAL_EVENT, onReveal);
  }, [targets, open]);
}

/** Listens on the inspector panel: scroll to the named field and shake it. */
export function useInspectorReveal(root: RefObject<HTMLElement | null>) {
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;

    const onReveal = (e: Event) => {
      const target = (e as CustomEvent<string>).detail;
      // Two frames, so a section that opened in answer to this same event has
      // rendered its fields before we go looking for them.
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          const panel = root.current;
          if (!panel) return;
          const found = findTargets(panel, target);
          if (!found.length) return;

          const scrolled = scrollIntoViewIfHidden(found[0]);
          clearTimeout(timer);
          // Shaking mid-scroll is lost in the motion of the scroll itself.
          timer = setTimeout(() => found.forEach(shake), scrolled ? 320 : 0);
        }),
      );
    };

    window.addEventListener(REVEAL_EVENT, onReveal);
    return () => {
      window.removeEventListener(REVEAL_EVENT, onReveal);
      clearTimeout(timer);
    };
  }, [root]);
}

function findTargets(panel: HTMLElement, target: string): HTMLElement[] {
  for (const name of [target, ...FALLBACKS]) {
    const els = [...panel.querySelectorAll<HTMLElement>(`[data-inspect-target="${name}"]`)].filter(
      (el) => el.getClientRects().length > 0,
    );
    if (els.length) return els;
  }
  return [];
}

/** Centres the field in its scroll area, unless it's already fully in view. */
function scrollIntoViewIfHidden(el: HTMLElement): boolean {
  let scroller = el.parentElement;
  while (scroller && !/(auto|scroll)/.test(getComputedStyle(scroller).overflowY)) {
    scroller = scroller.parentElement;
  }
  if (!scroller) return false;
  const box = el.getBoundingClientRect();
  const view = scroller.getBoundingClientRect();
  if (box.top >= view.top && box.bottom <= view.bottom) return false;
  el.scrollIntoView({ block: "center", behavior: "smooth" });
  return true;
}

function shake(el: HTMLElement) {
  el.classList.remove("inspect-nudge");
  // Force a reflow so a second click restarts the animation instead of being
  // swallowed by the one still running.
  void el.offsetWidth;
  el.classList.add("inspect-nudge");
  el.addEventListener("animationend", () => el.classList.remove("inspect-nudge"), { once: true });
}
