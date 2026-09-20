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

    // `requestIdleCallback` is missing in Safari before 17. The timeout is the
    // ceiling either way, so the fallback is that ceiling on its own. The
    // capability is read through `typeof` rather than truthiness because the
    // DOM lib types it as always present.
    const idle = typeof window.requestIdleCallback === "function";
    const handle: number = idle
      ? window.requestIdleCallback(fire, { timeout: 3500 })
      : window.setTimeout(fire, 3500);

    function cleanup() {
      for (const e of EVENTS) removeEventListener(e, fire, { capture: true });
      if (idle) window.cancelIdleCallback(handle);
      else clearTimeout(handle);
    }

    return cleanup;
  }, []);

  return ready;
}
