"use client";

import { useMemo } from "react";
import { ChatSurface } from "./chat-client";
import { toChatState, type ChatSnapshot } from "./chat-snapshot";

/**
 * A respondent's screen at the moment they reported a bug, drawn again.
 *
 * Nothing here draws a bubble, a card or a composer of its own: it hands the
 * captured state to `ChatSurface`, the component the hosted form renders, with
 * `replay` set. The console therefore shows exactly the screen the respondent
 * saw — the question card with its chips, the review, the sign-in gate, the
 * composer with whatever hint was up — and it cannot drift from the real page,
 * because it is the real page.
 *
 * `replay` makes the surface `inert` and switches off everything that reaches
 * outside it (sign-in warmup, auto-submit, redirects, confetti). Message text
 * still goes through the surface's own untrusted markdown rendering; this is a
 * customer's form and a stranger's typing, shown inside our console.
 */
export function ChatReplay({ snapshot, height = 560 }: { snapshot: ChatSnapshot; height?: number | string }) {
  const chat = useMemo(() => toChatState(snapshot), [snapshot]);

  return (
    <div
      className="overflow-hidden rounded-xl border"
      style={{ height }}
      aria-label="The respondent's screen when they reported this"
    >
      <ChatSurface chat={chat} config={snapshot.config} replay />
    </div>
  );
}
