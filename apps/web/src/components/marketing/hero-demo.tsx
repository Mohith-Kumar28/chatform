"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, ExternalLink, X } from "lucide-react";
import { ChatBubble } from "@/components/chat/chat-bubble";

/** The demo form's first question, as its author wrote it (tooling/demo-form). */
const PREVIEW_CHOICES = [
  { label: "A page of fields", image: "/demo/page-of-fields.svg" },
  { label: "One per screen", image: "/demo/one-question-at-a-time.svg" },
  { label: "A sheet or inbox", image: "/demo/sheet-or-inbox.svg" },
  { label: "A chat, like this", image: "/demo/a-chat.svg" },
];

/**
 * The hero's demo: the real demo form, behind a Start button.
 *
 * It replaced a scripted replay. A recording can only show what we decided to
 * show; this is the same `/f/<slug>` a respondent opens, so the visitor gets to
 * answer it, and the "try the demo" pill that used to sit beside "Start free"
 * is no longer needed.
 *
 * The frame loads behind the preview as soon as the page is idle, the way the
 * popup embed loads behind its launcher, so Start shows a form that is already
 * there. It used to load on the press, which was a blank window for the two
 * seconds the page took to arrive and a boot screen after that. Loaded early
 * it is held (`cf_defer`): no session and no view counted until Start says
 * `open`, so somebody who only scrolled past is still nobody.
 *
 * On a desktop the form plays inside the window. On a phone the window is too
 * small to type into comfortably, so Start opens it full screen instead, the
 * way the popup embed does below 520px, with a close button to come back.
 * Which of the two is decided once, when the frame is built, because moving
 * an iframe in the document reloads it.
 */
const PHONE_QUERY = "(max-width: 639px)";

export function HeroDemo({ slug }: { slug: string }) {
  const [playing, setPlaying] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  /** Where the frame was built, or null until it has been. */
  const [placed, setPlaced] = useState<{ phone: boolean; src: string } | null>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const startedRef = useRef(false);

  const href = `/f/${slug}`;

  const place = useCallback(() => {
    setPlaced(
      (current) =>
        current ?? {
          phone: window.matchMedia(PHONE_QUERY).matches,
          // `hostClose`: the frame draws no X of its own; the phone sheet has one.
          src: `/f/${slug}?embed=1&cf_defer=1&hostClose=1&parentOrigin=${encodeURIComponent(window.location.origin)}`,
        },
    );
  }, [slug]);

  /** The other half of `whenEmbedOpened` in the frame: start the session. */
  const sendOpen = useCallback(() => {
    frameRef.current?.contentWindow?.postMessage({ source: "chatform", v: 1, type: "open" }, window.location.origin);
  }, []);

  useEffect(() => {
    const idle = window.requestIdleCallback
      ? window.requestIdleCallback(place, { timeout: 500 })
      : window.setTimeout(place, 200);
    // A frame still loading when Start was pressed missed that `open`, so it
    // hears it again when it says it is listening.
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.source !== frameRef.current?.contentWindow) return;
      const message = event.data as { source?: string; type?: string } | null;
      if (message?.source === "chatform" && message.type === "ready" && startedRef.current) sendOpen();
    };
    window.addEventListener("message", onMessage);
    return () => {
      if (window.cancelIdleCallback) window.cancelIdleCallback(idle);
      else window.clearTimeout(idle);
      window.removeEventListener("message", onMessage);
    };
  }, [place, sendOpen]);

  const start = useCallback(() => {
    place();
    startedRef.current = true;
    sendOpen();
    if (placed ? placed.phone : window.matchMedia(PHONE_QUERY).matches) setFullscreen(true);
    else setPlaying(true);
  }, [place, placed, sendOpen]);

  const frame = placed ? (
    <iframe
      ref={frameRef}
      src={placed.src}
      title="chatform demo form"
      allow="clipboard-write; camera; microphone; geolocation"
      tabIndex={playing || fullscreen ? undefined : -1}
      className={placed.phone ? "block w-full flex-1 border-0" : "absolute inset-0 block size-full border-0"}
    />
  ) : null;

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

        <div className="relative h-[30rem] sm:h-[32rem]">
          {/* Under the preview until Start, loaded and waiting. */}
          {placed && !placed.phone ? (
            <div aria-hidden={!playing} className={playing ? "absolute inset-0" : "invisible absolute inset-0"}>
              {frame}
            </div>
          ) : null}
          {playing ? null : (
            <>
              {/* The form's real opening, faded, so the window shows what is
                  waiting rather than an empty page. Nothing here is live. */}
              <div aria-hidden className="pointer-events-none absolute inset-0 flex flex-col gap-2.5 p-5 sm:p-8">
                <div className="flex">
                  <ChatBubble from="bot">
                    Hi, I&apos;m the chatform agent. This is a real chatform form, so you&apos;re seeing exactly what
                    your own respondents would.
                  </ChatBubble>
                </div>
                <div className="flex">
                  <ChatBubble from="bot">Which of these is closest to how you collect answers today?</ChatBubble>
                </div>
                <div className="mt-1 grid max-w-xl grid-cols-2 gap-2.5 sm:grid-cols-4">
                  {PREVIEW_CHOICES.map((c) => (
                    <div key={c.label} className="bg-card overflow-hidden rounded-xl border">
                      {/* eslint-disable-next-line @next/next/no-img-element -- a static drawing */}
                      <img src={c.image} alt="" className="aspect-[4/3] w-full object-cover" />
                      <p className="truncate px-2.5 py-1.5 text-xs font-medium">{c.label}</p>
                    </div>
                  ))}
                </div>
              </div>
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0 bg-gradient-to-b from-transparent via-[color-mix(in_oklch,var(--cf-bg)_88%,transparent)] via-55% to-[var(--cf-bg)]"
              />
              <div className="absolute inset-x-0 bottom-0 flex flex-col items-center px-6 pb-10 text-center sm:pb-14">
                <p className="font-display text-2xl font-semibold tracking-tight text-balance">
                  Hi! This is a real chatform.
                </p>
                <p className="text-caption text-muted-foreground mt-1.5 text-balance">
                  Eight quick questions, under three minutes.
                </p>
                <button
                  type="button"
                  onClick={start}
                  className="bg-primary text-primary-foreground mt-5 inline-flex h-11 items-center gap-2 rounded-full px-6 font-medium shadow-md transition-transform hover:-translate-y-0.5 active:translate-y-0"
                >
                  Start the demo
                  <ArrowRight className="size-4" strokeWidth={2.25} />
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Kept in the document while closed, hidden, so the form in it stays loaded. */}
      {placed?.phone ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="chatform demo form"
          aria-hidden={!fullscreen}
          className={
            fullscreen
              ? "bg-background fixed inset-0 z-[2147483647] flex flex-col"
              : "invisible pointer-events-none fixed inset-0 flex flex-col"
          }
        >
          {frame}
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
