"use client";

import { FormDoc, ThemeDoc } from "@repo/form-schema";
import { RADIUS_PX } from "@/lib/chat-theme";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { BrandField } from "./brand-field";
import { LockedControl } from "@/components/billing/gate";

type Theme = FormDoc["theme"];

const COLOR_FIELDS: { key: keyof Theme; label: string }[] = [
  { key: "background", label: "Background" },
  { key: "text", label: "Text" },
  { key: "accent", label: "Accent" },
  { key: "botBubble", label: "Agent bubble" },
  { key: "userBubble", label: "Their bubble" },
  { key: "userBubbleText", label: "Their text" },
];

const PRESETS: { name: string; theme: Partial<Theme> }[] = [
  {
    name: "Warm",
    theme: { background: "#faf7f2", accent: "#f97316", botBubble: "#ffffff", userBubble: "#f97316", text: "#1c1917" },
  },
  {
    name: "Midnight",
    theme: { background: "#0c0a09", accent: "#a78bfa", botBubble: "#1c1917", userBubble: "#a78bfa", text: "#fafaf9" },
  },
  {
    name: "Ocean",
    theme: { background: "#f0f9ff", accent: "#0ea5e9", botBubble: "#ffffff", userBubble: "#0ea5e9", text: "#0c4a6e" },
  },
  {
    name: "Forest",
    theme: { background: "#f7fee7", accent: "#16a34a", botBubble: "#ffffff", userBubble: "#16a34a", text: "#14532d" },
  },
];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h3 className="text-muted-foreground text-[0.6875rem] font-medium tracking-wide uppercase">{title}</h3>
      {children}
    </section>
  );
}

export function ThemePanel({
  theme,
  onChange,
}: {
  theme: Theme;
  onChange: (next: Theme) => void;
}) {
  const patch = (p: Partial<Theme>) => onChange({ ...theme, ...p });

  return (
    <div className="w-full space-y-6">
      <Section title="Brand">
        {/*
          Left fully usable in the builder on purpose: they upload their logo and see their
          form wearing it. Publish strips the reference and says so. That is the highest-
          intent moment in the product, and the alternative — a padlock over an empty
          uploader — sells nothing because they never see what they are missing.
        */}
        <BrandField theme={theme} onChange={patch} />
      </Section>

      <Section title="Presets">
        <div className="grid grid-cols-2 gap-2">
          {PRESETS.map((p) => (
            <button
              key={p.name}
              type="button"
              onClick={() => patch(p.theme)}
              className="hover:bg-muted/60 flex items-center gap-2 rounded-xl px-2.5 py-2 text-left transition-colors"
            >
              <span className="flex gap-1">
                <span className="size-4 rounded-full" style={{ background: p.theme.background, boxShadow: "inset 0 0 0 1px var(--border)" }} />
                <span className="size-4 rounded-full" style={{ background: p.theme.accent }} />
                <span className="size-4 rounded-full" style={{ background: p.theme.userBubble }} />
              </span>
              <span className="text-xs font-medium">{p.name}</span>
            </button>
          ))}
        </div>
      </Section>

      <Section title="Colours">
        <div className="grid grid-cols-2 gap-3">
          {COLOR_FIELDS.map(({ key, label }) => {
            const value = (theme[key] as string | undefined) ?? "";
            return (
              <div key={key} className="space-y-1.5">
                <Label htmlFor={`theme-${key}`}>{label}</Label>
                <div className="flex items-center gap-2">
                  <input
                    id={`theme-${key}`}
                    type="color"
                    value={/^#[0-9a-fA-F]{6}$/.test(value) ? value : "#ffffff"}
                    onChange={(e) => patch({ [key]: e.target.value } as Partial<Theme>)}
                    className="size-8 shrink-0 cursor-pointer rounded-md border"
                    aria-label={label}
                  />
                  <Input
                    value={value}
                    onChange={(e) => patch({ [key]: e.target.value } as Partial<Theme>)}
                    placeholder="#f97316"
                    className="font-mono text-xs"
                  />
                </div>
              </div>
            );
          })}
        </div>
      </Section>

      <Section title="Shape">
        <div className="space-y-1.5">
          <Label>Corners</Label>
          <Select value={theme.radius} onValueChange={(v) => patch({ radius: v as Theme["radius"] })}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Square</SelectItem>
              <SelectItem value="sm">Small</SelectItem>
              <SelectItem value="md">Medium</SelectItem>
              <SelectItem value="lg">Large</SelectItem>
              <SelectItem value="full">Pill</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <LockedControl feature="custom_fonts" className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="font-heading">Heading</Label>
            <Input
              id="font-heading"
              value={theme.fontHeading}
              onChange={(e) => patch({ fontHeading: e.target.value })}
              placeholder="Bricolage Grotesque"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="font-body">Body</Label>
            <Input
              id="font-body"
              value={theme.fontBody}
              onChange={(e) => patch({ fontBody: e.target.value })}
              placeholder="Inter"
            />
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
