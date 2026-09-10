"use client";

import { FormDoc, ThemeDoc } from "@repo/form-schema";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { BrandField } from "./brand-field";
import { LockedControl } from "@/components/billing/gate";
import { BufferedInput } from "@/components/ui/buffered-input";

type Theme = FormDoc["theme"];

/**
 * Five fills, and no ink.
 *
 * "Their text" used to sit here as a sixth swatch, which put the one decision
 * with a right answer in the hands of whoever was clicking. The runtime now
 * derives ink from the fill behind it (`readableInk`), so the panel offers only
 * the choices that are actually taste.
 */
const COLOR_FIELDS: { key: keyof Theme; label: string }[] = [
  { key: "background", label: "Background" },
  { key: "text", label: "Text" },
  { key: "accent", label: "Accent" },
  { key: "botBubble", label: "Agent bubble" },
  { key: "userBubble", label: "Their bubble" },
];

/**
 * A preset moves the accent and the respondent's bubble together, and it puts
 * them at different lightnesses on purpose.
 *
 * The accent is the thing you press, so it stays saturated — a pale button is
 * a button people miss. The respondent's bubble is a passage of their own
 * writing, so it is a tint: light enough that dark ink sits above 9:1 on it,
 * dark enough to stand clear of the page. The old presets had the bubble at
 * full strength, which is the one lightness that serves neither job — nothing
 * reads well on a mid-tone, and a form that picked violet still sent in orange
 * because the accent had not moved with it.
 *
 * `Chatform` is the only preset that keeps two hues: the mark's orange for the
 * action, the mark's violet for the respondent. That reads as a palette now
 * that the violet is a tint under the orange rather than a second fill
 * competing with it.
 */
const PRESETS: { name: string; theme: Partial<Theme> }[] = [
  {
    name: "Chatform",
    theme: { background: "#faf7f2", accent: "#FD6F29", botBubble: "#ffffff", userBubble: "#C9AEEE", text: "#1c1917" },
  },
  {
    name: "Violet",
    theme: { background: "#f8f5fd", accent: "#6D3FC7", botBubble: "#ffffff", userBubble: "#C9AEEE", text: "#1e1b26" },
  },
  {
    name: "Warm",
    theme: { background: "#faf7f2", accent: "#FD6F29", botBubble: "#ffffff", userBubble: "#FFCBAA", text: "#1c1917" },
  },
  {
    name: "Ocean",
    theme: { background: "#f4f9fd", accent: "#0369A1", botBubble: "#ffffff", userBubble: "#B9DCF6", text: "#0c2f47" },
  },
  {
    name: "Forest",
    theme: { background: "#f5faf6", accent: "#166534", botBubble: "#ffffff", userBubble: "#B9E4C8", text: "#14321f" },
  },
  {
    name: "Midnight",
    theme: { background: "#14111c", accent: "#B48DF4", botBubble: "#221d30", userBubble: "#453862", text: "#f5f3f8" },
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
  /** `coalesceKey` merges a burst of changes to one control into a single undo step. */
  onChange: (next: Theme, coalesceKey?: string) => void;
}) {
  const patch = (p: Partial<Theme>, coalesceKey?: string) => onChange({ ...theme, ...p }, coalesceKey);

  return (
    <div className="w-full space-y-6">
      <Section title="Brand">
        <LockedControl feature="brand_logo">
          <BrandField theme={theme} onChange={patch} />
        </LockedControl>
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
                    onChange={(e) => patch({ [key]: e.target.value } as Partial<Theme>, `theme:${key}`)}
                    className="size-8 shrink-0 cursor-pointer rounded-md border"
                    aria-label={label}
                  />
                  <BufferedInput
                    value={value}
                    onCommit={(v) => patch({ [key]: v } as Partial<Theme>, `theme:${key}`)}
                    placeholder="#FD6F29"
                    className="font-mono text-xs"
                  />
                </div>
              </div>
            );
          })}
        </div>
        <p className="text-muted-foreground text-xs">
          Text on the accent and on their bubble is chosen for you, so an answer stays readable
          whatever colour you pick.
        </p>
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
            <BufferedInput
              id="font-heading"
              value={theme.fontHeading}
              onCommit={(v) => patch({ fontHeading: v }, "theme:fontHeading")}
              placeholder="Bricolage Grotesque"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="font-body">Body</Label>
            <BufferedInput
              id="font-body"
              value={theme.fontBody}
              onCommit={(v) => patch({ fontBody: v }, "theme:fontBody")}
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
