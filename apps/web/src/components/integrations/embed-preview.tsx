"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowUp, Lock, MessageCircle, RotateCcw } from "lucide-react";
import type { Block, ThemeDoc } from "@repo/form-schema";
import { chatThemeVars } from "@/lib/chat-theme";
import { isOverlay, type EmbedConfig } from "@/lib/embed-snippet";
import { cn } from "@/lib/utils";

/**
 * What the embed looks like on somebody else's page.
 *
 * The corner, the colour and the size of the panel are the whole decision being
 * made here, and every one of them is a spatial question that a form full of
 * selects answers badly. So the controls drive a picture.
 *
 * Two rules keep the picture honest:
 *
 *  1. The stage is a real viewport — 1280×800, or a phone's 390×844 — scaled as
 *     one block. A 20px offset is 20 real pixels here, so the preview cannot
 *     quietly disagree with the snippet beside it. Every placement rule below
 *     (the launcher clearance, the popup's max-height, the ≤520px takeover) is
 *     the rule `public/embed.js` actually ships.
 *  2. The conversation is the form's own conversation — its theme through
 *     `chatThemeVars`, its first questions, its accent — not a stack of grey
 *     bars under a coloured header the runtime has never drawn. The launcher
 *     colour is the launcher's; the panel is whatever the form's theme says.
 */

export type PreviewDevice = "desktop" | "mobile";

const STAGES: Record<PreviewDevice, { width: number; height: number }> = {
  desktop: { width: 1280, height: 800 },
  mobile: { width: 390, height: 844 },
};

/** `embed.js`: a phone gets the whole screen, whatever the panel size says. */
const MOBILE_TAKEOVER = 520;
/** `embed.js`: the launcher is ~48px tall plus its own gap. */
const LAUNCHER_CLEARANCE = 68;

