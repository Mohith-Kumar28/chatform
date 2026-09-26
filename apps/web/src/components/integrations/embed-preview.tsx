"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Lock, MessageCircle, RotateCcw, SendHorizontal, X } from "lucide-react";
import type { Block, ThemeDoc } from "@repo/form-schema";
import { chatThemeVars } from "@/lib/chat-theme";
import { useThemeFonts } from "@/lib/theme-fonts";
import { isOverlay, type EmbedConfig } from "@/lib/embed-snippet";
import { cn } from "@/lib/utils";
import { LogoMark } from "@/components/brand/logo";
import { useEntitlements } from "@/hooks/use-entitlements";

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

/** The browser bar and the phone's status bar are both 44px (`top-11`). */
const CHROME_BAR = 44;

/**
 * `embed.js`'s attention rules, verbatim, so the preview shakes the way a phone will.
 *
 * Then the studio's own two: `.cf-move` carries the launcher and the panel to a
 * new corner instead of teleporting them, and `.cf-flash` rings the launcher
 * once after any change to it, so the eye lands on what just moved. Under
 * reduced motion nothing slides and the ring fades in place.
 */
const ATTENTION_CSS = [
  ".cf-attn{overflow:hidden;animation:cf-shake .8s ease-in-out .2s 2,cf-ring 1.6s ease-out .2s 2}",
  ".cf-attn::after{content:'';position:absolute;top:0;bottom:0;left:0;width:50%;pointer-events:none;",
  "background:linear-gradient(105deg,transparent 0%,rgba(255,255,255,.3) 50%,transparent 100%);",
  "transform:translateX(-120%) skewX(-12deg);animation:cf-shine 2.5s ease-in-out .6s 4 both}",
  "@keyframes cf-shake{0%,100%{transform:none}15%{transform:rotate(-5deg)}35%{transform:rotate(4deg)}",
  "55%{transform:rotate(-3deg)}75%{transform:rotate(2deg)}}",
  "@keyframes cf-shine{0%{transform:translateX(-120%) skewX(-12deg)}50%,100%{transform:translateX(280%) skewX(-12deg)}}",
  "@keyframes cf-ring{0%{box-shadow:0 6px 24px rgba(0,0,0,.18),0 0 0 0 var(--cf-c)}",
  "100%{box-shadow:0 6px 24px rgba(0,0,0,.18),0 0 0 12px transparent}}",
  "@media (prefers-reduced-motion:reduce){.cf-attn{animation:cf-ring 1.6s ease-out .2s 2}.cf-attn::after{display:none}}",
  ".cf-move{transition:left .5s cubic-bezier(.22,1,.36,1),top .5s cubic-bezier(.22,1,.36,1),",
  "width .5s cubic-bezier(.22,1,.36,1),height .5s cubic-bezier(.22,1,.36,1)}",
  ".cf-flash{position:absolute;inset:0;border-radius:9999px;pointer-events:none;",
  "animation:cf-flash 1s cubic-bezier(.22,1,.36,1) .35s 2 both}",
  "@keyframes cf-flash{0%{box-shadow:0 0 0 0 color-mix(in srgb,var(--cf-c) 60%,transparent)}",
  "100%{box-shadow:0 0 0 40px color-mix(in srgb,var(--cf-c) 0%,transparent)}}",
  "@keyframes cf-flash-still{0%,60%{opacity:1}100%{opacity:0}}",
  "@media (prefers-reduced-motion:reduce){.cf-move{transition:none}",
  ".cf-flash{box-shadow:0 0 0 8px color-mix(in srgb,var(--cf-c) 45%,transparent);",
  "animation:cf-flash-still 1.6s ease-out both}}",
].join("");

