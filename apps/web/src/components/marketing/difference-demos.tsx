"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Mail } from "lucide-react";
import { ChatBubble } from "@/components/chat/chat-bubble";
import { cn } from "@/lib/utils";

/**
 * The two small films in "How is this different from other forms?".
 *
 * Each is a handful of steps on a timer that plays while its card is on
 * screen and starts again from the top after a pause. Everything is laid out
 * in its final position from the start and only fades and settles in, so
 * nothing in the card moves when a step lands.
 *
 * The server renders the last step, the finished picture. Only a browser with
 * motion allowed rewinds it and plays, so reduced motion and no-JS both get
 * the whole exchange, still.
 */
function useSteps(holds: readonly number[]) {
  const ref = useRef<HTMLDivElement>(null);
  const [step, setStep] = useState(holds.length - 1);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let i = 0;
    const tick = () => {
      timer = setTimeout(() => {
        i = (i + 1) % holds.length;
        setStep(i);
        tick();
      }, holds[i]);
    };
    const io = new IntersectionObserver(
      ([entry]) => {
        clearTimeout(timer);
        if (entry?.isIntersecting) tick();
        else {
          // Rewound while it is off screen, so it opens on its first frame.
          i = 0;
          setStep(0);
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

  return [ref, step] as const;
}

const ENTER = "transition-[opacity,transform] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none";

function Appear({ on, from = "below", className, children }: { on: boolean; from?: "below" | "left" | "right"; className?: string; children: React.ReactNode }) {
  const away = from === "left" ? "-translate-x-3" : from === "right" ? "translate-x-3" : "translate-y-2.5";
  return <div className={cn(ENTER, on ? "opacity-100" : `opacity-0 ${away} scale-[0.97]`, className)}>{children}</div>;
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

/** The window both films sit in: the chat's own surface, so the bubbles are the real ones. */
function Stage({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("chat-surface bg-background border-border/70 w-full max-w-[26rem] rounded-2xl border shadow-[0_18px_45px_-26px_oklch(0.25_0.02_65/0.45)]", className)}>
      {children}
    </div>
  );
}

/* 0 question · 1 thin answer · 2 typing · 3 follow-up · 4 real answer · 5 recorded */
const THIN_HOLDS = [900, 1100, 1000, 1700, 1300, 3600] as const;

/** A thin answer, the question that will not accept it, and what gets recorded. */
export function ThinAnswerDemo() {
  const [ref, step] = useSteps(THIN_HOLDS);
  return (
    <div ref={ref} aria-hidden className="flex h-full items-center justify-center px-5 py-8 sm:px-8">
      <Stage className="flex flex-col gap-2.5 p-4 sm:p-5">
        <ChatBubble from="bot" className="self-start text-sm">
          What went wrong with the last tool you tried?
        </ChatBubble>
        <Appear on={step >= 1} from="right" className="self-end">
          <ChatBubble from="user" className="max-w-none text-sm">
            it was bad
          </ChatBubble>
        </Appear>
        {/* Dots and reply share a cell, so the dots hold the reply's room. */}
        <div className="grid">
          <div className={cn(ENTER, "self-start justify-self-start [grid-area:1/1]", step === 2 ? "opacity-100" : "opacity-0")}>
            <ChatBubble from="bot" className="max-w-none">
              <Dots />
            </ChatBubble>
          </div>
          <Appear on={step >= 3} from="left" className="justify-self-start [grid-area:1/1]">
            <ChatBubble from="bot" className="text-sm">
              Bad how? The price, or something it couldn&rsquo;t do?
            </ChatBubble>
          </Appear>
        </div>
        <Appear on={step >= 4} from="right" className="self-end">
          <ChatBubble from="user" className="max-w-none text-sm">
            the price. $90 a seat for four of us
          </ChatBubble>
        </Appear>
        <Appear on={step >= 5} className="border-border/70 mt-1.5 flex items-center gap-2.5 border-t pt-3.5">
          <span className="grid size-5 shrink-0 place-items-center rounded-full bg-[var(--family-choice-soft)] text-[var(--family-choice-ink)]">
            <Check className="size-3" strokeWidth={3} />
          </span>
          <p className="text-xs">
            <span className="text-muted-foreground">Recorded as </span>
            <span className="font-semibold">Too expensive, $90 per seat</span>
          </p>
        </Appear>
      </Stage>
    </div>
  );
}

const REMINDERS = ["4 hours", "1 day", "3 days"] as const;

/* 0 left halfway · 1 the wait · 2 email lands · 3 they tap it · 4 finished */
const FOLLOW_HOLDS = [1400, 1100, 1900, 700, 3800] as const;

/** Someone leaves at question four, an email goes out, and the response completes. */
export function FollowUpDemo() {
  const [ref, step] = useSteps(FOLLOW_HOLDS);
  const done = step >= 4;
  return (
    <div ref={ref} aria-hidden className="flex h-full items-center justify-center px-5 py-8 sm:px-8">
      <div className="flex w-full max-w-[26rem] flex-col gap-3">
        <Stage className="p-4">
          <div className="flex items-center gap-3">
            <span className="font-display grid size-9 shrink-0 place-items-center rounded-full bg-[var(--family-choice-soft)] text-sm font-semibold text-[var(--family-choice-ink)]">
              M
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">Maya Chen</p>
              <p className="text-muted-foreground text-xs">{done ? "Answered all 6 questions" : "Left at question 4 of 6"}</p>
            </div>
            <span
              className={cn(
                "rounded-full px-2.5 py-1 text-[0.6875rem] font-bold tracking-wide uppercase transition-colors duration-500",
                done ? "bg-[var(--family-choice-soft)] text-[var(--family-choice-ink)]" : "bg-[var(--family-number-soft)] text-[var(--family-number-ink)]",
              )}
            >
              {done ? "Finished" : "Partial"}
            </span>
          </div>
          <div className="bg-muted mt-3.5 h-1.5 overflow-hidden rounded-full">
            <div
              className="h-full origin-left rounded-full transition-[transform,background-color] duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none"
              style={{
                transform: `scaleX(${done ? 1 : 4 / 6})`,
                background: done ? "var(--family-choice-ink)" : "var(--family-number-ink)",
              }}
            />
          </div>
        </Stage>

        <ol className="flex items-center justify-center gap-1.5 text-xs font-medium">
          {REMINDERS.map((r, i) => (
            <li
              key={r}
              className={cn(
                "rounded-full border px-2.5 py-1 transition-colors duration-500",
                i === 0 && step >= 1
                  ? "border-transparent bg-[var(--family-choice-ink)] text-[var(--background)]"
                  : "bg-background/70 text-muted-foreground",
                i === 2 && "border-dashed",
              )}
            >
              {r}
            </li>
          ))}
        </ol>

        <Appear on={step >= 2}>
          <Stage className="p-4">
            <div className="flex items-center gap-2.5">
              <span className="bg-primary-soft text-primary-soft-foreground grid size-7 shrink-0 place-items-center rounded-lg">
                <Mail className="size-3.5" strokeWidth={2} />
              </span>
              <p className="min-w-0 flex-1 truncate text-xs">
                <span className="font-semibold">Northwind</span>
                <span className="text-muted-foreground"> · to maya@studio.co</span>
              </p>
            </div>
            <p className="mt-3 text-sm font-semibold">You were two questions away</p>
            <p className="text-muted-foreground mt-0.5 text-xs leading-relaxed">Your answers are saved. Pick up at question 5.</p>
            <span
              className={cn(
                "bg-primary text-on-primary mt-3 inline-flex h-8 items-center rounded-full px-3.5 text-xs font-semibold transition-transform duration-200",
                step === 3 && "scale-[0.94]",
              )}
            >
              Continue where I left off
            </span>
          </Stage>
        </Appear>
      </div>
    </div>
  );
}
