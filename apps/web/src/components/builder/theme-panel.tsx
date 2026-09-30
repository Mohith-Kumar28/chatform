"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { FormDoc, ThemeDoc, THEME_DEFAULT_INK, withoutFormTheme } from "@repo/form-schema";
import { Label } from "@/components/ui/label";
import { InfoHint } from "@/components/ui/info-hint";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { BrandField } from "./brand-field";
import { BackgroundShapesSwitch, ThemeField } from "./theme-field";
import { LockedControl } from "@/components/billing/gate";
import { BufferedInput } from "@/components/ui/buffered-input";
import { Switch } from "@/components/ui/switch";
import { FontPicker } from "./font-picker";
import { isDarkTheme, themeFromAccent } from "@/lib/brand-palette";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { appearanceOf, withAppearance } from "@/lib/form-scheme";

type Theme = FormDoc["theme"];

/** The Corners choices, each with the radius its tile draws (Pill as a deep curve). */
const CORNERS: { value: Theme["radius"]; label: string; preview: string }[] = [
  { value: "none", label: "Square", preview: "0" },
  { value: "sm", label: "Small", preview: "5px" },
  { value: "md", label: "Medium", preview: "10px" },
  { value: "lg", label: "Large", preview: "16px" },
  { value: "full", label: "Pill", preview: "999px" },
];

/**
 * Five fills, and no ink.
 *
 * "Their text" used to sit here as a sixth swatch, which put the one decision
 * with a right answer in the hands of whoever was clicking. The runtime now
 * derives ink from the fill behind it (`readableInk`), so the panel offers only
 * the choices that are actually taste.
 *
 * Accent first, because with "Match to accent" on it is the one that moves the
 * other four.
 */
const COLOR_FIELDS: { key: keyof Theme; label: string }[] = [
  { key: "accent", label: "Primary colour" },
  { key: "background", label: "Background" },
  { key: "text", label: "Text" },
  { key: "botBubble", label: "Agent bubble" },
  { key: "userBubble", label: "Their bubble" },
  // The label on send, book, pay and submit. Stored as the schema's default
  // ink until someone picks one, which the runtime reads as "choose for me".
  { key: "accentText", label: "Button text" },
];

