"use client";

import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { settingPlace } from "@repo/form-schema";
import { useBuilderStore } from "@/stores/builder-store";
import { shake } from "./inspector-reveal";

/**
 * Take the author to a setting: the tab it lives on, the Agent sub-tab or the
 * Design sheet it is in, scrolled into view and shaken, so an AI proposal's
 * "Agent › Persona" is a door rather than a direction.
 *
 * The same contract as the preview's click-to-inspect (`inspector-reveal.ts`):
 * a control marks itself with `data-setting="<registry key>"` (space-separated
 * when one control holds several), and nothing is
 * threaded between components. Crossing tabs goes through the URL
 * (`?reveal=<key>`), because the tab is a route and the element does not exist
 * until it has rendered; `useSettingReveal` in the shell waits for it.
 */

export function revealSetting(
  key: string,
  nav: { formId: string; pathname: string; push: (href: string) => void },
): void {
  const place = settingPlace(key);
  if (!place) return;
  const base = `/forms/${nav.formId}`;

  if (place.panel === "design") {
    // The sheet lives over Build; from anywhere else, land on Build first.
    if (nav.pathname === `${base}/build` || nav.pathname === `${base}/workflow`) {
      useBuilderStore.getState().setDesignOpen(true, key);
    } else {
      nav.push(`${base}/build?design=${encodeURIComponent(key)}`);
    }
    return;
  }
  const query = new URLSearchParams({ reveal: key });
  // Settings sections are routes of their own; Agent's sub-tabs are a query.
  if (place.tab === "settings") {
    if (place.section) query.set("section", place.section);
    nav.push(`${base}/settings/${place.panel ?? "general"}?${query}`);
    return;
  }
  nav.push(`${base}/${place.tab}?${query}`);
}

/** Scroll a marked control into view and shake it, once it has rendered. */
export function findAndShake(key: string, root: ParentNode = document, timeoutMs = 3000): () => void {
  const started = Date.now();
  let frame = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const look = () => {
    const el = [...root.querySelectorAll<HTMLElement>(`[data-setting~="${CSS.escape(key)}"]`)].find(
      (x) => x.getClientRects().length > 0,
    );
    if (el) {
      el.scrollIntoView({ block: "center", behavior: "smooth" });
      // Shaking mid-scroll is lost in the motion of the scroll itself.
      timer = setTimeout(() => shake(el), 350);
      return;
    }
    if (Date.now() - started < timeoutMs) frame = requestAnimationFrame(look);
  };
  frame = requestAnimationFrame(look);
  return () => {
    cancelAnimationFrame(frame);
    clearTimeout(timer);
  };
}

/**
 * Mounted once, in the builder shell: answers `?reveal=` on whichever tab it
 * lands, and `?design=<key>` by opening the sheet at that field. Both are
 * taken off the URL afterwards, so a reload does not shake it again.
 */
export function useSettingReveal(): void {
  const params = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const reveal = params.get("reveal");
  const design = params.get("design");
  // Hydrating the document closes the sheet, so `?design=` waits for it too.
  const loaded = useBuilderStore((s) => s.doc !== null);

  useEffect(() => {
    // The tab's controls render from the document, so both wait for it.
    if ((!reveal && !design) || !loaded) return;
    const clean = () => {
      const url = new URL(window.location.href);
      url.searchParams.delete("reveal");
      url.searchParams.delete("section");
      url.searchParams.delete("design");
      router.replace(`${url.pathname}${url.search}`, { scroll: false });
    };
    if (design) {
      // `?design=1` (Integrate's "Edit in Design") just opens the sheet.
      useBuilderStore.getState().setDesignOpen(true, design === "1" ? undefined : design);
      clean();
      return;
    }
    const stop = findAndShake(reveal!);
    const t = setTimeout(clean, 3500);
    return () => {
      stop();
      clearTimeout(t);
    };
  }, [reveal, design, loaded, pathname, router]);
}

/** Renders nothing; `useSearchParams` wants a Suspense boundary of its own. */
export function SettingRevealListener(): null {
  useSettingReveal();
  return null;
}
