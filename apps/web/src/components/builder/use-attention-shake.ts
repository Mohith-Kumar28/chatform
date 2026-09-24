"use client";

import { useEffect, type RefObject } from "react";
import { useBuilderStore } from "@/stores/builder-store";

/**
 * Shake `el` whenever something sends the author to `ref` (see
 * `pulseAttention`), bringing it into view first when `scroll` is set.
 */
export function useAttentionShake(ref: string, el: RefObject<HTMLElement | null>, scroll = false) {
  const pulse = useBuilderStore((s) => (s.attentionPulse?.ref === ref ? s.attentionPulse.n : 0));
  useEffect(() => {
    const node = el.current;
    if (!pulse || !node) return;
    if (scroll) node.scrollIntoView({ behavior: "smooth", block: "nearest" });
    // Off and on again, with a reflow between, so a second pulse restarts it.
    node.classList.remove("animate-attention");
    void node.offsetWidth;
    node.classList.add("animate-attention");
    const stop = setTimeout(() => node.classList.remove("animate-attention"), 1300);
    return () => {
      clearTimeout(stop);
      node.classList.remove("animate-attention");
    };
  }, [pulse, el, scroll]);
}
