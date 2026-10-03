"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowUp, BookOpen, Check, Clock, FileText, Link2, LogOut, Mail, MousePointerClick } from "lucide-react";
import { ChatBubble } from "@/components/chat/chat-bubble";
import { cn } from "@/lib/utils";

/**
 * The three small films in "How is this different from other forms?".
 *
 * Each is a list of frames on a timer that plays while its card is on screen
 * and starts again from the top after a pause.
 *
 * The server renders the last frame, the finished picture. Only a browser with
 * motion allowed rewinds it and plays, so reduced motion and no-JS both get
 * the whole exchange, still.
 */
function useFrames(holds: readonly number[]) {
  const ref = useRef<HTMLDivElement>(null);
  const [frame, setFrame] = useState(holds.length - 1);
  const [live, setLive] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let i = 0;
    const tick = () => {
      timer = setTimeout(() => {
        i = (i + 1) % holds.length;
        setFrame(i);
        tick();
      }, holds[i]);
    };
    const io = new IntersectionObserver(
      ([entry]) => {
        clearTimeout(timer);
        setLive(true);
        if (entry?.isIntersecting) tick();
        else {
          // Rewound while it is off screen, so it opens on its first frame.
          i = 0;
          setFrame(0);
        }
      },
      { threshold: 0.4 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      clearTimeout(timer);
    };
  }, [holds]);

  return [ref, frame, live] as const;
}

/* Strong ease-out: quick off the mark, soft landing. */
const EASE = "ease-[cubic-bezier(0.23,1,0.32,1)]";

/** The card both kinds of film sit on. */
function Stage({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "chat-surface bg-background border-border/70 w-full rounded-2xl border shadow-[0_18px_45px_-26px_oklch(0.25_0.02_65/0.45)]",
        className,
      )}
    >
      {children}
    </div>
  );
}

// ── the chat film ────────────────────────────────────────────────────────

export type ChatLine =
  | { from: "bot" | "user"; text: string; chip?: string }
  | { from: "note"; text: string };

/** What is on screen in one frame. */
type ChatFrame = { shown: number; dots?: number; composing?: number; hold: number };

/**
 * A script becomes frames the way a chat happens: a person's line is typed in
 * the composer and then sent, a reply from the form is three dots and then the
 * bubble. The first line is already there when the film opens.
 */
function framesFor(lines: readonly ChatLine[]): ChatFrame[] {
  const frames: ChatFrame[] = [{ shown: 1, hold: 650 }];
  lines.forEach((line, i) => {
    if (i === 0) return;
    if (line.from === "user") {
      frames.push({ shown: i, composing: i, hold: 420 + line.text.length * 26 });
      frames.push({ shown: i + 1, hold: 380 });
    } else if (line.from === "bot") {
      frames.push({ shown: i, dots: i, hold: 720 });
      frames.push({ shown: i + 1, hold: lines[i + 1]?.from === "bot" ? 520 : 850 });
    } else {
      frames.push({ shown: i + 1, hold: 600 });
    }
  });
  frames[frames.length - 1]!.hold = 3200;
  return frames;
}

function Dots() {
  return (
    <span className="flex items-center gap-1 py-1.5">
      {[0, 1, 2].map((dot) => (
        <span
          key={dot}
          className="bg-muted-foreground block size-1.5 rounded-full [animation:cf-typing-dot_1.1s_ease-in-out_infinite]"
          style={{ animationDelay: `${dot * 140}ms` }}
        />
      ))}
    </span>
  );
}

/**
 * One line of the thread. The row opens its own height, so the lines above
 * slide up to make room the way a real chat does, and the bubble pops out of
 * the corner its tail would be on.
 */
