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
  for (const [key, value] of Object.entries(hidden ?? {})) url.searchParams.set(key, value);

  return (
    <iframe
      ref={frame}
      src={url.toString()}
      title="Form"
      className={className}
      style={{ width: "100%", border: 0, height: measured, ...style }}
      allow="clipboard-write; camera; microphone"
    />
  );
}
