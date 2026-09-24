"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Hydrate this subtree when it gets near the viewport, not before.
 *
 * `in-view.tsx` is about *when a graphic plays*; this is about *when its code
 * arrives*. The two are separate because the right answer differs: an entrance
 * must never depend on IntersectionObserver delivering, so `InView` hides
 * nothing and its failure mode is the finished page. A chunk, on the other
 * hand, costs nothing if it is never fetched — and on a page this tall, most
 * of it never is.
 *
 * Used for the two expensive widgets below the fold: the second `ChatDemo`,
 * whose typewriter re-renders a thread every 32 ms, and the second
 * `GradientField`, which runs a pointer loop under a `blur(44px)` layer. Both
 * used to mount during hydration, several viewports above where anyone could
 * see them, inside the window LCP and TBT are measured over.
 *
 * `rootMargin` gives roughly a viewport of runway so the chunk lands before
 * the section does and nothing pops in. `fallback` must reserve the subtree's
 * height exactly, or this buys layout shift back.
 */
export function LazySection({
  children,
  fallback = null,
  rootMargin = "600px",
}: {
  children: React.ReactNode;
  fallback?: React.ReactNode;
  rootMargin?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // No IntersectionObserver — an old browser, or a crawler that runs scripts
    // but not observers. Render everything rather than leave a hole.
    //
    // Queued rather than called straight from the effect body: a synchronous
    // setState here is a cascading render, and this is the same "tell me when"
    // the observer below would do, just with an answer that is already known.
    if (typeof IntersectionObserver === "undefined") {
      queueMicrotask(() => setNear(true));
      return;
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        setNear(true);
        io.disconnect();
      },
      { rootMargin },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [rootMargin]);

  return <div ref={ref}>{near ? children : fallback}</div>;
}
