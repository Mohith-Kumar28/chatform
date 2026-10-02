"use client";

import { useEffect } from "react";

/**
 * Replaces Next's built-in "This page couldn't load" screen for a crash that
 * takes down the root layout.
 *
 * Two jobs. Report the error, because it only ever exists in the visitor's
 * browser (a crash in Instagram's in-app browser on 2026-10-02 left nothing to
 * debug). Then reload once, since most of these are one-off: the second load
 * usually works. Reloads at most once a minute per tab so a crash that repeats
 * every load settles on this screen instead of looping. If storage is blocked
 * there is no way to tell, so it never auto-reloads.
 */

const RELOADED_AT = "chatform:global-error-reload";
const RELOAD_WINDOW_MS = 60_000;

function report(error: Error & { digest?: string }) {
  try {
    const body = JSON.stringify({
      message: String(error?.message ?? error),
      digest: error?.digest,
      stack: error?.stack,
      url: location.href,
    });
    if (!navigator.sendBeacon?.("/api/client-error", new Blob([body], { type: "application/json" }))) {
      void fetch("/api/client-error", { method: "POST", body, keepalive: true }).catch(() => {});
    }
  } catch {
    // Reporting must never be the thing that fails.
  }
}

function reloadOnce(): boolean {
  try {
    const last = Number(sessionStorage.getItem(RELOADED_AT) ?? 0);
    if (Date.now() - last < RELOAD_WINDOW_MS) return false;
    sessionStorage.setItem(RELOADED_AT, String(Date.now()));
  } catch {
    return false;
  }
  location.reload();
  return true;
}

export default function GlobalError({ error }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    report(error);
    reloadOnce();
  }, [error]);

  return (
    <html lang="en">
      <head>
        <title>This page couldn&apos;t load</title>
        <style>{`
          :root { --bg: #faf8f5; --fg: #1c1917; --muted: #78716c; --btn-bg: #1c1917; --btn-fg: #faf8f5; }
          @media (prefers-color-scheme: dark) {
            :root { --bg: #0c0a09; --fg: #f5f5f4; --muted: #a8a29e; --btn-bg: #f5f5f4; --btn-fg: #0c0a09; }
          }
          body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: var(--bg); color: var(--fg);
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
          main { padding: 24px; max-width: 360px; }
          h1 { font-size: 22px; font-weight: 600; margin: 0 0 8px; }
          p { margin: 0 0 20px; color: var(--muted); font-size: 15px; }
          button { font: inherit; font-size: 15px; padding: 10px 18px; border-radius: 8px; border: 0;
            background: var(--btn-bg); color: var(--btn-fg); cursor: pointer; }
        `}</style>
      </head>
      <body>
        <main>
          <h1>This page couldn&apos;t load</h1>
          <p>Please try again.</p>
          <button type="button" onClick={() => location.reload()}>
            Reload
          </button>
        </main>
      </body>
    </html>
  );
}