export function EmbedPreview({
  config,
  formTitle,
  theme,
  blocks,
  device,
  open,
  onToggle,
  className,
}: {
  config: EmbedConfig;
  formTitle: string;
  theme: ThemeDoc;
  blocks: Block[];
  device: PreviewDevice;
  open: boolean;
  onToggle: () => void;
  className?: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState({ width: 0, height: 0 });
  const stage = STAGES[device];

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (rect) setFit({ width: rect.width, height: rect.height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Fit both axes: a stage that overflows its pane is a preview whose corners —
  // the only thing this control is for — are off screen.
  const scale = Math.min(
    fit.width > 0 ? fit.width / stage.width : 0.5,
    fit.height > 0 ? fit.height / stage.height : 0.5,
  );

  const vertical = config.position.startsWith("top") ? "top" : "bottom";
  const horizontal = config.position.endsWith("left") ? "left" : "right";
  const clearance = config.offset + LAUNCHER_CLEARANCE;
  const takeover = stage.width <= MOBILE_TAKEOVER;

  const panelBox: React.CSSProperties = takeover
    ? { inset: 0, borderRadius: 0 }
    : config.mode === "side-tab"
      ? { top: 0, bottom: 0, [horizontal]: 0, width: Math.min(config.width, stage.width) }
      : {
          [vertical]: clearance,
          [horizontal]: config.offset,
          width: Math.min(config.width, stage.width - config.offset * 2),
          height: config.height,
          maxHeight: stage.height - clearance - config.offset,
          borderRadius: 16,
        };

  return (
    <div ref={box} className={cn("relative min-h-0 w-full flex-1", className)}>
      <div
        className="absolute top-1/2 left-1/2 origin-center"
        style={{
          width: stage.width,
          height: stage.height,
          transform: `translate(-50%, -50%) scale(${scale})`,
        }}
      >
        <Chrome device={device} title={formTitle}>
          {/* The page scrolls inside the viewport, the way a page does — so a
              1200px inline embed is tall, not clipped. */}
          <div className="h-full w-full overflow-y-auto">
            <MockPage
              narrow={device === "mobile"}
              inline={
                config.mode === "inline" ? (
                  <div
                    className="w-full overflow-hidden rounded-2xl border border-black/10 shadow-sm"
                    style={{ height: config.autoHeight ? 620 : config.height }}
                  >
                    <MockConversation
                      title={formTitle}
                      theme={theme}
                      blocks={blocks}
                      compact={device === "mobile"}
                    />
                  </div>
                ) : null
              }
            />
          </div>

          {config.mode === "fullpage" && (
            <div className="absolute inset-0">
              <MockConversation
                title={formTitle}
                theme={theme}
                blocks={blocks}
                compact={device === "mobile"}
              />
            </div>
          )}

          {isOverlay(config.mode) && (
            <>
              {open && (
                <div
                  className="absolute overflow-hidden"
                  style={{ ...panelBox, boxShadow: "0 12px 48px rgba(0,0,0,.22)" }}
                  aria-hidden
                >
                  <MockConversation
                    title={formTitle}
                    theme={theme}
                    blocks={blocks}
                    compact={takeover || config.width < 380}
                  />
                </div>
              )}

              {/*
                A real button, so the corner can be checked by clicking it rather
                than by reading the snippet and imagining the result. Its metrics
                are `embed.js`'s `.cf-launcher` rule, to the pixel.
              */}
              <button
                type="button"
                onClick={onToggle}
                aria-label={open ? "Close the panel" : "Open the panel"}
                className={cn(
                  "absolute inline-flex cursor-pointer items-center gap-2 border-0 text-white",
                  config.label ? "rounded-full px-[18px] py-3" : "size-14 justify-center rounded-full",
                )}
                style={{
                  [vertical]: config.offset,
                  [horizontal]: config.offset,
                  background: config.color,
                  boxShadow: "0 6px 24px rgba(0,0,0,.18)",
                  fontSize: 15,
                  fontWeight: 500,
                  lineHeight: 1,
                }}
              >
                {config.icon && <MessageCircle className="size-[18px] shrink-0" strokeWidth={2} />}
                {config.label}
              </button>
            </>
          )}
        </Chrome>
      </div>
    </div>
  );
}

/**
 * The device around the viewport.
 *
 * Drawn inside the scaled stage rather than around it, so the whole thing —
 * frame and page — shrinks as one object and the widget keeps its true
 * proportion against the window it is sitting in.
 */
function Chrome({
  device,
  title,
  children,
}: {
  device: PreviewDevice;
  title: string;
  children: React.ReactNode;
}) {
  if (device === "mobile") {
    return (
      <div className="relative h-full w-full overflow-hidden rounded-[44px] bg-white ring-[10px] ring-neutral-900">
        <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex h-11 items-center justify-between px-7 text-[13px] font-semibold text-neutral-800">
          <span>9:41</span>
          <span className="absolute left-1/2 h-6 w-28 -translate-x-1/2 rounded-full bg-neutral-900" />
          <span className="flex items-center gap-1">
            <span className="h-2.5 w-4 rounded-[3px] border border-neutral-800" />
          </span>
        </div>
        <div className="absolute inset-0 top-11">{children}</div>
      </div>
    );
  }

  return (
    <div className="relative h-full w-full overflow-hidden rounded-2xl bg-white ring-1 ring-black/10">
      <div className="absolute inset-x-0 top-0 z-20 flex h-11 items-center gap-3 border-b border-neutral-200 bg-neutral-100 px-4">
        <div className="flex gap-1.5">
          {["#ff5f57", "#febc2e", "#28c840"].map((hex) => (
            <span key={hex} className="size-3 rounded-full" style={{ background: hex }} />
          ))}
        </div>
        <div className="mx-auto flex h-6 w-[380px] items-center justify-center gap-1.5 rounded-md bg-white text-[12px] text-neutral-500 ring-1 ring-black/5">
          <Lock className="size-3" strokeWidth={2.25} />
          yoursite.com
        </div>
        <div className="w-14" aria-hidden>
          <span className="sr-only">{title}</span>
        </div>
      </div>
      <div className="absolute inset-0 top-11">{children}</div>
    </div>
  );
}

/**
 * The page the form is going onto.
 *
 * Real type at real sizes rather than grey bars: a wireframe of skeleton blocks
 * reads as a page that has not finished loading, which is the wrong thing to
 * judge a widget's contrast and placement against.
 */
function MockPage({ narrow, inline }: { narrow: boolean; inline: React.ReactNode | null }) {
  return (
    <div className="min-h-full w-full bg-white text-neutral-900">
      <header
        className={cn(
          "flex items-center border-b border-neutral-200/80",
          narrow ? "h-14 gap-3 px-5" : "h-16 gap-8 px-12",
        )}
      >
        <div className="flex items-center gap-2">
          <span className="grid size-7 place-items-center rounded-lg bg-neutral-900 text-[13px] font-bold text-white">
            N
          </span>
          <span className="text-[15px] font-semibold tracking-tight">Northwind</span>
        </div>
        {!narrow && (
          <>
            <nav className="flex gap-6 text-[14px] text-neutral-500">
              <span>Product</span>
              <span>Customers</span>
              <span>Pricing</span>
              <span>Docs</span>
            </nav>
            <span className="ml-auto rounded-lg bg-neutral-900 px-3.5 py-2 text-[13px] font-medium text-white">
              Get started
            </span>
          </>
        )}
      </header>

      <div className={cn("mx-auto w-full", narrow ? "max-w-none px-5 py-8" : "max-w-[1040px] px-12 py-14")}>
        <p className="text-[13px] font-medium tracking-wide text-neutral-400 uppercase">
          Customer research
        </p>
        <h1
          className={cn(
            "mt-3 font-semibold tracking-[-0.02em] text-neutral-900",
            narrow ? "text-[30px] leading-[1.15]" : "text-[46px] leading-[1.08]",
          )}
        >
          Everything your team ships,
          <br />
          in one place.
        </h1>
        <p
          className={cn(
            "mt-4 max-w-[54ch] text-neutral-500",
            narrow ? "text-[15px] leading-relaxed" : "text-[17px] leading-[1.6]",
          )}
        >
          Plans, docs and decisions, together — so the answer to “why did we do it this way?” is
          never somebody&apos;s memory.
        </p>

        {inline ? (
          <div className="mt-10">{inline}</div>
        ) : (
          <div className={cn("mt-12 grid gap-5", narrow ? "grid-cols-1" : "grid-cols-3")}>
            {[
              ["Roadmaps", "Plan the quarter where the work already lives."],
              ["Docs", "Write it down once and link it everywhere."],
              ["Insights", "See what changed, and who it changed for."],
            ].map(([title, blurb]) => (
              <div key={title} className="rounded-2xl border border-neutral-200/80 p-5">
                <span className="block size-8 rounded-lg bg-neutral-100" />
                <p className="mt-4 text-[15px] font-semibold">{title}</p>
                <p className="mt-1.5 text-[13.5px] leading-relaxed text-neutral-500">{blurb}</p>
              </div>
            ))}
          </div>
        )}

        <div className="mt-14 border-t border-neutral-200/80 pt-6 text-[13px] text-neutral-400">
          © Northwind, Inc.
        </div>
      </div>
    </div>
  );
}

/**
 * The form's own conversation, mid-answer.
 *
 * Rendered through `chatThemeVars` — the same function the hosted runtime and
 * the builder preview use — so the panel in this picture is the panel a
 * respondent gets, down to the bubble radius.
 */
function MockConversation({
  title,
  theme,
  blocks,
  compact,
}: {
  title: string;
  theme: ThemeDoc;
  blocks: Block[];
  compact: boolean;
}) {
  const script = useMemo(() => conversationScript(blocks), [blocks]);
  const pad = compact ? "px-4" : "px-5";

  return (
    <div className="chat-surface flex h-full flex-col overflow-hidden" style={chatThemeVars(theme)}>
      <header className="shrink-0">
        <div className={cn("flex items-center gap-3 py-3", pad)}>
          <div className="grid size-8 shrink-0 place-items-center rounded-xl bg-[var(--cf-accent)] text-sm font-semibold text-[var(--cf-accent-text)]">
            {(theme.brandName || title || "F").charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{title}</p>
            <p className="text-xs opacity-60">Question 2 of {Math.max(script.total, 2)}</p>
          </div>
          <RotateCcw className="size-4 shrink-0 opacity-40" />
        </div>
        <div className="h-0.5 bg-[var(--cf-chip-border)]/40">
          <div
            className="h-full bg-[var(--cf-accent)]"
            style={{ width: `${Math.round((1 / Math.max(script.total, 2)) * 100)}%` }}
          />
        </div>
      </header>

      <div className={cn("min-h-0 flex-1 space-y-3 overflow-hidden py-4", pad)}>
        <Bubble role="bot" compact={compact}>
          {script.first}
        </Bubble>
        <Bubble role="user" compact={compact}>
          {script.answer}
        </Bubble>
        <Bubble role="bot" compact={compact}>
          {script.second}
        </Bubble>
        {script.chips.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-0.5">
            {script.chips.map((chip) => (
              <span
                key={chip}
                className="rounded-full border border-[var(--cf-chip-border)] bg-[var(--cf-chip-bg)] px-3.5 py-2 text-sm"
              >
                {chip}
              </span>
            ))}
          </div>
        )}
      </div>

      <footer className="shrink-0">
        <div className={cn("flex items-center gap-2 py-3", pad)}>
          <div className="h-11 flex-1 rounded-2xl border border-[var(--cf-chip-border)] bg-[var(--cf-composer-bg)] px-4 text-[0.9375rem] leading-[2.75rem] opacity-50">
            {script.placeholder}
          </div>
          <span className="grid size-11 shrink-0 place-items-center rounded-full bg-[var(--cf-accent)] text-[var(--cf-accent-text)]">
            <ArrowUp className="size-4" strokeWidth={2.5} />
          </span>
        </div>
        <p className="pb-2 text-center text-[0.6875rem] opacity-40">Powered by chatform</p>
      </footer>
    </div>
  );
}

function Bubble({
  role,
  compact,
  children,
}: {
  role: "bot" | "user";
  compact: boolean;
  children: React.ReactNode;
}) {
  const isUser = role === "user";
  return (
    <div className={cn("flex", isUser ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "px-4 py-2.5 leading-relaxed",
          compact ? "max-w-[92%] text-[0.875rem]" : "max-w-[85%] text-[0.9375rem]",
          isUser ? "bubble-user" : "bubble-bot border",
        )}
        style={
          isUser
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
        {children}
      </div>
    </div>
  );
}

/**
 * Two real questions and a plausible answer between them.
 *
 * The answer is invented — nobody has filled this in yet — but the questions
 * are not, and that is the difference between a preview you can judge line
 * length by and one made of lorem bars.
 */
function conversationScript(blocks: Block[]): {
  first: string;
  answer: string;
  second: string;
  chips: string[];
  placeholder: string;
  total: number;
} {
  const asked = blocks.filter((b) => b.type !== "statement");
  const [one, two] = asked;

  const first = one?.title?.trim() || "Hi! Mind if I ask a couple of quick questions?";
  const second = two?.title?.trim() || "And what should we call you?";

  return {
    first,
    answer: sampleAnswer(one),
    second,
    chips: choiceLabels(two).slice(0, 3),
    placeholder: two && choiceLabels(two).length > 0 ? "Or type your own…" : "Type your answer…",
    total: asked.filter((b) => b.type !== "welcome").length || 2,
  };
}

function choiceLabels(block: Block | undefined): string[] {
  if (!block) return [];
  if (block.type === "yes_no") return [block.yesLabel || "Yes", block.noLabel || "No"];
  if ("options" in block && Array.isArray(block.options)) {
    return block.options.map((o) => o.label).filter(Boolean);
  }
  return [];
}

/** A believable answer for the block's type — never a real response. */
function sampleAnswer(block: Block | undefined): string {
  if (!block) return "Sure, go ahead";
  const choices = choiceLabels(block);
  if (choices.length > 0) return choices[0]!;
  switch (block.type) {
    case "welcome":
      return "Let's go";
    case "email":
      return "ada@northwind.com";
    case "phone":
      return "+1 415 555 0132";
    case "url":
      return "northwind.com";
    case "number":
      return "12";
    case "date":
      return "14 March";
    case "rating":
    case "opinion_scale":
      return "★★★★☆";
    case "nps":
      return "9";
    case "long_text":
      return "Mostly the handoff between design and engineering — it always takes a week longer than we plan for.";
    default:
      return "Ada Lovelace";
  }
}