export function EmbedPreview({
  config,
  formTitle,
  slug,
  theme,
  blocks,
  device,
  open,
  onToggle,
  className,
}: {
  config: EmbedConfig;
  formTitle: string;
  /** Seeds the background pattern — see `MockConversation`. */
  slug: string;
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

  /** The page area under the browser bar or the status bar. */
  const viewport = { width: stage.width, height: stage.height - CHROME_BAR };
  const vertical = config.position.startsWith("top") ? "top" : "bottom";
  const horizontal = config.position.endsWith("left") ? "left" : "right";
  const hasLauncher = config.launcher;
  const clearance = config.offset + (hasLauncher ? LAUNCHER_CLEARANCE : 0);
  const takeover = stage.width <= MOBILE_TAKEOVER;
  // `embed.js`'s `hostCloses()`: a desktop popup closes from the launcher.
  const launcherCloses = config.mode === "popup" && hasLauncher && !takeover;
  const showLauncher = isOverlay(config.mode) && hasLauncher && (!open || launcherCloses);

  /**
   * The launcher is placed by `top`/`left` in numbers rather than by
   * `bottom: 20px; right: 20px`, because a browser cannot animate from `top` to
   * `bottom`. Switching corners has to visibly travel, or the picture changes
   * somewhere the eye was not looking. That needs the launcher's own size,
   * which depends on its text, so it is measured.
   */
  const launcherRef = useRef<HTMLDivElement>(null);
  const [launcherSize, setLauncherSize] = useState<{ width: number; height: number } | null>(null);
  useEffect(() => {
    const el = launcherRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      // Layout size, which a CSS `scale` on an ancestor does not touch.
      const rect = entries[0]?.contentRect;
      if (rect) setLauncherSize({ width: rect.width, height: rect.height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [showLauncher]);

  const launcherBox: React.CSSProperties = launcherSize
    ? {
        left:
          horizontal === "left"
            ? config.offset
            : viewport.width - config.offset - launcherSize.width,
        top:
          vertical === "top"
            ? config.offset
            : viewport.height - config.offset - launcherSize.height,
      }
    : { [vertical]: config.offset, [horizontal]: config.offset };

  /**
   * A ring around the launcher after anything about it changes: its corner,
   * its gap, its text, its icon. Derived during render (React's "adjusting
   * state when a prop changes"), and the ring is keyed by the count so each
   * change restarts it.
   */
  const signature = [config.position, config.offset, config.label, config.icon, config.launcher].join("|");
  const [flash, setFlash] = useState({ signature, count: 0 });
  if (flash.signature !== signature) setFlash({ signature, count: flash.count + 1 });

  const panelWidth = Math.min(config.width, viewport.width - config.offset * 2);
  const panelHeight = Math.min(config.height, viewport.height - clearance - config.offset);
  const panelBox: React.CSSProperties = takeover
    ? { left: 0, top: 0, width: viewport.width, height: viewport.height, borderRadius: 0 }
    : config.mode === "side-tab"
      ? {
          top: 0,
          height: viewport.height,
          width: Math.min(config.width, viewport.width),
          left: horizontal === "left" ? 0 : viewport.width - Math.min(config.width, viewport.width),
        }
      : {
          left: horizontal === "left" ? config.offset : viewport.width - config.offset - panelWidth,
          top: vertical === "top" ? clearance : viewport.height - clearance - panelHeight,
          width: panelWidth,
          height: panelHeight,
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
          <style>{ATTENTION_CSS}</style>
          {/* The page scrolls inside the viewport, the way a page does — so a
              1200px inline embed is tall, not clipped. */}
          <div className="h-full w-full overflow-y-auto">
            <MockPage
              narrow={device === "mobile"}
              inline={
                config.mode === "inline" ? (
                  <div
                    className="w-full overflow-hidden rounded-2xl shadow-[0_12px_48px_rgba(0,0,0,.14)] ring-1 ring-black/10"
                    style={{ height: config.autoHeight ? 620 : config.height }}
                  >
                    <MockConversation
                      title={formTitle}
                      slug={slug}
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
                slug={slug}
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
                  className="cf-move absolute overflow-hidden"
                  style={{ ...panelBox, boxShadow: "0 12px 48px rgba(0,0,0,.22)" }}
                >
                  <MockConversation
                    title={formTitle}
                    slug={slug}
                    theme={theme}
                    blocks={blocks}
                    compact={takeover || config.width < 380}
                    onClose={launcherCloses ? undefined : onToggle}
                  />
                </div>
              )}

              {/*
                A real button, so the corner can be checked by clicking it rather
                than by reading the snippet and imagining the result. Its metrics
                are `embed.js`'s `.cf-launcher` rule, to the pixel.

                While the panel is up it does what `embed.js` does: a desktop
                popup's launcher becomes a round X (`.cf-x`), and a side tab or
                a phone hides it (`.cf-away`), because there the panel covers
                that corner and closes from its own header instead.
              */}
              {showLauncher && (
                <div
                  ref={launcherRef}
                  className={cn("absolute", launcherSize && "cf-move")}
                  style={{ ...launcherBox, ["--cf-c" as string]: config.color }}
                >
                  {flash.count > 0 && <span key={flash.count} aria-hidden className="cf-flash" />}
                  {launcherCloses && open ? (
                    <button
                      type="button"
                      onClick={onToggle}
                      aria-label="Close the panel"
                      className={cn(
                        "relative grid cursor-pointer place-items-center rounded-full border-0 text-white",
                        config.label ? "size-12" : "size-14",
                      )}
                      style={{
                        background: config.color,
                        boxShadow: "0 6px 24px rgba(0,0,0,.18)",
                      }}
                    >
                      <X className="size-5" strokeWidth={2.5} />
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={onToggle}
                      aria-label="Open the panel"
                      className={cn(
                        "relative inline-flex cursor-pointer items-center gap-2 border-0 whitespace-nowrap text-white",
                        // `embed.js`'s `.cf-attn`: an automatic open on a phone calls out instead.
                        device === "mobile" && config.openOn !== "click" && "cf-attn",
                        config.label
                          ? "rounded-full px-[18px] py-3"
                          : "size-14 justify-center rounded-full",
                      )}
                      style={{
                        background: config.color,
                        boxShadow: "0 6px 24px rgba(0,0,0,.18)",
                        ["--cf-c" as string]: config.color,
                        fontSize: 15,
                        fontWeight: 500,
                        lineHeight: 1,
                      }}
                    >
                      {config.icon && (
                        <MessageCircle className="size-[18px] shrink-0" strokeWidth={2} />
                      )}
                      {config.label}
                    </button>
                  )}
                </div>
              )}
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
 * proportion against the window it is sitting in. Kept quiet on purpose: no
 * traffic-light colours, nothing saturated but the form.
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
      <div className="bg-background relative h-full w-full overflow-hidden rounded-[44px] ring-[10px] ring-neutral-900">
        <div className="text-muted-foreground pointer-events-none absolute inset-x-0 top-0 z-20 flex h-11 items-center justify-between px-7 text-[13px] font-semibold">
          <span>9:41</span>
          <span className="absolute left-1/2 h-6 w-28 -translate-x-1/2 rounded-full bg-neutral-900" />
          <span className="h-2.5 w-4 rounded-[3px] border border-current" />
        </div>
        <div className="absolute inset-0 top-11">{children}</div>
      </div>
    );
  }

  return (
    <div className="bg-background ring-border relative h-full w-full overflow-hidden rounded-2xl ring-1">
      <div className="bg-muted/60 border-border/70 absolute inset-x-0 top-0 z-20 flex h-11 items-center gap-3 border-b px-4">
        <div className="flex gap-1.5" aria-hidden>
          {[0, 1, 2].map((i) => (
            <span key={i} className="bg-muted-foreground/20 size-3 rounded-full" />
          ))}
        </div>
        <div className="bg-background text-muted-foreground ring-border/60 mx-auto flex h-6 w-[380px] items-center justify-center gap-1.5 rounded-md text-[12px] ring-1">
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
 * The page the form is going onto, as a skeleton.
 *
 * It used to be a made-up marketing site with real headlines, and people read
 * it: the page competed with the form for attention, and it was not obvious
 * which part was theirs. Now it is flat, low-contrast blocks in the muted
 * token, so the form and its button are the only saturated things on screen.
 * Inline mode drops the form into the page flow where the cards would be.
 */
function MockPage({ narrow, inline }: { narrow: boolean; inline: React.ReactNode | null }) {
  const bar = "bg-muted block rounded-full";
  return (
    <div className="bg-background min-h-full w-full" aria-hidden={inline ? undefined : true}>
      <header
        className={cn(
          "border-border/50 flex items-center border-b",
          narrow ? "h-14 gap-3 px-5" : "h-16 gap-10 px-12",
        )}
      >
        <span className="bg-muted block size-7 rounded-lg" />
        {!narrow && (
          <div className="flex gap-6">
            {[64, 80, 56, 48].map((w) => (
              <span key={w} className={cn(bar, "h-2.5")} style={{ width: w }} />
            ))}
          </div>
        )}
        <span className={cn("bg-muted ml-auto block rounded-lg", narrow ? "size-7" : "h-9 w-28")} />
      </header>

      <div className={cn("mx-auto w-full", narrow ? "max-w-none px-5 py-8" : "max-w-[1040px] px-12 py-14")}>
        <span className={cn(bar, "h-3 w-28")} />
        <span className={cn(bar, "mt-5", narrow ? "h-7 w-[85%]" : "h-10 w-[62%]")} />
        <span className={cn(bar, "mt-3", narrow ? "h-7 w-[60%]" : "h-10 w-[40%]")} />
        <span className={cn(bar, "mt-6 h-3", narrow ? "w-full" : "w-[52%]")} />
        <span className={cn(bar, "mt-2.5 h-3", narrow ? "w-[80%]" : "w-[44%]")} />

        {inline ? (
          <div className="mt-10">{inline}</div>
        ) : (
          <div className={cn("mt-12 grid gap-5", narrow ? "grid-cols-1" : "grid-cols-3")}>
            {[0, 1, 2].map((i) => (
              <div key={i} className="border-border/50 rounded-2xl border p-5">
                <span className="bg-muted block size-8 rounded-lg" />
                <span className={cn(bar, "mt-5 h-3.5 w-1/2")} />
                <span className={cn(bar, "mt-3 h-2.5 w-[90%]")} />
                <span className={cn(bar, "mt-2 h-2.5 w-[70%]")} />
              </div>
            ))}
          </div>
        )}

        <div className="border-border/50 mt-14 border-t pt-6">
          <span className={cn(bar, "h-2.5 w-32")} />
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
  slug,
  theme,
  blocks,
  compact,
  onClose,
}: {
  title: string;
  /**
   * The form's slug. It seeds the background tile, which is part of "the panel
   * in this picture is the panel a respondent gets" — a flat page here for a
   * textured form would be the picture lying about the product.
   */
  slug: string;
  theme: ThemeDoc;
  blocks: Block[];
  compact: boolean;
  /**
   * Overlay modes only: the close the panel carries itself.
   *
   * `chat-client` draws this the moment the embed handshake lands, except on a
   * desktop popup, where the launcher turns into the close instead.
   */
  onClose?: () => void;
}) {
  const script = useMemo(() => conversationScript(blocks), [blocks]);
  const pad = compact ? "px-4" : "px-5";
  const { can } = useEntitlements();
  const logoUrl = can("brand_logo") ? theme.logoUrl : null;
  // One question answered of the estimate, as a percentage — which is what
  // `progressBar` defaults to and what the runtime header actually says. It
  // read "Question 2 of 9" here, a mode the form has to be switched into.
  const pct = Math.round((1 / Math.max(script.total, 2)) * 100);
  useThemeFonts(theme);

  return (
    <div className="chat-surface flex h-full flex-col overflow-hidden" style={chatThemeVars(theme, slug)}>
      <header className="shrink-0">
        <div className={cn("flex items-center gap-3 py-3", pad)}>
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt="" className="size-8 shrink-0 rounded-xl object-contain" />
          ) : (
            <div className="grid size-8 shrink-0 place-items-center rounded-xl bg-[var(--cf-surface)] ring-1 ring-black/5">
              <LogoMark className="size-5" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{title}</p>
            {/* The runtime's second line: progress, then "Start over", so the
                title keeps the whole first line. */}
            <div className="flex items-center gap-1.5 text-xs">
              <span className="opacity-60">{pct}% complete</span>
              <span aria-hidden className="opacity-30">·</span>
              <span className="flex items-center gap-1 font-medium opacity-60">
                <RotateCcw className="size-3 shrink-0" />
                Start over
              </span>
            </div>
          </div>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close the panel"
              className="grid size-7 shrink-0 cursor-pointer place-items-center rounded-full opacity-45 transition-opacity hover:opacity-90"
            >
              <X className="size-4" />
            </button>
          )}
        </div>
        <div className="h-0.5 bg-[var(--cf-chip-border)]/40">
          <div className="h-full bg-[var(--cf-accent)]" style={{ width: `${Math.max(2, pct)}%` }} />
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

      {/* `SendRow`, to the pixel: the round paper-plane button the runtime
          draws, on the one row of the panel everybody looks at. */}
      <footer className="shrink-0">
        <div className={cn("flex items-end py-3", pad)}>
          <div className="h-11 min-w-0 flex-1 rounded-2xl border border-[var(--cf-chip-border)] bg-[var(--cf-composer-bg)] px-4 text-[0.9375rem] leading-[2.75rem] opacity-50">
            {script.placeholder}
          </div>
          <span className="ml-2 inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-[var(--cf-accent)] text-[var(--cf-accent-text)]">
            <SendHorizontal className="size-5 translate-x-px" strokeWidth={2.25} aria-hidden />
          </span>
        </div>
        <p className="pb-2 text-center text-[0.6875rem] opacity-40">
          Powered by <span className="underline">chatform</span>
        </p>
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
