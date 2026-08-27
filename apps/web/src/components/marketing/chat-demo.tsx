"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePrefersReducedMotion } from "@/hooks/use-reduced-motion";
import { RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DemoTurn } from "./chat-demo-scripts";

/**
 * A replay of a real conversation, rendered with the product's own chat CSS.
 *
 * This deliberately reuses `.chat-surface`, `bubble-bot`/`bubble-user`,
 * `.chat-prose` and the `cf-typing-dot`/`cf-caret` keyframes from globals.css
 * rather than restyling a marketing lookalike — so what a visitor sees here is
 * the same surface a respondent sees at `/f/[slug]`. If the chat design
 * changes, this changes with it, which is the point.
 *
 * It is a recording, not a live session: no API call, no LLM spend per
 * visitor, and a hero that cannot break when the API is down. The label says
 * so, and the link beside it goes to the real thing.
 */

const CHARS_PER_TICK = 2;
const TICK_MS = 34;
const TYPING_DOTS_MS = 620;
const LOOP_HOLD_MS = 3800;

interface Rendered extends DemoTurn {
  shown: string;
  streaming: boolean;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** The opening bot turn, rendered complete before any animation starts. */
function seed(script: readonly DemoTurn[]): Rendered[] {
  const first = script[0];
  if (!first || first.role !== "bot") return [];
  return [{ ...first, shown: first.text, streaming: false }];
}

export function ChatDemo({
  script,
  variant = "hero",
  label = "Recording",
  className,
}: {
  script: readonly DemoTurn[];
  variant?: "hero" | "feature";
  label?: string;
  className?: string;
}) {
  // `useReducedMotion` is a browser-only reading, so branching the render on it
  // directly made the server emit the seeded turn while the client emitted the
  // whole script — a hydration mismatch that React resolves by throwing the
  // tree away and rebuilding it. Gate it on hydration: the first client render
  // matches the server, and the static transcript swaps in immediately after.
  const reduced = usePrefersReducedMotion();
  const [runId, setRunId] = useState(0);
  const [active, setActive] = useState(false);
  // The first turn is seeded, not animated. Otherwise the hero renders an
  // empty box for the ~1s of intersection callback plus typing dots, and the
  // first thing a visitor sees is a hole where the product should be. It also
  // means the greeting is in the server HTML.
  const [turns, setTurns] = useState<Rendered[]>(() => seed(script));
  const [typing, setTyping] = useState(false);

  const stageRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  /**
   * What to draw: the finished script when motion is unwelcome, otherwise
   * whatever the typewriter has produced so far.
   */
  const rendered: Rendered[] = reduced
    ? script.map((t) => ({ ...t, shown: t.text, streaming: false }))
    : turns;
  const showTyping = reduced ? false : typing;

  // Start when the demo is on screen, and stop driving it once it leaves —
  // an off-screen typewriter is pure battery.
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => setActive(entry.isIntersecting && entry.intersectionRatio > 0.2),
      { threshold: [0, 0.2, 0.6] },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    // Under reduced motion the whole script is shown at once — see `rendered`
    // below, which derives it during render. Nothing to animate, and nothing to
    // set: writing that state from here rendered an empty demo first and then
    // replaced it, which is a cascading render for a value that was knowable
    // all along.
    if (reduced) return;
    if (!active) return;

    let cancelled = false;
    const cancelled_ = () => cancelled;

    const play = async () => {
      setTurns(seed(script));
      setTyping(false);
      await sleep(900);

      for (const turn of script.slice(seed(script).length)) {
        if (cancelled_()) return;

        if (turn.role === "bot") {
          setTyping(true);
          await sleep(turn.waitMs ?? TYPING_DOTS_MS);
          if (cancelled_()) return;
          setTyping(false);
          setTurns((prev) => [...prev, { ...turn, shown: "", streaming: true }]);

          for (let i = CHARS_PER_TICK; i <= turn.text.length + CHARS_PER_TICK; i += CHARS_PER_TICK) {
            await sleep(TICK_MS);
            if (cancelled_()) return;
            const slice = turn.text.slice(0, i);
            setTurns((prev) =>
              prev.map((t, idx) => (idx === prev.length - 1 ? { ...t, shown: slice } : t)),
            );
          }
          setTurns((prev) =>
            prev.map((t, idx) =>
              idx === prev.length - 1 ? { ...t, shown: turn.text, streaming: false } : t,
            ),
          );
        } else {
          await sleep(turn.waitMs ?? 900);
          if (cancelled_()) return;
          setTurns((prev) => [...prev, { ...turn, shown: turn.text, streaming: false }]);
        }
      }

      await sleep(LOOP_HOLD_MS);
      if (cancelled_()) return;
      setRunId((n) => n + 1);
    };

    void play();
    return () => {
      cancelled = true;
    };
  }, [script, active, runId, reduced]);

  // Follow the bottom as bubbles land. The container scrolls, never the page.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: reduced ? "auto" : "smooth" });
  }, [turns, typing, reduced]);

  const restart = useCallback(() => setRunId((n) => n + 1), []);

  // Reads the derived list, not the typewriter's: under reduced motion `turns`
  // is empty, so looking there would drop every "picked" chip.
  const pickedFor = (index: number) => rendered[index + 1]?.picked;

  return (
    <div ref={stageRef} className={cn("relative", className)}>
      <div
        className={cn(
          "chat-surface border-border/70 shadow-lg relative overflow-hidden rounded-2xl border",
          variant === "hero" ? "h-[26rem] sm:h-[30rem]" : "h-[24rem]",
        )}
      >
        {/* Chrome: enough to read as a product surface, not enough to compete. */}
        <div className="border-border/60 bg-card/60 flex items-center gap-2.5 border-b px-4 py-3 backdrop-blur">
          <span className="bg-primary text-primary-foreground font-display grid size-7 place-items-center rounded-full text-xs font-semibold">
            A
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-caption truncate font-medium">Ada · Northwind onboarding</p>
            <p className="text-micro text-muted-foreground">Usually replies instantly</p>
          </div>
          <span className="text-micro text-muted-foreground border-border/70 hidden rounded-full border px-2 py-0.5 sm:inline">
            {label}
          </span>
        </div>

        <div
          ref={scrollRef}
          aria-hidden="true"
          className="flex h-[calc(100%-7.25rem)] flex-col justify-end gap-3 overflow-y-auto px-4 py-5"
        >
          {rendered.map((turn, i) =>
            turn.role === "note" ? (
              <p
                key={i}
                className="text-micro text-muted-foreground animate-message-in mx-auto text-center"
              >
                {turn.shown}
              </p>
            ) : (
              <div key={i} className="animate-message-in flex flex-col gap-2">
                <div
                  className={cn(
                    "flex",
                    turn.role === "user" ? "justify-end" : "justify-start",
                  )}
                >
                  <div
                    className={cn(
                      "chat-prose max-w-[86%] px-4 py-2.5 text-[0.9375rem] leading-relaxed whitespace-pre-wrap",
                      turn.role === "user" ? "bubble-user" : "bubble-bot border",
                    )}
                    style={
                      turn.role === "user"
                        ? {
                            background: "var(--cf-user-bubble)",
                            color: "var(--cf-user-bubble-text)",
                            borderColor: "transparent",
                          }
                        : {
                            background: "var(--cf-bot-bubble)",
                            color: "var(--cf-bot-bubble-text)",
                            borderColor: "var(--cf-bot-bubble-border)",
                          }
                    }
                  >
                    {turn.shown}
                    {turn.streaming && (
                      <span className="animate-caret ml-0.5 inline-block">▍</span>
                    )}
                  </div>
                </div>

                {turn.chips && !turn.streaming && (
                  <div className="flex flex-wrap gap-1.5">
                    {turn.chips.map((chip) => {
                      const picked = pickedFor(i);
                      const chosen = picked === chip;
                      return (
                        <span
                          key={chip}
                          className={cn(
                            "text-caption rounded-full border px-3 py-1.5 transition-opacity",
                            "duration-[var(--duration-standard)] ease-[var(--ease-out)]",
                            chosen && "border-transparent",
                            picked && !chosen && "opacity-35",
                          )}
                          style={
                            chosen
                              ? {
                                  background: "var(--cf-user-bubble)",
                                  color: "var(--cf-user-bubble-text)",
                                }
                              : {
                                  background: "var(--cf-chip-bg)",
                                  borderColor: "var(--cf-chip-border)",
                                }
                          }
                        >
                          {chip}
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>
            ),
          )}

          {showTyping && (
            <div className="flex justify-start">
              <div
                className="bubble-bot flex items-center gap-1 border px-4 py-3"
                style={{
                  background: "var(--cf-bot-bubble)",
                  borderColor: "var(--cf-bot-bubble-border)",
                }}
              >
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className="size-1.5 rounded-full bg-current opacity-40"
                    style={{
                      animation: "cf-typing-dot 900ms ease-in-out infinite",
                      animationDelay: `${i * 150}ms`,
                    }}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* A dead composer. It is part of the picture, not a control. */}
        <div className="border-border/60 bg-card/60 absolute inset-x-0 bottom-0 flex items-center gap-2 border-t px-4 py-3 backdrop-blur">
          <span className="text-caption text-muted-foreground flex-1 truncate">
            Type your answer…
          </span>
          {!reduced && (
            <button
              type="button"
              onClick={restart}
              aria-label="Replay this conversation"
              className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 rounded-full p-1.5 transition-colors focus-visible:ring-[3px]"
            >
              <RotateCcw className="size-3.5" strokeWidth={1.75} />
            </button>
          )}
        </div>
      </div>

      {/* The animated thread is aria-hidden; this is what a screen reader gets. */}
      <ol className="sr-only">
        {script.map((turn, i) => (
          <li key={i}>
            {turn.role === "bot" ? "Interviewer" : turn.role === "user" ? "Respondent" : "System"}:{" "}
            {turn.text}
          </li>
        ))}
      </ol>
    </div>
  );
}
