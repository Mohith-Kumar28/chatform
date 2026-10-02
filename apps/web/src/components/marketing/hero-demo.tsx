"use client";

import { useCallback, useEffect, useState, type ButtonHTMLAttributes } from "react";
import { ArrowRight, ExternalLink, X } from "lucide-react";
import { LogoMark } from "@/components/brand/logo";

/**
 * The hero's demo: the real demo form, behind a Start button.
 *
 * It replaced a scripted replay. A recording can only show what we decided to
 * show; this is the same `/f/<slug>` a respondent opens, so the visitor gets to
 * answer it, and the "try the demo" pill that used to sit beside "Start free"
 * is no longer needed.
 *
 * Nothing loads until Start is pressed: no iframe, no session, no view counted
 * for somebody who only scrolled past.
 *
 * On a desktop the form plays inside the window. On a phone the window is too
 * small to type into comfortably, so Start opens it full screen instead, the
 * way the popup embed does below 520px, with a close button to come back.
 */
const PHONE_QUERY = "(max-width: 639px)";

/** Fired by `HeroDemoButton` so the hero's own pill can start the demo. */
const START_EVENT = "chatform:hero-demo-start";

export function HeroDemo({ slug }: { slug: string }) {
  const [playing, setPlaying] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);

  const src = `/f/${slug}?embed=1`;
  const href = `/f/${slug}`;

  const start = useCallback(() => {
    if (window.matchMedia(PHONE_QUERY).matches) setFullscreen(true);
    else setPlaying(true);
  }, []);

  useEffect(() => {
    window.addEventListener(START_EVENT, start);
    return () => window.removeEventListener(START_EVENT, start);
  }, [start]);

  // Full screen owns the page: no scrolling behind it, Escape closes it.
  useEffect(() => {
    if (!fullscreen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setFullscreen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [fullscreen]);

  return (
    <div className="relative min-w-0">
      {/* The light behind the window. White, because the wash under it is
          already the brand's two hues at full strength. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-[3rem] sm:-inset-4 xl:-inset-10 bg-white/45 blur-3xl dark:bg-white/25"
      />

      <div className="chat-surface relative z-10 overflow-hidden rounded-2xl border border-white/60 shadow-2xl">
        {/* Window chrome. */}
        <div className="border-border/60 bg-card/80 flex items-center gap-3 border-b px-4 py-2.5 backdrop-blur">
          <span aria-hidden className="flex gap-1.5">
            <span className="size-2.5 rounded-full bg-[#ff5f57]" />
            <span className="size-2.5 rounded-full bg-[#febc2e]" />
            <span className="size-2.5 rounded-full bg-[#28c840]" />
          </span>
          <span className="text-micro text-muted-foreground bg-muted/70 min-w-0 flex-1 truncate rounded-md px-3 py-1 text-center">
            chatform.in{href}
          </span>
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-micro text-muted-foreground hover:text-foreground inline-flex shrink-0 items-center gap-1 transition-colors"
          >
            <span className="hidden sm:inline">Open in new tab</span>
            <ExternalLink className="size-3.5" />
            <span className="sr-only sm:hidden">Open in new tab</span>
          </a>
        </div>

        <div className="relative h-[28rem] sm:h-[36rem]">
          {playing ? (
            <iframe
              src={src}
              title="chatform demo form"
              allow="clipboard-write; camera; microphone; geolocation"
              className="absolute inset-0 block size-full border-0"
            />
          ) : (
            <div className="absolute inset-0 grid place-items-center px-6 text-center">
              <div className="flex max-w-xs flex-col items-center">
                <LogoMark className="size-14" />
                <p className="font-display mt-5 text-2xl font-semibold tracking-tight text-balance">
                  Hi! This is a real chatform.
                </p>
                <p className="text-caption text-muted-foreground mt-2 text-balance">
                  Eight quick questions, under three minutes.
                </p>
                <button
                  type="button"
                  onClick={start}
                  className="bg-primary text-primary-foreground mt-6 inline-flex h-11 items-center gap-2 rounded-full px-6 font-medium shadow-md transition-transform hover:-translate-y-0.5 active:translate-y-0"
                >
                  Start the demo
                  <ArrowRight className="size-4" strokeWidth={2.25} />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {fullscreen ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="chatform demo form"
          className="bg-background fixed inset-0 z-[2147483647] flex flex-col"
        >
          <iframe
            src={src}
            title="chatform demo form"
            allow="clipboard-write; camera; microphone; geolocation"
            className="block w-full flex-1 border-0"
          />
          <button
            type="button"
            onClick={() => setFullscreen(false)}
            aria-label="Close demo"
            className="bg-card text-foreground border-border absolute top-3 right-3 grid size-9 place-items-center rounded-full border shadow-md"
          >
            <X className="size-4" />
          </button>
        </div>
      ) : null}
    </div>
  );
}

/**
 * The hero pill that starts the demo. Phones only: there the window sits a
 * screen below the buttons, so the pill opens the form straight to full screen.
 */
export function HeroDemoButton({
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button {...props} type="button" onClick={() => window.dispatchEvent(new Event(START_EVENT))}>
      {children}
    </button>
  );
}
