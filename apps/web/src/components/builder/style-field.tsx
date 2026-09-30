"use client";

import { useState, type CSSProperties } from "react";
import { applyBackgroundPreset, BACKGROUND_PRESETS, FormDoc, matchBackgroundPreset, ThemeDoc } from "@repo/form-schema";
import { Check, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { chatThemeVars } from "@/lib/chat-theme";
import { cn } from "@/lib/utils";

type Theme = FormDoc["theme"];

/** The colours a style writes; everything else on the theme is left alone. */
const STYLE_COLORS = ["background", "surface", "text", "accent", "accentText", "botBubble", "userBubble", "userBubbleText"] as const;

/**
 * "Chatform", the look a new form opens with: the schema's own colours, the
 * tile picked from the link, and no shape. Listed first so there is always a
 * way back to plain.
 */
function applyDefault(theme: Theme): Theme {
  const base = ThemeDoc.parse({});
  const colors = Object.fromEntries(STYLE_COLORS.map((k) => [k, base[k]]));
  return {
    ...theme,
    ...colors,
    backgroundPattern: "auto",
    backgroundPatternColor: undefined,
    backgroundShape: undefined,
    colorScheme: theme.colorScheme === "auto" ? "auto" : "light",
  };
}

function isDefault(theme: Theme): boolean {
  const base = ThemeDoc.parse({});
  return (
    !theme.backgroundShape &&
    !theme.backgroundPatternColor &&
    theme.backgroundPattern === "auto" &&
    STYLE_COLORS.every((k) => String(theme[k]).toLowerCase() === String(base[k]).toLowerCase())
  );
}

/** How many styles show before "Show all": three rows of two. */
const FOLDED = 6;

const STYLES = [
  { id: "chatform", name: "Chatform", apply: applyDefault },
  ...BACKGROUND_PRESETS.map((p) => ({ id: p.id, name: p.name, description: p.description, apply: (t: Theme) => applyBackgroundPreset(t, p.id) })),
];

/**
 * The form's style: page, colours, pattern and shape in one click.
 *
 * Each card is drawn by `chatThemeVars`, the function the live form themes
 * through, so what the card shows is what the form becomes. Everything under
 * it in the sheet (colours, pattern, shape) fine-tunes the style picked here.
 */
export function StyleField({
  theme,
  seed,
  onChange,
}: {
  theme: Theme;
  seed?: string | null;
  onChange: (next: Theme) => void;
}) {
  const current = matchBackgroundPreset(theme)?.id ?? (isDefault(theme) ? "chatform" : null);
  const [open, setOpen] = useState(false);
  /*
   * Folded, the list is the first few plus the form's own style when that sits
   * further down, so the selected card is always on screen. Not a scroll box:
   * the sheet already scrolls, and a second scroller inside it catches the wheel.
   */
  const head = STYLES.slice(0, FOLDED);
  const picked = STYLES.find((s) => s.id === current);
  const shown = open ? STYLES : picked && !head.includes(picked) ? [...head.slice(0, FOLDED - 1), picked] : head;

  return (
    <div data-setting="theme.backgroundPreset" className="space-y-2">
      <div className="grid grid-cols-2 gap-3">
        {shown.map((s) => {
          const next = s.apply(theme);
          const active = current === s.id;
          const ground: CSSProperties = {
            ...chatThemeVars(next, seed),
            backgroundColor: "var(--cf-bg)",
            backgroundImage: "var(--cf-pattern)",
            backgroundSize: "var(--cf-pattern-size)",
            backgroundRepeat: "var(--cf-pattern-repeat, repeat)",
            backgroundPosition: "var(--cf-pattern-position, 0 0)",
          };
          return (
            <button
              key={s.id}
              type="button"
              aria-pressed={active}
              title={"description" in s ? `${s.name}: ${s.description}` : s.name}
              onClick={() => onChange(next)}
              className="group text-left"
            >
              <span
                className={cn(
                  "relative flex aspect-[4/3] flex-col justify-center gap-2 overflow-hidden rounded-xl px-3.5 ring-1 transition-shadow",
                  active ? "ring-primary ring-2" : "ring-border group-hover:ring-foreground/30",
                )}
                style={ground}
              >
                <span className="h-4 w-3/4 rounded-full shadow-xs" style={{ backgroundColor: next.botBubble }} />
                <span className="h-4 w-1/2 rounded-full shadow-xs" style={{ backgroundColor: next.botBubble }} />
                <span className="h-4 w-2/5 self-end rounded-full" style={{ backgroundColor: next.userBubble }} />
                {active && (
                  <Check className="bg-primary text-primary-foreground absolute top-1.5 right-1.5 size-5 rounded-full p-0.5" strokeWidth={3} />
                )}
              </span>
              <span className="mt-1.5 block truncate text-sm">{s.name}</span>
            </button>
          );
        })}
      </div>
      <Button variant="ghost" size="sm" className="w-full" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        {open ? "Show less" : `Show all ${STYLES.length}`}
        <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} />
      </Button>
    </div>
  );
}
