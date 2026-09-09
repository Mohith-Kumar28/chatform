"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { setLeaveGuard } from "@/lib/leave-guard";

/**
 * Marker written into `history.state` on the entries this guard pushes.
 *
 * The back button is the one exit with no "are you sure" of its own, and no way
 * to cancel it once it has fired. The standard answer is a sentinel: while there
 * are unpublished changes, keep one duplicate of the current entry on top of the
 * stack, so the first Back press lands on its twin — same URL, so the router
 * renders nothing new — and that landing is what we turn into the dialog.
 */
const SENTINEL = "__chatformUnpublishedGuard";

interface Pending {
  /** Runs the navigation the user was attempting. */
  proceed: () => void;
}

/**
 * Stop people from walking away from a live form that is still showing the old
 * version.
 *
 * Autosave means nothing is ever lost, which is exactly what makes this easy to
 * get wrong: the builder says "Saved", the work *is* saved, and the form the
 * world can see is still the one from before lunch. The gap between those two
 * facts is invisible the moment you close the tab, so this is the last place it
 * can be pointed out.
 *
 * Only armed for forms that are actually published. A draft that has never been
 * anywhere has no stale audience, and prompting on the way out of every new form
 * would train people to dismiss the dialog before reading it — which would cost
 * us the one case it exists for.
 */
