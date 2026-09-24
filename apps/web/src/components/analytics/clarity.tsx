"use client";

import Script from "next/script";
import { usePathname } from "next/navigation";
import { useDeferredLoad } from "./use-deferred-load";

/**
 * Microsoft Clarity — heatmaps and session replay.
 *
 * `afterInteractive` rather than a literal tag in `<head>`, which is what
 * Clarity's install page hands you. The difference is not blocking: Clarity's
 * own loader already sets `async`, so the tag would not hold up first paint
 * either way. It is ORDER. A script in `<head>` is fetched and parsed while
 * React is still hydrating, so it competes for the main thread during the one
 * window where the page is visible but not yet usable — the exact interval LCP
 * and INP are measured over. `afterInteractive` fires once hydration is done,
 * which costs a second or so of recording at the top of a session and buys back
 * the metric Clarity is being installed to watch.
 *
 * Not `lazyOnload`, which waits for the window `load` event. That is genuinely
 * late on this page — the hero's chat demo is still animating — and a replay
 * that starts after the first scroll has missed the thing we want to see.
 *
 * The project id is not in an env var. It ships in the page source of every
 * site that runs Clarity, so there is nothing to protect, and a
 * `NEXT_PUBLIC_*` here would be inlined at build time and silently absent from
 * any deploy whose environment forgot it — analytics that fail closed and
 * quietly are worse than none.
 */
const CLARITY_PROJECT_ID = "yjqlrzm756";

/**
 * Where Clarity is NOT allowed to run, and why this is not a preference.
 *
 * `/f/*` is a respondent answering somebody else's form, and `/preview/*` is
 * the same runtime. Clarity masks the value of an `<input>` by default, which
 * is the protection people assume they are getting — and it is the wrong shape
 * of protection for this product. A chatform answer does not stay in an input.
 * It is committed to the transcript and rendered as a chat bubble, as ordinary
 * DOM text, which Clarity records verbatim. Session replay on the form runtime
 * would therefore ship the respondent's actual answers to Microsoft.
 *
 * That is a promise we make in writing in three places: /ai-info says answers
 * are stored "for you to read, filter and export whenever you want, and for
 * nobody else", and the FAQ and brand-facts.json say the same. Nothing about
 * where the script tag is pasted changes what the recording contains, so the
 * exclusion lives in code next to the reason for it.
 */
const EXCLUDED = ["/f/", "/preview/"];

export function Clarity() {
  const pathname = usePathname();
  /**
   * Both hooks run before the exclusion check, because they are hooks — an
   * early return above them would change the hook order between an excluded
   * route and an included one.
   *
   * Once this flips, `next/script` mounts and runs the loader on the spot:
   * `afterInteractive` is long past by then, so the strategy below is about
   * where the tag is injected, not when.
   */
  const ready = useDeferredLoad();
  if (EXCLUDED.some((prefix) => pathname.startsWith(prefix))) return null;
  if (!ready) return null;

  return (
    <Script id="ms-clarity" strategy="afterInteractive">
      {`(function(c,l,a,r,i,t,y){
    c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
    t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
    y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
})(window, document, "clarity", "script", "${CLARITY_PROJECT_ID}");`}
    </Script>
  );
}
