"use client";

import { FormDoc, ThemeDoc } from "@repo/form-schema";
import { RADIUS_PX } from "@/lib/chat-theme";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";

type Theme = FormDoc["theme"];

const COLOR_FIELDS: { key: keyof Theme; label: string }[] = [
  { key: "background", label: "Background" },
  { key: "text", label: "Text" },
  { key: "accent", label: "Accent" },
  { key: "botBubble", label: "Bot bubble" },
  { key: "userBubble", label: "User bubble" },
  { key: "userBubbleText", label: "User bubble text" },
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
      <h3 className="text-xs font-semibold uppercase tracking-wide">{title}</h3>
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
    <div className="mx-auto w-full max-w-xl space-y-8 pb-16">
      <header className="space-y-1">
        <h2 className="font-display text-2xl font-semibold">Theme</h2>
        <p className="text-muted-foreground text-sm">
          Colors apply to the chat instantly — changes autosave to the draft.
        </p>
      </header>

      <Section title="Presets">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {PRESETS.map((p) => (
            <button
              key={p.name}
              type="button"
              onClick={() => patch(p.theme)}
              className="hover:border-primary rounded-xl border p-3 text-left transition-colors"
            >
              <div className="mb-2 flex gap-1">
                <span className="size-5 rounded-full border" style={{ background: p.theme.background }} />
                <span className="size-5 rounded-full border" style={{ background: p.theme.accent }} />
                <span className="size-5 rounded-full border" style={{ background: p.theme.userBubble }} />
              </div>
              <span className="text-xs font-medium">{p.name}</span>
            </button>
          ))}
          <Button variant="ghost" size="sm" className="justify-start" onClick={() => onChange(ThemeDoc.parse({}))}>
            Reset defaults
          </Button>
        </div>
      </Section>

      <Separator />

      <Section title="Colors">
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

      <Separator />

      <Section title="Shape & type">
        <div className="space-y-1.5">
          <Label>Bubble corners</Label>
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
        <div className="space-y-1.5">
          <Label htmlFor="font-heading">Heading font</Label>
          <Input
            id="font-heading"
            value={theme.fontHeading}
            onChange={(e) => patch({ fontHeading: e.target.value })}
            placeholder="Bricolage Grotesque"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="font-body">Body font</Label>
          <Input
            id="font-body"
            value={theme.fontBody}
            onChange={(e) => patch({ fontBody: e.target.value })}
            placeholder="Inter"
          />
        </div>
      </Section>
    </div>
  );
}
