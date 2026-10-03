"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { THEME_CHOICES, ThemeDoc } from "@repo/form-schema";
import { themeFromAccent } from "@/lib/brand-palette";
import { chatThemeVars } from "@/lib/chat-theme";
import { ChatBubble } from "@/components/chat/chat-bubble";
import { Band } from "./band";
import { CheckItem, PANEL_SHADOW, SectionLede, SectionTitle, Split, TextLink } from "./kit";
import { cn } from "@/lib/utils";

/**
 * The customisation section's playground: a few of the builder's design
 * controls, driving a chat preview drawn with the real `ChatBubble` and the
 * real `chatThemeVars`, so what changes here is exactly what a form does.
 *
 * Until somebody touches it, a pretend cursor walks through the controls and
 * clicks them, the way Youform's does. The first real click (or "Pause demo")
 * stops it for good. It only moves while the card is on screen, and never
 * under reduced motion.
 */

const ACCENTS = [
  { id: "orange", label: "Orange", hex: "#FD6F29" },
  { id: "violet", label: "Violet", hex: "#9769DC" },
  { id: "green", label: "Green", hex: "#2F9E6B" },
  { id: "blue", label: "Blue", hex: "#2D6CDF" },
] as const;

const FONTS = [
  { id: "modern", label: "Modern", family: "var(--font-bricolage), system-ui, sans-serif" },
  { id: "simple", label: "Simple", family: "var(--font-inter), system-ui, sans-serif" },
  { id: "serif", label: "Serif", family: "Georgia, 'Times New Roman', serif" },
] as const;

type Style = {
  accent: (typeof ACCENTS)[number]["id"];
  font: (typeof FONTS)[number]["id"];
  page: "light" | "dark";
  corners: "round" | "square";
};

const START: Style = { accent: "orange", font: "modern", page: "light", corners: "round" };

/** What the pretend cursor does, in order, then again. */
const SCRIPT: [keyof Style, string][] = [
  ["accent", "violet"],
  ["font", "serif"],
  ["page", "dark"],
  ["corners", "square"],
  ["accent", "green"],
  ["page", "light"],
  ["font", "simple"],
  ["accent", "blue"],
  ["corners", "round"],
  ["font", "modern"],
  ["accent", "orange"],
];

