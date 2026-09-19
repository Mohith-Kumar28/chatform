"use client";

import Script from "next/script";
import { usePathname } from "next/navigation";

/**
 * Google Tag Manager.
 *
 * GTM's install page says to put the tag "as high in the <head> as possible",
 * and that instruction is not about performance — it is about coverage. A
 * container loaded late misses anything that happened before it, so on a
 * server-rendered multi-page site the head is genuinely the only place a tag
 * fires before the user has already clicked something. This is not that site.
 * The whole app is one client-rendered React tree: nothing is interactive, and
 * no event worth measuring can occur, until hydration finishes — which is
 * precisely when `afterInteractive` runs. The coverage the head placement buys
 * elsewhere does not exist here, so it is paid for and not collected.
 *
 * What it does cost is the same thing it costs Clarity, for the same reason:
 * the snippet is `async`, so it never blocks first paint either way, but a
 * head tag is fetched and parsed while React is still hydrating and competes
 * for the main thread across exactly the window LCP and INP are measured over.
 * GTM is worse than Clarity here — the container is a bootstrapper, and every
 * tag configured inside it is a second wave of scripts loading behind it — so
 * the interval it occupies is longer and the argument for keeping it out of
 * hydration is stronger.
 *
 * Not `lazyOnload`: that waits for the window `load` event, which on the
 * landing page is after the hero's chat demo has finished animating, and a
 * container that starts after the first scroll has missed the pageview it was
 * installed to record.
 *
 * The container id is hardcoded, like Clarity's project id. It ships in the
 * page source of every site that runs GTM so there is nothing to protect, and
 * a `NEXT_PUBLIC_*` would be inlined at build time and silently absent from
 * any deploy whose environment forgot it.
 */
const GTM_CONTAINER_ID = "GTM-NQLPKDG5";

/**
 * The Google Ads tag (gtag.js). It loads alongside the container, on the same
 * strategy and behind the same exclusion, rather than as a tag inside GTM, so
 * it shares the container's `dataLayer` and stays out of the respondent runtime.
 */
const GOOGLE_ADS_ID = "AW-452851592";

/**
 * The same exclusion as Clarity, for a reason that is one step further back.
 *
 * `/f/*` is a respondent answering somebody else's form and `/preview/*` is
 * the same runtime. Clarity is excluded there because session replay would
 * record the transcript — a chatform answer is committed as a chat bubble, as
 * ordinary DOM text, not left in a masked `<input>`. GTM does not record
 * anything by itself, so on today's container this is only a pageview carrying
 * a form URL. The point is that GTM is a loader for tags configured later, in
 * a web UI, by whoever has access to the container: the decision about what
 * runs on the respondent runtime would stop being a decision made in this
 * repository. Adding a replay or heatmap tag to a container is two clicks and
 * no deploy, and it would quietly undo the promise /ai-info, the FAQ and
 * brand-facts.json make in writing about who can read people's answers.
 *
 * So the container does not load there at all, and the guarantee stays a
 * property of the code rather than of the container's configuration.
 */
const EXCLUDED = ["/f/", "/preview/"];

export function GoogleTagManager() {
  const pathname = usePathname();
  if (EXCLUDED.some((prefix) => pathname.startsWith(prefix))) return null;

  /*
    The `<noscript>` iframe from the install snippet is deliberately not here.
    It exists to fire tags for a visitor with JavaScript disabled, and such a
    visitor sees nothing of this app — it is a React client tree, so the page
    is blank for them. There is no session to measure, only an iframe to ship.
  */
  return (
    <>
      <Script id="google-tag-manager" strategy="afterInteractive">
        {`(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','${GTM_CONTAINER_ID}');`}
      </Script>
      <Script
        id="google-ads-gtag-src"
        src={`https://www.googletagmanager.com/gtag/js?id=${GOOGLE_ADS_ID}`}
        strategy="afterInteractive"
      />
      <Script id="google-ads-gtag" strategy="afterInteractive">
        {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${GOOGLE_ADS_ID}');`}
      </Script>
    </>
  );
}