export function useUnpublishedGuard({
  formId,
  active,
  onIntercept,
}: {
  formId: string;
  /** There are saved-but-unpublished changes on a live form. */
  active: boolean;
  /** Called when a leave is intercepted — used to flush any pending autosave. */
  onIntercept?: () => void;
}) {
  const router = useRouter();
  const [pending, setPending] = useState<Pending | null>(null);

  /**
   * The latest `onIntercept`, readable from a listener without making every
   * listener re-register when the shell re-renders. Written in an effect rather
   * than during render, which is the rule React actually enforces.
   */
  const onInterceptRef = useRef(onIntercept);
  useEffect(() => {
    onInterceptRef.current = onIntercept;
  }, [onIntercept]);
  /** True for exactly one popstate: the one we caused ourselves. */
  const bypass = useRef(false);
  const armed = useRef(false);
  /**
   * A leave is in flight, so leave the history stack alone.
   *
   * Publishing from the dialog turns the guard off, and the disarm below wants
   * to spend a `history.back()` stepping off the sentinel — at the same moment
   * the navigation the user actually asked for is being issued. Two history
   * moves racing each other lands them somewhere neither of them meant.
   */
  const leaving = useRef(false);

  const intercept = useCallback((next: Pending) => {
    // The dialog promises the work is safe, so make that true before showing it.
    onInterceptRef.current?.();
    setPending(next);
  }, []);

  const isInsideBuilder = useCallback(
    (pathname: string) => pathname === `/forms/${formId}` || pathname.startsWith(`/forms/${formId}/`),
    [formId],
  );

  /** Put a duplicate of wherever we are on top of the history stack. */
  const arm = useCallback(() => {
    const state = { ...(window.history.state ?? {}), [SENTINEL]: true };
    window.history.pushState(state, "", window.location.href);
  }, []);

  /*
    Closing the tab is deliberately NOT guarded here.

    `beforeunload` is the one exit that can only speak in the browser's own
    words: every engine has ignored the page's custom message since 2016 and
    shows "Changes that you made may not be saved" instead. On a form whose
    edits are already saved that sentence is simply false, and it lands directly
    under a header that says "Saved" — the reader has to decide which of the two
    is lying to them, and the guard exists to remove exactly that kind of doubt.

    A warning nobody can trust is worse than the silence it replaces, so this
    guard stays quiet on unload. `useAutosave` still installs its own
    `beforeunload` for the case where the browser's wording happens to be true:
    a save that has not landed yet.
  */

  // ── links ──
  useEffect(() => {
    if (!active) return;
    function onClick(e: MouseEvent) {
      if (e.defaultPrevented || e.button !== 0) return;
      // A modified click opens a new tab; this one stays put, so let it go.
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const anchor = (e.target as Element | null)?.closest?.("a");
      if (!(anchor instanceof HTMLAnchorElement)) return;
      if (anchor.hasAttribute("download")) return;
      if (anchor.target && anchor.target !== "_self") return;
      let url: URL;
      try {
        url = new URL(anchor.href, window.location.href);
      } catch {
        return;
      }
      if (url.origin !== window.location.origin) return;
      // Moving between the builder's own tabs is not leaving.
      if (isInsideBuilder(url.pathname)) return;

      // Capture phase, and stopped here: React's delegated handler — and so
      // Next's `Link` — never sees the click, which is what makes this a guard
      // rather than a race with the navigation it is trying to prevent.
      e.preventDefault();
      e.stopPropagation();
      const href = `${url.pathname}${url.search}${url.hash}`;
      intercept({ proceed: () => router.push(href) });
    }
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [active, isInsideBuilder, intercept, router]);

  // ── programmatic navigation (the command palette) ──
  useEffect(() => {
    if (!active) return;
    setLeaveGuard((href, proceed) => {
      let pathname = href;
      try {
        pathname = new URL(href, window.location.href).pathname;
      } catch {
        /* relative href already is the pathname */
      }
      if (isInsideBuilder(pathname)) return false;
      intercept({ proceed });
      return true;
    });
    return () => setLeaveGuard(null);
  }, [active, isInsideBuilder, intercept]);

  // ── the back button ──
  useEffect(() => {
    if (!active) {
      // Deactivated — usually because they published. Step off the sentinel so
      // the next Back press goes where it looks like it goes, instead of being
      // silently spent on a duplicate entry.
      if (armed.current && !leaving.current && window.history.state?.[SENTINEL]) {
        armed.current = false;
        bypass.current = true;
        window.history.back();
      }
      armed.current = false;
      return;
    }

    if (!armed.current) {
      armed.current = true;
      arm();
    }
    // Where we are *now*. A popstate that changes this moved somewhere real;
    // one that leaves it alone fell through the sentinel onto its twin, and the
    // step after that is out of the builder.
    let here = window.location.pathname;

    function onPopState() {
      if (bypass.current) {
        bypass.current = false;
        here = window.location.pathname;
        return;
      }
      if (window.location.pathname !== here) {
        // A real move — between builder tabs, or out of the builder entirely,
        // in which case this component is unmounting and has nothing to say.
        here = window.location.pathname;
        return;
      }
      // Landed on the sentinel itself: a backwards move that still has the
      // twin beneath it to spend. Nothing to ask yet.
      if (window.history.state?.[SENTINEL]) return;

      arm();
      intercept({
        proceed: () => {
          bypass.current = true;
          // Two entries: the sentinel just re-armed, and the twin the user's
          // Back press landed on. Together they are the one press they made.
          window.history.go(-2);
        },
      });
    }

    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [active, arm, intercept]);

  return {
    pending,
    /** Cancel the navigation and stay in the builder. */
    stay: useCallback(() => setPending(null), []),
    /** Go, without publishing. */
    leave: useCallback(() => {
      const next = pending;
      leaving.current = true;
      setPending(null);
      // The guard is still active, so a link click would be caught again — but
      // `proceed` navigates through the router, which this never sees.
      next?.proceed();
    }, [pending]),
    /** Go, once `publish` has resolved. Stays put if it throws. */
    publishAndLeave: useCallback(
      async (publish: () => Promise<void>) => {
        const next = pending;
        // Set before the await: publishing clears `editedSincePublish`, which
        // disarms the guard mid-flight, and the disarm must not touch history
        // while a navigation is on its way.
        leaving.current = true;
        try {
          await publish();
        } catch (err) {
          leaving.current = false;
          throw err;
        }
        setPending(null);
        next?.proceed();
      },
      [pending],
    ),
  };
}
