"use client";

import { useEffect, useRef, useState } from "react";

/**
 * A hosted form in an iframe, sized to its content.
 *
 * Nothing about this needs a key: the form is public, and the frame talks to the
 * API itself. If all you want is a form on a page, this is the whole
 * integration.
 */

export interface ChatformEmbedProps {
  /** The form's slug, from its share link. */
  slug: string;
  /** Values the respondent should not be asked for. */
  hidden?: Record<string, string>;
  theme?: "light" | "dark" | "auto";
  /** `"auto"` grows the frame to fit its content. */
  height?: number | "auto";
  origin?: string;
  className?: string;
  style?: React.CSSProperties;
  onReady?: () => void;
  onQuestion?: (event: { ref: string; blockType: string; answered: number; total: number }) => void;
  /**
   * Fires as each question is answered — with the question's ref, never the
   * value. Respondent answers do not belong in the embedding page by default;
   * read them from a webhook or the responses API.
   */
  onAnswer?: (event: { ref: string; blockType: string }) => void;
  onComplete?: (event: { responseId: string; durationMs: number }) => void;
  onClose?: () => void;
}

interface FrameMessage {
  source?: string;
  v?: number;
  type?: string;
  [key: string]: unknown;
}

export function ChatformEmbed({
  slug,
  hidden,
  theme = "auto",
  height = "auto",
  origin = "https://chatform.in",
  className,
  style,
  onReady,
  onQuestion,
  onAnswer,
  onComplete,
  onClose,
}: ChatformEmbedProps) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [measured, setMeasured] = useState<number>(typeof height === "number" ? height : 620);

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      // Any page can post to this one, so the origin check is not optional.
      if (event.origin !== origin) return;
      const message = event.data as FrameMessage;
      if (message?.source !== "chatform") return;

      switch (message.type) {
        case "ready":
          onReady?.();
          break;
        case "resize":
          if (height === "auto" && typeof message.height === "number") setMeasured(message.height);
          break;
        case "question":
          onQuestion?.(message as never);
          break;
        case "answer":
          onAnswer?.(message as never);
          break;
        case "complete":
          onComplete?.(message as never);
          break;
        case "close":
          onClose?.();
          break;
      }
    }

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [origin, height, onReady, onQuestion, onAnswer, onComplete, onClose]);

  const url = new URL(`${origin}/f/${slug}`);
  url.searchParams.set("embed", "1");
  url.searchParams.set("parentOrigin", typeof window === "undefined" ? "" : window.location.origin);
  if (theme !== "auto") url.searchParams.set("theme", theme);
  // Without an onClose the form sits in the page, so its header draws no X.
  if (!onClose) url.searchParams.set("hostClose", "1");
  for (const [key, value] of Object.entries(hidden ?? {})) url.searchParams.set(key, value);

  return (
  /**
   * The embedder's URL is not ours to collect.
   *
   * Without this the iframe sends the full page URL of whatever site the form
   * is embedded on as a `Referer` on every request — including paths and query
   * strings from a customer's private admin page. `strict-origin-when-cross-origin`
   * sends the origin only.
   *
   * A `sandbox` attribute is deliberately NOT set here, and this is what the
   * browser pass established rather than a guess.
   *
   * With `allow-scripts allow-same-origin allow-forms allow-popups
   * allow-popups-to-escape-sandbox allow-downloads` applied to a real embed of
   * a real form, the runtime **worked**: it rendered, the SSE stream
   * connected, an answer was accepted and recorded, the postMessage resize
   * bridge sized the frame, and the console was clean. Two paths could not be
   * reached from that harness, because the accessibility tree does not
   * traverse into a cross-document frame: picking a file through the uploader,
   * and the Google sign-in popup on a gated form. Their tokens are granted in
   * that list, which is reasoning, not evidence.
   *
   * What a sandbox buys here is `allow-top-navigation` staying off, so a
   * compromised frame cannot navigate the embedder's page away. That is worth
   * having and it is not worth betting an embedded live form's file upload or
   * sign-in on two untested paths. Ship it after driving those two by hand on
   * a real embed; everything else about it is already known to work.
   */
    <iframe
      ref={frame}
      src={url.toString()}
      title="Form"
      className={className}
      style={{ width: "100%", border: 0, height: measured, ...style }}
      allow="clipboard-write; camera; microphone"
      referrerPolicy="strict-origin-when-cross-origin"
    />
  );
}