function Cursor() {
  return (
    <svg viewBox="0 0 24 24" className="size-6 drop-shadow-md" aria-hidden>
      <path d="M5 3l14 8-6 1.5L10 19z" fill="var(--foreground)" stroke="var(--background)" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

export function ThemePlayground() {
  const [style, setStyle] = useState<Style>(START);
  const [auto, setAuto] = useState(true);
  const [cursor, setCursor] = useState<{ x: number; y: number; pressed: boolean } | null>(null);
  const card = useRef<HTMLDivElement>(null);
  const controls = useRef(new Map<string, HTMLButtonElement>());

  const theme = useMemo(() => {
    const accent = ACCENTS.find((a) => a.id === style.accent)!.hex;
    const palette = themeFromAccent(accent, { dark: style.page === "dark" });
    return ThemeDoc.parse({ ...palette, radius: style.corners === "round" ? "lg" : "none" });
  }, [style]);

  const stopAuto = useCallback(() => {
    setAuto(false);
    setCursor(null);
  }, []);

  useEffect(() => {
    const el = card.current;
    if (!auto || !el) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

    let step = 0;
    let visible = false;
    const timers: number[] = [];

    const tick = () => {
      if (visible) {
        const [key, value] = SCRIPT[step % SCRIPT.length];
        const target = controls.current.get(`${key}:${value}`);
        if (target) {
          const box = el.getBoundingClientRect();
          const t = target.getBoundingClientRect();
          setCursor({ x: t.left - box.left + t.width / 2 - 4, y: t.top - box.top + t.height / 2 - 2, pressed: false });
          timers.push(
            window.setTimeout(() => {
              setCursor((c) => (c ? { ...c, pressed: true } : c));
              setStyle((s) => ({ ...s, [key]: value }));
            }, 750),
            window.setTimeout(() => setCursor((c) => (c ? { ...c, pressed: false } : c)), 900),
          );
        }
        step += 1;
      }
      timers.push(window.setTimeout(tick, 1700));
    };

    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
    }, { threshold: 0.4 });
    io.observe(el);
    timers.push(window.setTimeout(tick, 600));

    return () => {
      io.disconnect();
      timers.forEach((t) => window.clearTimeout(t));
    };
  }, [auto]);

  const pick = (key: keyof Style, value: string) => (event: React.MouseEvent) => {
    if (event.isTrusted) stopAuto();
    setStyle((s) => ({ ...s, [key]: value }));
  };

  const ref = (key: string) => (node: HTMLButtonElement | null) => {
    if (node) controls.current.set(key, node);
    else controls.current.delete(key);
  };

  const option = (selected: boolean) =>
    cn(
      "h-9 rounded-full border px-3.5 text-sm font-medium transition-colors duration-[var(--duration-micro)]",
      selected ? "border-foreground bg-foreground text-background" : "border-border bg-card hover:border-foreground/40",
    );

  const fontFamily = FONTS.find((f) => f.id === style.font)!.family;

  return (
    <div ref={card} className={cn("bg-card border-border relative overflow-hidden rounded-[18px] border", PANEL_SHADOW)}>
      <div className="border-border flex items-center justify-between border-b px-5 py-3">
        <span className="text-muted-foreground text-xs font-semibold">Welcome screen preview</span>
        {auto ? (
          <button type="button" onClick={stopAuto} className="text-muted-foreground hover:text-foreground text-xs font-semibold underline-offset-4 hover:underline">
            Pause demo
          </button>
        ) : (
          <button type="button" onClick={() => setStyle(START)} className="text-muted-foreground hover:text-foreground text-xs font-semibold underline-offset-4 hover:underline">
            Reset style
          </button>
        )}
      </div>

      <div
        className="chat-surface flex min-h-[19rem] flex-col justify-center gap-2.5 px-6 py-8 transition-colors duration-300 sm:px-10"
        style={{ ...chatThemeVars(theme), fontFamily }}
      >
        <div className="flex">
          <ChatBubble from="bot">Hi! Thanks for thinking of us for your project.</ChatBubble>
        </div>
        <div className="flex">
          <ChatBubble from="bot">What kind of space are we working on?</ChatBubble>
        </div>
        <div className="flex justify-end">
          <ChatBubble from="user">A small kitchen, mostly</ChatBubble>
        </div>
        <div className="mt-3 flex">
          <span
            className="inline-flex h-10 items-center px-5 text-sm font-semibold transition-colors duration-300"
            style={{ background: "var(--cf-accent)", color: "var(--cf-accent-text)", borderRadius: "var(--cf-radius)" }}
          >
            Let&apos;s start
          </span>
        </div>
      </div>

      <div className="border-border grid gap-4 border-t px-5 py-5 sm:grid-cols-2">
        <Control label="Accent">
          {ACCENTS.map((a) => (
            <button
              key={a.id}
              ref={ref(`accent:${a.id}`)}
              type="button"
              aria-label={a.label}
              aria-pressed={style.accent === a.id}
              onClick={pick("accent", a.id)}
              style={{ background: a.hex }}
              className={cn(
                "size-8 rounded-full ring-offset-2 ring-offset-[var(--card)] transition-shadow",
                style.accent === a.id ? "ring-foreground ring-2" : "hover:ring-foreground/30 hover:ring-2",
              )}
            />
          ))}
        </Control>
        <Control label="Font">
          {FONTS.map((f) => (
            <button key={f.id} ref={ref(`font:${f.id}`)} type="button" aria-pressed={style.font === f.id} onClick={pick("font", f.id)} className={option(style.font === f.id)} style={{ fontFamily: f.family }}>
              {f.label}
            </button>
          ))}
        </Control>
        <Control label="Page">
          {(["light", "dark"] as const).map((p) => (
            <button key={p} ref={ref(`page:${p}`)} type="button" aria-pressed={style.page === p} onClick={pick("page", p)} className={cn(option(style.page === p), "capitalize")}>
              {p}
            </button>
          ))}
        </Control>
        <Control label="Corners">
          {(["round", "square"] as const).map((c) => (
            <button key={c} ref={ref(`corners:${c}`)} type="button" aria-pressed={style.corners === c} onClick={pick("corners", c)} className={cn(option(style.corners === c), "capitalize")}>
              {c}
            </button>
          ))}
        </Control>
      </div>

      {cursor && (
        <span
          aria-hidden
          className="pointer-events-none absolute top-0 left-0 z-10 transition-transform duration-[650ms] ease-[cubic-bezier(.2,.7,.3,1)]"
          style={{ transform: `translate(${cursor.x}px, ${cursor.y}px) scale(${cursor.pressed ? 0.82 : 1})` }}
        >
          <Cursor />
        </span>
      )}
    </div>
  );
}

function Control({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div role="group" aria-label={label}>
      <p className="text-muted-foreground mb-2 text-xs font-semibold">{label}</p>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}

export function CustomizeSection() {
  return (
    <Band id="design" hairline>
      <Split cols="lg:grid-cols-[1fr_1.12fr]">
        <div>
          <SectionTitle eyebrow="Make it yours" accent="Your kind of form.">
            Your colours. Your look.
          </SectionTitle>
          <SectionLede>Every form starts on a theme you can change in a click, then bend to your brand.</SectionLede>
          <ul className="mt-7 space-y-3 text-[0.9375rem]">
            <CheckItem>{THEME_CHOICES.length} ready-made themes, or pick one colour and we build the rest</CheckItem>
            <CheckItem>Light, dark, or whichever the visitor&apos;s device prefers</CheckItem>
            <CheckItem>Corners, backgrounds and patterns to match your site</CheckItem>
          </ul>
          <div className="mt-8">
            <TextLink href="/signin?mode=signup">Design your own form</TextLink>
          </div>
          <p className="text-muted-foreground mt-4 text-sm">Watch the styles change, or try the controls yourself.</p>
        </div>
        <ThemePlayground />
      </Split>
    </Band>
  );
}
