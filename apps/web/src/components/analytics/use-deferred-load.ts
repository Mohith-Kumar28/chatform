"use client";

import { useEffect, useState } from "react";

/**
 * "Not during the measured window, but not never either."
 *
 * Clarity and GTM both reasoned their way from `<head>` to `afterInteractive`
 * and stopped one step short. `afterInteractive` fires when hydration
 * finishes — which on the landing page is the *start* of the interval LCP and
 * INP are measured over, not the end of it. GTM is worse than a plain script:
 * it is a bootstrapper, and every tag configured inside it is a second wave
 * arriving behind it, so the window it occupies is as long as whoever last
 * edited the container made it.
 *
 * Both components' docstrings reject `lazyOnload`, and they are right to — the
 * window `load` event on the landing page is after the hero demo has finished
 * animating, and a container that starts after the first scroll has missed the
 * pageview it was installed to record. This resolves that by not waiting for
 * `load` at all. It waits for the first idle period with a 3.5s ceiling, and
 * races that against the first real interaction: somebody who scrolls or
 * clicks immediately is recorded from that moment, and somebody who reads the
 * hero for four seconds is recorded from a point where nothing was going to be
 * measured anyway.
 */
export function useDeferredLoad(): boolean {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let done = false;

    const fire = () => {
      if (done) return;
      done = true;
      cleanup();
      setReady(true);
    };

    const EVENTS = ["pointerdown", "keydown", "scroll", "touchstart"] as const;
    for (const e of EVENTS) {
      addEventListener(e, fire, { once: true, passive: true, capture: true });
    }

    /**
     * The idle clock does not start until the page has finished loading.
     *
     * A flat 3.5s ceiling was fine on a laptop and wrong on a phone. Under the
     * 4x CPU throttle Lighthouse models — and that a mid-range Android really
     * has — the page is still assembling itself at 3.5s, so the tags landed in
     * the middle of it: 713ms of blocking from the GTM container and 152ms
     * from Clarity, about a third of the page's total blocking time, spent
     * while the visitor was still waiting for the headline.
     *
     * Waiting for `load` first makes the delay proportional to how slow the
     * device actually is, instead of a guess that is generous on fast hardware
     * and destructive on slow. On a quick connection `load` is a second in and
     * nothing has changed; on a slow phone the tags wait their turn.
     *
     * The interaction listeners above still win the race, so anybody who
     * scrolls or taps is recorded from that moment regardless.
     */
    const idle = typeof window.requestIdleCallback === "function";
    let handle = 0;

    const startIdleClock = () => {
      if (done) return;
      handle = idle
        ? window.requestIdleCallback(fire, { timeout: 2000 })
        : window.setTimeout(fire, 2000);
    };

    if (document.readyState === "complete") startIdleClock();
    else addEventListener("load", startIdleClock, { once: true });

    function cleanup() {
      for (const e of EVENTS) removeEventListener(e, fire, { capture: true });
      removeEventListener("load", startIdleClock);
      if (!handle) return;
      if (idle) window.cancelIdleCallback(handle);
      else clearTimeout(handle);
    }

    return cleanup;
  }, []);

  return ready;
}
