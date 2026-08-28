"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePrefersReducedMotion } from "@/hooks/use-reduced-motion";
import {
  CalendarClock,
  Check,
  CreditCard,
  FileText,
  FileUp,
  PartyPopper,
  RotateCcw,
  Star,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Confetti } from "@/components/chat/confetti";
import type { DemoCard, DemoTurn } from "./chat-demo-scripts";

/**
 * A replay of a real conversation, rendered with the product's own chat CSS.
 *
 * This deliberately reuses `.chat-surface`, `bubble-bot`/`bubble-user`,
 * `.chat-prose` and the `cf-typing-dot`/`cf-caret` keyframes from globals.css
 * rather than restyling a marketing lookalike — so what a visitor sees here is
 * the same surface a respondent sees at `/f/[slug]`. If the chat design
 * changes, this changes with it, which is the point. The ending card borrows
 * the respondent runtime's `Confetti` for the same reason.
 *
 * It is a recording, not a live session: no API call, no LLM spend per
 * visitor, and a hero that cannot break when the API is down. The label says
 * so, and the link beside it goes to the real thing.
 */

const CHARS_PER_TICK = 3;
const TICK_MS = 22;
const TYPING_DOTS_MS = 620;
const LOOP_HOLD_MS = 6000;

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

  // The thread and the ending are separate stages of the same recording: the
  // thank-you covers the transcript the way it does in the real runtime, rather
  // than arriving as one more bubble at the bottom of it.
  const ending = rendered.find((t) => t.role === "end");
  const thread = rendered.filter((t) => t.role !== "end");

  /**
   * The progress the header reads, counted the way the runtime counts it: one
   * step per answer the form is waiting on, not one per bubble.
   */
  const totalSteps = useMemo(() => script.filter((t) => t.role === "user").length, [script]);
  // Only the hero plays a whole response, so only the hero can honestly count
  // one. `MOMENT_SCRIPT` is an excerpt from the middle of a longer form — it
  // says "4 of 5" in its own note, and a header counting its two turns as the
  // whole thing would contradict it.
  const showSteps = variant === "hero" && totalSteps > 0;
  const answeredSteps = thread.filter((t) => t.role === "user").length;
  const pct = ending
    ? 100
    : totalSteps === 0
      ? 0
      : Math.round((answeredSteps / totalSteps) * 100);

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

  /**
   * The user turn that resolves the affordance under bot turn `index` — the
   * next turn, or the one after it when a system note lands in between. Reads
   * the derived list, not the typewriter's: under reduced motion `turns` is
   * empty, so looking there would drop every "picked" chip.
   */
  const answerTo = (index: number): Rendered | undefined => {
    for (let i = index + 1; i < thread.length && i <= index + 2; i++) {
      const turn = thread[i];
      if (!turn) return undefined;
      if (turn.role === "user") return turn;
      if (turn.role !== "note") return undefined;
    }
    return undefined;
  };

  return (
    <div ref={stageRef} className={cn("relative", className)}>
      <div
        className={cn(
          "chat-surface border-border/70 shadow-lg relative overflow-hidden rounded-2xl border",
          variant === "hero" ? "h-[28rem] sm:h-[32rem]" : "h-[22rem]",
        )}
      >
        {/* Chrome: enough to read as a product surface, not enough to compete. */}
        <div className="border-border/60 bg-card/60 relative flex items-center gap-2.5 border-b px-4 py-3 backdrop-blur">
          <span className="bg-primary text-primary-foreground font-display grid size-7 place-items-center rounded-full text-xs font-semibold">
            A
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-caption truncate font-medium">Ada · Northwind onboarding</p>
            <p className="text-micro text-muted-foreground">
              {showSteps
                ? ending
                  ? "Complete"
                  : `Question ${Math.min(answeredSteps + 1, totalSteps)} of ${totalSteps}`
                : "Usually replies instantly"}
            </p>
          </div>
          <span className="text-micro text-muted-foreground border-border/70 hidden rounded-full border px-2 py-0.5 sm:inline">
            {label}
          </span>

          {/* The same hairline the runtime draws: progress you feel, not read. */}
          {showSteps && (
            <span
              aria-hidden
              className="absolute inset-x-0 bottom-0 block h-px origin-left transition-transform duration-[var(--duration-slow)] ease-[var(--ease-out)]"
              style={{
                background: "var(--cf-accent)",
                transform: `scaleX(${pct / 100})`,
              }}
            />
          )}
        </div>

        <div className="relative h-[calc(100%-7.25rem)]">
          <div
            ref={scrollRef}
            aria-hidden="true"
            className="absolute inset-0 flex flex-col justify-end gap-3 overflow-y-auto px-4 py-5"
          >
            {thread.map((turn, i) =>
              turn.role === "note" ? (
                <p
                  key={i}
                  className="text-micro text-muted-foreground animate-message-in mx-auto text-center text-balance"
                >
                  {turn.shown}
                </p>
              ) : (
                <div key={i} className="animate-message-in flex flex-col gap-2">
                  <div
                    className={cn("flex", turn.role === "user" ? "justify-end" : "justify-start")}
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
                        const answer = answerTo(i);
                        const picked = answer?.picked ?? answer?.pickedAll?.[0];
                        const chosen =
                          answer?.picked === chip || (answer?.pickedAll?.includes(chip) ?? false);
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

                  {turn.card && !turn.streaming && (
                    <DemoAffordance card={turn.card} answered={Boolean(answerTo(i))} />
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

            {/* Under reduced motion the whole transcript is on screen at once,
                so an overlay would bury it. The ending joins the thread. */}
            {reduced && ending && <DemoEnding ending={ending} inline />}
          </div>

          {!reduced && ending && <DemoEnding ending={ending} />}
        </div>

        {/* A dead composer. It is part of the picture, not a control. */}
        <div className="border-border/60 bg-card/60 absolute inset-x-0 bottom-0 flex items-center gap-2 border-t px-4 py-3 backdrop-blur">
          <span className="text-caption text-muted-foreground flex-1 truncate">
            {ending ? "This conversation is finished." : "Type your answer…"}
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
            {turn.role === "bot"
              ? "Interviewer"
              : turn.role === "user"
                ? "Respondent"
                : turn.role === "end"
                  ? "Completed"
                  : "System"}
            : {turn.text}
            {turn.body ? ` ${turn.body}` : ""}
          </li>
        ))}
      </ol>
    </div>
  );
}

/* ── the in-thread controls ───────────────────────────────────────────────────
   Each of these is the marketing double of a real respondent affordance, and
   has two states: offered, and resolved by the answer that follows it. The
   resolved state is what a visitor scrolling past at speed actually reads, so
   it carries the value — the stars filled, the slot booked, the amount paid. */

function CardShell({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="max-w-[86%] rounded-2xl border px-3.5 py-3"
      style={{ background: "var(--cf-chip-bg)", borderColor: "var(--cf-chip-border)" }}
    >
      {children}
    </div>
  );
}

function CardHead({
  icon: Icon,
  title,
  meta,
}: {
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  title: string;
  meta: string;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <span
        className="grid size-8 shrink-0 place-items-center rounded-lg"
        style={{
          background: "color-mix(in oklch, var(--cf-accent) 14%, transparent)",
          color: "var(--cf-accent)",
        }}
      >
        <Icon className="size-4" strokeWidth={1.9} />
      </span>
      <div className="min-w-0">
        <p className="text-caption font-medium">{title}</p>
        <p className="text-micro text-muted-foreground truncate">{meta}</p>
      </div>
    </div>
  );
}

function AccentPill({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="text-caption inline-flex h-9 items-center rounded-full px-4 font-medium"
      style={{ background: "var(--cf-accent)", color: "var(--cf-accent-text)" }}
    >
      {children}
    </span>
  );
}

function GhostChip({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="text-caption inline-flex h-9 items-center rounded-full border px-4"
      style={{ background: "var(--cf-chip-bg)", borderColor: "var(--cf-chip-border)" }}
    >
      {children}
    </span>
  );
}

/** What every resolved affordance settles into: a tick and the fact recorded. */
function Settled({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-caption animate-message-in flex items-center gap-1.5 text-success font-medium">
      <Check className="size-3.5" strokeWidth={2.5} />
      {children}
    </p>
  );
}

function DemoAffordance({ card, answered }: { card: DemoCard; answered: boolean }) {
  switch (card.kind) {
    case "rating":
      return (
        <div className="flex items-center gap-1.5">
          {Array.from({ length: card.max }, (_, i) => {
            const lit = answered && i < card.picked;
            return (
              <Star
                key={i}
                className={cn(
                  "size-6 transition-all duration-[var(--duration-standard)] ease-[var(--ease-out)]",
                  lit ? "scale-105" : "opacity-30",
                )}
                strokeWidth={1.75}
                style={{
                  // Filled left-to-right rather than all at once — a rating is
                  // chosen by sweeping across it, not by flicking a switch.
                  transitionDelay: `${i * 70}ms`,
                  fill: lit ? "var(--cf-accent)" : "transparent",
                  color: lit ? "var(--cf-accent)" : "currentColor",
                }}
              />
            );
          })}
        </div>
      );

    case "scheduling":
      return (
        <CardShell>
          <CardHead
            icon={CalendarClock}
            title="20-minute onboarding call"
            meta={card.provider}
          />
          {answered ? (
            <div className="mt-3">
              <Settled>{card.slot}</Settled>
            </div>
          ) : (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <AccentPill>{card.buttonLabel}</AccentPill>
              <GhostChip>I&apos;ve booked</GhostChip>
            </div>
          )}
        </CardShell>
      );

    case "upload":
      return answered ? (
        <CardShell>
          <CardHead icon={FileText} title={card.fileName} meta={card.fileSize} />
          <div className="mt-3">
            <Settled>Uploaded</Settled>
          </div>
        </CardShell>
      ) : (
        <div
          className="text-caption text-muted-foreground flex max-w-[86%] flex-col items-center gap-1 rounded-2xl border border-dashed px-4 py-5 text-center"
          style={{ borderColor: "var(--cf-chip-border)" }}
        >
          <FileUp className="size-5 opacity-60" strokeWidth={1.75} />
          <span>Drop a file, or browse</span>
          <span className="text-micro opacity-70">{card.hint}</span>
        </div>
      );

    case "payment":
      return (
        <CardShell>
          <CardHead icon={CreditCard} title={card.amount} meta={card.method} />
          {answered ? (
            <div className="mt-3">
              <Settled>
                Paid {card.amount} · ref{" "}
                <span className="font-mono font-normal">{card.reference}</span>
              </Settled>
            </div>
          ) : (
            <>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <AccentPill>{card.buttonLabel}</AccentPill>
                <GhostChip>I&apos;ve paid</GhostChip>
              </div>
              <p className="text-micro text-muted-foreground mt-2.5">
                Use reference <span className="font-mono">{card.reference}</span> in the payment
                note.
              </p>
            </>
          )}
        </CardShell>
      );
  }
}

/**
 * The thank-you, sat over the transcript rather than under it.
 *
 * The real runtime's `EndingCard` does exactly this — confetti in the form's
 * colours, a big line, and the closing CTA — and the confetti here is that
 * component, scoped to the demo surface instead of the viewport.
 */
function DemoEnding({ ending, inline }: { ending: DemoTurn; inline?: boolean }) {
  const ref = useRef<HTMLDivElement | null>(null);
  // A canvas cannot read `var(--cf-accent)`; it needs the resolved colour. The
  // runtime's ending gets real values off the form's theme, so this resolves
  // the surface's own variables to the same kind of thing.
  const [colors, setColors] = useState<string[]>([]);

  useEffect(() => {
    if (inline) return;
    const el = ref.current;
    if (!el) return;
    const cs = getComputedStyle(el);
    setColors(
      // The mark's two hues plus two families, so the burst reads as the
      // product's confetti rather than a generic party.
      ["--cf-accent", "--family-scale", "--family-choice", "--family-number"]
        .map((v) => cs.getPropertyValue(v).trim())
        .filter(Boolean),
    );
  }, [inline]);

  return (
    <div
      ref={ref}
      className={cn(
        "animate-message-in flex flex-col items-center gap-3 px-6 text-center",
        inline
          ? "py-6"
          : "absolute inset-0 z-10 justify-center backdrop-blur-[2px]",
      )}
      style={inline ? undefined : { background: "color-mix(in oklch, var(--cf-bg) 88%, transparent)" }}
    >
      {!inline && colors.length > 0 && (
        <Confetti colors={colors} className="pointer-events-none absolute inset-0 z-10 h-full w-full" />
      )}

      <div
        className="relative z-20 grid size-14 place-items-center rounded-full"
        style={{ background: "var(--cf-accent)", color: "var(--cf-accent-text)" }}
      >
        <PartyPopper className="size-7" strokeWidth={1.75} />
      </div>

      <h3 className="text-h3 relative z-20 text-balance">{ending.text}</h3>
      {ending.body && (
        <p className="text-caption text-muted-foreground relative z-20 max-w-[30ch] text-balance">
          {ending.body}
        </p>
      )}
      {ending.cta && (
        <span className="relative z-20 mt-1">
          <AccentPill>{ending.cta}</AccentPill>
        </span>
      )}
    </div>
  );
}
