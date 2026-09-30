"use client";

import { useMemo, useState, type CSSProperties } from "react";
import { applyFormTheme, backgroundDecorOn, FormDoc, matchFormTheme, THEME_CHOICES } from "@repo/form-schema";
import { Check, ChevronDown, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { chatThemeVars } from "@/lib/chat-theme";
import { cn } from "@/lib/utils";

type Theme = FormDoc["theme"];

/** How many themes show before "Show all": three rows of two. */
const FOLDED = 6;

/**
 * The form's theme: one of tweakcn's, with its colours, fonts, corners and
 * shadows, light and dark.
 *
 * Each card is drawn by `chatThemeVars`, the function the live form themes
 * through, so a card is the theme's own `--background`, `--card`, `--border`
 * and `--primary` in its own font. Folded to a few cards so the rest of the
 * Design sheet stays close; the selected theme is always among them. Not a
 * scroll box: the sheet already scrolls, and a second scroller inside it
 * catches the wheel.
 */
export function ThemeField({
  theme,
  seed,
  onChange,
}: {
  theme: Theme;
  seed?: string | null;
  onChange: (next: Theme) => void;
}) {
  const current = matchFormTheme(theme);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const shown = useMemo(() => {
    if (open) {
      const q = query.trim().toLowerCase();
      return q ? THEME_CHOICES.filter((t) => `${t.name} ${t.description}`.toLowerCase().includes(q)) : THEME_CHOICES;
    }
    const head = THEME_CHOICES.slice(0, FOLDED);
    const picked = THEME_CHOICES.find((t) => t.id === current);
    return picked && !head.includes(picked) ? [...head.slice(0, FOLDED - 1), picked] : head;
  }, [open, query, current]);

  return (
    <div data-setting="theme.backgroundPreset" className="space-y-3">
      {open && (
        <div className="relative">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Search ${THEME_CHOICES.length} themes`}
            aria-label="Search themes"
            className="pl-8"
          />
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        {shown.map((t) => {
          const next = applyFormTheme(theme, t.id);
          const active = current === t.id;
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
              key={t.id}
              type="button"
              aria-pressed={active}
              title={`${t.name}: ${t.description}`}
              onClick={() => onChange(next)}
              className="group text-left"
            >
              <span
                className={cn(
                  "relative flex aspect-[4/3] flex-col justify-center gap-2 overflow-hidden rounded-xl px-3 pb-4 ring-1 transition-shadow",
                  active ? "ring-primary ring-2" : "ring-border group-hover:ring-foreground/30",
                )}
                style={ground}
              >
                <span
                  className="w-fit max-w-4/5 truncate border px-2 py-1 text-[0.6875rem] leading-tight shadow-[var(--shadow-xs)]"
                  style={{
                    background: "var(--cf-bot-bubble)",
                    color: "var(--cf-bot-bubble-text)",
                    borderColor: "var(--cf-bot-bubble-border)",
                    borderRadius: "var(--cf-radius-card)",
                  }}
                >
                  Hi there!
                </span>
                <span
                  className="w-fit max-w-3/5 self-end truncate px-2 py-1 text-[0.6875rem] leading-tight"
                  style={{ background: "var(--cf-user-bubble)", color: "var(--cf-user-bubble-text)", borderRadius: "var(--cf-radius-card)" }}
                >
                  Sure
                </span>
                {/* The theme's key colours, as tweakcn's own theme list shows them. */}
                <span className="absolute bottom-2 left-3 flex gap-1" aria-hidden>
                  {(["--primary", "--secondary", "--accent", "--foreground"] as const).map((v) => (
                    <span key={v} className="size-2.5 rounded-full ring-1 ring-black/10" style={{ background: `var(${v})` }} />
                  ))}
                </span>
                {active && (
                  <Check className="bg-primary text-primary-foreground absolute top-1.5 right-1.5 size-5 rounded-full p-0.5" strokeWidth={3} />
                )}
              </span>
              <span className="mt-1.5 block truncate text-sm">{t.name}</span>
            </button>
          );
        })}
      </div>
      {open && shown.length === 0 && <p className="text-muted-foreground text-center text-sm">No theme matches</p>}

      <Button
        variant="ghost"
        size="sm"
        className="w-full"
        onClick={() => {
          setOpen((o) => !o);
          setQuery("");
        }}
        aria-expanded={open}
      >
        {open ? "Show less" : `Show all ${THEME_CHOICES.length}`}
        <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} />
      </Button>
    </div>
  );
}

/**
 * The pattern and the large shape behind the conversation, as one switch.
 * Sits beside the Theme heading: it is part of how the theme looks.
 */
export function BackgroundShapesSwitch({ theme, onChange }: { theme: Theme; onChange: (next: Theme) => void }) {
  return (
    <div data-setting="theme.backgroundDecor" className="flex items-center gap-2">
      <Label htmlFor="theme-decor" className="text-muted-foreground text-xs font-normal">
        Background shapes
      </Label>
      <Switch
        id="theme-decor"
        size="sm"
        checked={backgroundDecorOn(theme)}
        onCheckedChange={(on) =>
          onChange({ ...theme, backgroundPattern: on ? "auto" : "none", backgroundShape: on ? "auto" : undefined })
        }
      />
    </div>
  );
}