function Row({ open, side, children }: { open: boolean; side: "left" | "right" | "center"; children: React.ReactNode }) {
  return (
    <div
      className={cn("grid transition-[grid-template-rows] duration-300 motion-reduce:transition-none", EASE)}
      style={{ gridTemplateRows: open ? "1fr" : "0fr" }}
    >
      <div className="min-h-0 overflow-hidden">
        <div
          className={cn(
            "flex pt-2.5 transition-[opacity,transform] duration-300 motion-reduce:transition-none",
            EASE,
            side === "left" && "origin-bottom-left justify-start",
            side === "right" && "origin-bottom-right justify-end",
            side === "center" && "origin-bottom justify-center",
            open ? "opacity-100" : "translate-y-3 scale-90 opacity-0",
          )}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

export function ChatFilm({
  name,
  lines,
  className,
  children,
}: {
  /** The form's name, in the window's header. */
  name: string;
  lines: readonly ChatLine[];
  className?: string;
  /** Drawn beside the chat, told which line the form is replying to. */
  children?: (state: { answering: number | undefined; shown: number }) => React.ReactNode;
}) {
  const frames = useMemo(() => framesFor(lines), [lines]);
  const holds = useMemo(() => frames.map((f) => f.hold), [frames]);
  const [ref, index, live] = useFrames(holds);
  const frame = frames[index]!;
  const composing = frame.composing !== undefined ? lines[frame.composing]! : undefined;
  const sent = index > 0 && frames[index - 1]!.composing !== undefined;

  return (
    <div ref={ref} aria-hidden className={className}>
      {children?.({ answering: frame.dots, shown: frame.shown })}
      <Stage className="flex h-[24rem] flex-col overflow-hidden">
        <div className="border-border/60 flex items-center gap-2.5 border-b px-4 py-3">
          <span className="bg-primary text-primary-foreground font-display grid size-7 shrink-0 place-items-center rounded-full text-xs font-semibold">
            {name[0]}
          </span>
          <p className="min-w-0 flex-1 truncate text-sm font-medium">{name}</p>
          <span className="flex items-center gap-1.5 text-xs text-[var(--family-choice-ink)]">
            <span className="size-1.5 rounded-full bg-current" />
            Live
          </span>
        </div>

        <div className="flex min-h-0 flex-1 flex-col justify-end overflow-hidden px-4 pb-3">
          {lines.map((line, i) => {
            const shown = frame.shown > i;
            if (line.from === "note") {
              return (
                <Row key={i} open={shown} side="center">
                  <span className="bg-muted text-foreground inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium">
                    <span className="grid size-4 place-items-center rounded-full bg-[var(--family-choice-ink)] text-[var(--background)]">
                      <Check className="size-2.5" strokeWidth={3.5} />
                    </span>
                    {line.text}
                  </span>
                </Row>
              );
            }
            if (line.from === "user") {
              return (
                <Row key={i} open={shown} side="right">
                  <ChatBubble from="user" className="text-sm">
                    {line.text}
                  </ChatBubble>
                </Row>
              );
            }
            const dots = frame.dots === i;
            return (
              <Row key={i} open={shown || dots} side="left">
                {/* Dots and reply share a cell: the dots hold the reply's room. */}
                <div className="grid max-w-[85%]">
                  <div className={cn("self-end justify-self-start transition-opacity duration-150 [grid-area:1/1]", dots ? "opacity-100" : "opacity-0")}>
                    <ChatBubble from="bot" className="max-w-none">
                      <Dots />
                    </ChatBubble>
                  </div>
                  <div
                    className={cn(
                      "flex origin-bottom-left flex-col items-start gap-1.5 transition-[opacity,transform] duration-300 [grid-area:1/1] motion-reduce:transition-none",
                      EASE,
                      shown ? "opacity-100" : "scale-95 opacity-0",
                    )}
                  >
                    <ChatBubble from="bot" className="max-w-none text-sm">
                      {line.text}
                    </ChatBubble>
                    {line.chip ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-[var(--family-scale-soft)] px-2 py-0.5 text-[0.6875rem] font-semibold text-[var(--family-scale-ink)]">
                        <BookOpen className="size-3" strokeWidth={2} />
                        {line.chip}
                      </span>
                    ) : null}
                  </div>
                </div>
              </Row>
            );
          })}
        </div>

        <div className="border-border/60 flex items-center gap-2 border-t px-4 py-2.5">
          <p className="min-w-0 flex-1 truncate text-sm">
            {composing && live ? (
              <span
                key={frame.composing}
                className="inline-block"
                style={{ animation: `cf-type-reveal ${composing.text.length * 26}ms steps(${composing.text.length}) 120ms both` }}
              >
                {composing.text}
              </span>
            ) : (
              <span className="text-muted-foreground">Type your answer…</span>
            )}
          </p>
          <span
            className={cn(
              "grid size-7 shrink-0 place-items-center rounded-full transition-[transform,background-color,color] duration-150 ease-out",
              composing ? "bg-primary text-on-primary" : "bg-muted text-muted-foreground",
              sent && "scale-90",
            )}
          >
            <ArrowUp className="size-3.5" strokeWidth={2.5} />
          </span>
        </div>
      </Stage>
    </div>
  );
}

const THIN: readonly ChatLine[] = [
  { from: "bot", text: "What went wrong with the last tool you tried?" },
  { from: "user", text: "it was bad" },
  { from: "bot", text: "Bad how? The price, or something it couldn’t do?" },
  { from: "user", text: "the price. $90 a seat for four of us" },
  { from: "note", text: "Recorded: too expensive, $90 per seat" },
];

/** A thin answer, the question that will not accept it, and what gets recorded. */
export function ThinAnswerDemo() {
  return (
    <div className="flex h-full items-center justify-center px-5 py-8 sm:px-8">
      <ChatFilm name="Product feedback" lines={THIN} className="w-full max-w-[25rem]" />
    </div>
  );
}

// ── the follow-up flow ───────────────────────────────────────────────────

/* 0 she leaves · 1 the email goes out · 2 she taps it · 3 finished */
const FLOW_HOLDS = [1300, 1700, 1300, 3400] as const;

/** One step of the flow: a node on the rail, the line down to the next, and what happened. */
function Step({
  on,
  drawn,
  last,
  tone,
  icon: Icon,
  when,
  title,
  children,
}: {
  on: boolean;
  /** The line below this node has reached the next one. */
  drawn?: boolean;
  last?: boolean;
  tone: "number" | "text" | "scale" | "choice";
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  when: string;
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <li className="flex gap-3.5">
      <div className="flex flex-col items-center">
        <span
          className={cn("grid size-8 shrink-0 place-items-center rounded-full transition-[opacity,transform] duration-300 motion-reduce:transition-none", EASE, on ? "opacity-100" : "scale-75 opacity-0")}
          style={{ background: `var(--family-${tone}-soft)`, color: `var(--family-${tone}-ink)` }}
        >
          <Icon className="size-4" strokeWidth={2} />
        </span>
        {last ? null : (
          <span className="bg-border relative my-1 w-0.5 flex-1 overflow-hidden rounded-full">
            <span
              className="absolute inset-0 origin-top rounded-full transition-transform duration-500 ease-[cubic-bezier(0.77,0,0.175,1)] motion-reduce:transition-none"
              style={{ background: `var(--family-${tone}-ink)`, transform: `scaleY(${drawn ? 1 : 0})` }}
            />
          </span>
        )}
      </div>
      <div
        className={cn(
          "min-w-0 flex-1 transition-[opacity,transform] delay-100 duration-300 motion-reduce:transition-none",
          EASE,
          last ? "pb-0" : "pb-4",
          on ? "opacity-100" : "translate-y-2 opacity-0",
        )}
      >
        <p className="text-muted-foreground text-[0.6875rem] font-bold tracking-[0.08em] uppercase">{when}</p>
        <p className="mt-0.5 text-sm leading-snug font-semibold">{title}</p>
        {children}
      </div>
    </li>
  );
}

/** What happens when someone leaves halfway, top to bottom. */
export function FollowUpDemo() {
  const [ref, frame] = useFrames(FLOW_HOLDS);
  return (
    <div ref={ref} aria-hidden className="flex h-full items-center justify-center px-5 py-8 sm:px-8">
      <Stage className="max-w-[25rem] p-5">
        <ol>
          <Step on tone="number" icon={LogOut} when="Monday, 10:02" title="Maya leaves at question 4 of 6" drawn={frame >= 1}>
            <p className="text-muted-foreground mt-0.5 text-xs">Her four answers are saved.</p>
          </Step>
          <Step on={frame >= 1} tone="text" icon={Mail} when="4 hours later" title="chatform emails her a way back" drawn={frame >= 2}>
            <div className="border-border/70 bg-card mt-2 flex items-center gap-3 rounded-xl border px-3 py-2">
              <p className="min-w-0 flex-1 truncate text-xs">
                <span className="font-semibold">Two questions left</span>
              </p>
              <span
                className={cn(
                  "bg-primary text-on-primary inline-flex h-6 shrink-0 items-center rounded-full px-2.5 text-[0.6875rem] font-semibold transition-transform duration-150 ease-out",
                  frame === 2 && "scale-[0.94]",
                )}
              >
                Continue
              </span>
            </div>
          </Step>
          <Step on={frame >= 2} tone="scale" icon={MousePointerClick} when="That evening" title="She opens it at question 5" drawn={frame >= 3}>
            <p className="text-muted-foreground mt-0.5 text-xs">Nothing to fill in again.</p>
          </Step>
          <Step on={frame >= 3} last tone="choice" icon={Check} when="Two minutes later" title="Finished: 6 of 6 answered">
            <div className="bg-muted mt-2 h-1.5 overflow-hidden rounded-full">
              <div
                className="h-full origin-left rounded-full bg-[var(--family-choice-ink)] transition-transform delay-200 duration-700 ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-none"
                style={{ transform: `scaleX(${frame >= 3 ? 1 : 4 / 6})` }}
              />
            </div>
          </Step>
        </ol>
        <p className="text-muted-foreground border-border/70 mt-4 flex items-center gap-1.5 border-t pt-3 text-xs">
          <Clock className="size-3.5 shrink-0" strokeWidth={2} />
          No reply? It tries again after a day.
        </p>
      </Stage>
    </div>
  );
}

// ── the knowledge-base film ──────────────────────────────────────────────

const SOURCES = [
  { icon: FileText, name: "Pricing.pdf" },
  { icon: FileText, name: "Onboarding.pdf" },
  { icon: Link2, name: "FAQ page" },
] as const;

/** The line that gets answered from the docs, and the doc it comes from. */
const ANSWER_LINE = 2;
const ANSWER_SOURCE = 1;

const ASKS: readonly ChatLine[] = [
  { from: "bot", text: "Almost done. Where should I send your invite?" },
  { from: "user", text: "wait, how long does onboarding take?" },
  { from: "bot", text: "About two weeks. Your first workspace is live in three days.", chip: "From Onboarding.pdf" },
  { from: "bot", text: "So, where should I send your invite?" },
  { from: "user", text: "maya@northwind.co" },
  { from: "note", text: "Email recorded" },
];

/** A respondent asks something back; the answer comes out of the owner's docs. */
export function AnswersBackDemo() {
  return (
    <ChatFilm name="Northwind onboarding" lines={ASKS} className="grid w-full max-w-[25rem] gap-3 sm:max-w-none sm:grid-cols-[12.5rem_minmax(0,25rem)] sm:justify-center sm:items-center">
      {({ answering, shown }) => {
        const reading = answering === ANSWER_LINE;
        const used = shown > ANSWER_LINE;
        return (
          <Stage className="p-3.5">
            <p className="text-muted-foreground flex items-center gap-1.5 text-[0.6875rem] font-bold tracking-[0.08em] uppercase">
              <BookOpen className="size-3.5" strokeWidth={2} />
              Knowledge base
            </p>
            <ul className="mt-2.5 flex flex-col gap-1.5">
              {SOURCES.map((s, i) => {
                const hit = i === ANSWER_SOURCE && (reading || used);
                return (
                  <li
                    key={s.name}
                    className={cn(
                      "flex items-center gap-2 rounded-lg border px-2.5 py-2 text-xs font-medium transition-[background-color,border-color,color,transform] duration-300",
                      EASE,
                      hit
                        ? "border-transparent bg-[var(--family-scale-soft)] text-[var(--family-scale-ink)]"
                        : "border-border/70 text-muted-foreground",
                      hit && reading && "scale-[1.03]",
                    )}
                  >
                    <s.icon className="size-3.5 shrink-0" strokeWidth={2} />
                    <span className="min-w-0 flex-1 truncate">{s.name}</span>
                    <Check className={cn("size-3.5 shrink-0 transition-opacity duration-200", hit && used ? "opacity-100" : "opacity-0")} strokeWidth={3} />
                  </li>
                );
              })}
            </ul>
          </Stage>
        );
      }}
    </ChatFilm>
  );
}