function Section({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <div className="flex min-h-5 items-center justify-between gap-3">
        <h3 className="text-muted-foreground text-[0.6875rem] font-medium tracking-wide uppercase">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

export function ThemePanel({
  theme,
  title,
  onTitleChange,
  seed,
  onChange,
}: {
  theme: Theme;
  /**
   * The form's title, shown and edited here as its name. It is the same
   * `doc.title` as the top bar's, not a separate brand name.
   */
  title?: string;
  onTitleChange?: (title: string) => void;
  /**
   * The form's public slug. It seeds the `Auto` background pattern, so the
   * picker can show the tile this particular form would land on rather than a
   * generic one. Absent while the form row is still loading, which only costs
   * the `Auto` swatch its picture.
   */
  seed?: string | null;
  /** `coalesceKey` merges a burst of changes to one control into a single undo step. */
  onChange: (next: Theme, coalesceKey?: string) => void;
}) {
  /*
   * Merged onto the latest theme rather than the one this render closed over:
   * the logo toast's "Undo" fires seconds later, and merging its old colours
   * onto a stale theme would have taken the new logo back out with them.
   */
  const latest = useRef(theme);
  useLayoutEffect(() => {
    latest.current = theme;
  }, [theme]);
  const patch = (p: Partial<Theme>, coalesceKey?: string) => onChange({ ...latest.current, ...p }, coalesceKey);

  /*
   * On by default: most people pick one brand colour and want a form that
   * agrees with it, not five pickers to reconcile by eye. Off, the accent moves
   * alone, for the author who has tuned the page by hand. Not stored: it is a
   * way of editing, not a property of the form.
   */
  const [linked, setLinked] = useState(true);
  const setColor = (key: keyof Theme, value: string) => {
    const derived = key === "accent" && linked ? themeFromAccent(value, { dark: isDarkTheme(theme) }) : null;
    // The accent stays exactly what was picked; only the colours around it move.
    // A colour picked by hand takes the form off its theme, whose tokens would paint over it.
    onChange(
      { ...withoutFormTheme(latest.current), ...(derived ? { ...derived, accent: value } : ({ [key]: value } as Partial<Theme>)) },
      `theme:${key}`,
    );
  };

  // Light, dark, or the respondent's own device: one rule, shared with the builder AI.
  const appearance = appearanceOf(theme);
  const setAppearance = (next: Theme["colorScheme"]) => onChange(withAppearance(latest.current, next), "theme:colorScheme");

  return (
    <div className="w-full space-y-6">
      <Section title="Brand">
        <div data-inspect-target="brand" className="space-y-3">
        {onTitleChange && (
          <div className="space-y-1.5">
            <Label htmlFor="brand-name">Form name</Label>
            <BufferedInput
              id="brand-name"
              value={title ?? ""}
              maxLength={200}
              onCommit={(v) => {
                // Same rule as the name in the top bar: trimmed, never empty.
                const next = v.trim().slice(0, 200);
                if (next && next !== title) onTitleChange(next);
              }}
            />
          </div>
        )}
        <LockedControl feature="brand_logo">
          <BrandField theme={theme} onChange={patch} />
        </LockedControl>
        </div>
      </Section>

      <Section title="Appearance">
        <div data-setting="theme.colorScheme" className="flex items-center gap-2">
          <SegmentedControl
            size="sm"
            options={[
              { value: "light", label: "Light" },
              { value: "dark", label: "Dark" },
              { value: "auto", label: "Auto" },
            ]}
            value={appearance}
            onChange={setAppearance}
            ariaLabel="Appearance"
          />
          <InfoHint label="About appearance">
            Auto shows each person the form in light or dark to match their device.
          </InfoHint>
        </div>
      </Section>

      <Section title="Theme" action={<BackgroundShapesSwitch theme={theme} onChange={(next) => onChange(next)} />}>
        <ThemeField theme={theme} seed={seed} onChange={(next) => onChange(next)} />
      </Section>


      <Section title="Colours">
        <div className="flex items-center justify-between gap-3">
          <Label htmlFor="theme-linked" className="text-xs font-normal">
            Match the other colours to the primary colour
          </Label>
          <Switch id="theme-linked" size="sm" checked={linked} onCheckedChange={setLinked} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          {COLOR_FIELDS.map(({ key, label }) => {
            const stored = (theme[key] as string | undefined) ?? "";
            // Button text on the default ink is "Auto": shown empty, cleared back to it.
            const auto = key === "accentText" && stored.toLowerCase() === THEME_DEFAULT_INK.toLowerCase();
            const value = auto ? "" : stored;
            return (
              <div key={key} data-setting={`theme.${key}`} className="space-y-1.5">
                <Label htmlFor={`theme-${key}`}>{label}</Label>
                <div className="flex items-center gap-2">
                  <input
                    id={`theme-${key}`}
                    type="color"
                    value={/^#[0-9a-fA-F]{6}$/.test(value) ? value : "#ffffff"}
                    /*
                      The one genuinely continuous control in the builder: the
                      native picker fires this repeatedly as the swatch is
                      dragged. Left uncoalesced, one drag across the spectrum
                      filled the undo ring with dozens of near-identical steps,
                      so ⌘Z afterwards walked back through the gradient one shade
                      at a time instead of undoing "changed the colour".

                      The document still updates on every move, deliberately —
                      that is what makes the preview follow your thumb — and it
                      no longer costs anything on the wire, because autosave now
                      fires once the drag has been over for three seconds rather
                      than at every pause within it.
                    */
                    onChange={(e) => setColor(key, e.target.value)}
                    className="size-8 shrink-0 cursor-pointer rounded-md border"
                    aria-label={label}
                  />
                  <BufferedInput
                    value={value}
                    onCommit={(v) => setColor(key, key === "accentText" && !v.trim() ? THEME_DEFAULT_INK : v)}
                    placeholder={key === "accentText" ? "Auto" : "#FD6F29"}
                    className="font-mono text-xs"
                  />
                </div>
              </div>
            );
          })}
        </div>
        <p className="text-muted-foreground text-xs">
          Text on their bubble is chosen for you, and so is Button text until you set it, so
          everything stays readable whatever colour you pick.
        </p>
      </Section>

      <Section title="Corners">
        <div data-setting="theme.radius" role="radiogroup" aria-label="Corners" className="grid grid-cols-5 gap-2">
          {CORNERS.map((c) => {
            const active = theme.radius === c.value;
            return (
              <button
                key={c.value}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => patch({ radius: c.value })}
                className="group text-center"
              >
                {/* One corner of a box, drawn at the roundness it sets. */}
                <span
                  className={cn(
                    "bg-muted/40 relative block aspect-square overflow-hidden rounded-md ring-1 transition-shadow",
                    active ? "ring-primary ring-2" : "ring-border group-hover:ring-foreground/30",
                  )}
                >
                  <span
                    className="border-foreground/70 absolute top-1/3 left-1/3 size-full border-t-2 border-l-2"
                    style={{ borderTopLeftRadius: c.preview }}
                  />
                </span>
                <span className="mt-1 block text-xs">{c.label}</span>
              </button>
            );
          })}
        </div>
      </Section>

      <Section title="Fonts">
        {/*
          Picked here and nowhere else: the hosted page, the embed and every
          preview read the theme, so an embedded form is set in the same faces.
        */}
        <LockedControl feature="custom_fonts" className="space-y-4">
          <div data-setting="theme.fontHeading" className="space-y-1.5">
            <Label htmlFor="font-heading">Heading</Label>
            <FontPicker id="font-heading" value={theme.fontHeading} onChange={(v) => patch({ fontHeading: v })} />
          </div>
          <div data-setting="theme.fontBody" className="space-y-1.5">
            <Label htmlFor="font-body">Body</Label>
            <FontPicker id="font-body" value={theme.fontBody} onChange={(v) => patch({ fontBody: v })} />
          </div>
        </LockedControl>
      </Section>

      <Button
        variant="ghost"
        size="sm"
        className="text-muted-foreground w-full"
        onClick={() => onChange(ThemeDoc.parse({}))}
      >
        Reset to defaults
      </Button>
    </div>
  );
}
