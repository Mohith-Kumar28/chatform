"use client";

import { useMemo, useState } from "react";
import { RadioGroup as RadioGroupPrimitive } from "radix-ui";
import type { EmbedDoc } from "@repo/form-schema";
import { useBuilderStore } from "@/stores/builder-store";
import {
  Code2,
  Mail,
  Sparkles,
  Monitor,
  PanelRightClose,
  PanelRightOpen,
  RotateCcw,
  Smartphone,
} from "lucide-react";
import type { Block, ThemeDoc } from "@repo/form-schema";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SegmentedControl } from "@/components/ui/segmented-control";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { EmbedPreview, type PreviewDevice } from "./embed-preview";
import {
  aiPrompt,
  cspSnippet,
  emailSnippet,
  embedSnippet,
  EMBED_DEFAULTS,
  EMBED_MODES,
  EMBED_POSITIONS,
  isOverlay,
  reactSnippet,
  type EmbedConfig,
  type EmbedPosition,
} from "@/lib/embed-snippet";
import { InfoHint } from "@/components/ui/info-hint";
import { cn } from "@/lib/utils";

/**
 * The embed studio.
 *
 * What used to be here was a `<pre>` containing one snippet for one mode, and
 * everything the loader could actually do — the corner, the colour, the
 * launcher text, when it opens — was undocumented and unreachable. Changing any
 * of it meant reading `embed.js`.
 *
 * The controls write the snippet and draw the picture from the same object, so
 * the thing being copied and the thing being looked at cannot disagree.
 *
 * Layout: the picture and the controls are one row of a fixed height, and the
 * controls scroll inside it. They used to be a column that grew with whatever
 * the selected mode revealed — a popup's nine fields pushed the snippet, the
 * one thing everybody came here to copy, a screen and a half below the fold,
 * and left the preview stranded in a tall empty column beside them.
 */

type Target = "html" | "react" | "email" | "ai";

// The brand pair leads, in the mark's order, then four hues far enough apart
// to be told apart at 20px. `#8b5cf6` is gone: it sat one swatch away from the
// brand violet and close enough to it that the two read as a rendering bug.

/**
 * What the studio starts from. The loader's own default is click-only, but a
 * popup nobody notices collects nothing, so the studio suggests opening it
 * halfway down the page. The snippet spells that out as data-open-on.
 */
const STUDIO_DEFAULTS: EmbedConfig = { ...EMBED_DEFAULTS, openOn: "scroll:50", icon: false };

function stripUndefined<T extends object>(o: T): Partial<T> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>;
}

/** What the document keeps: everything but the colour (the theme's) and hidden fields (per page). */
function toEmbedDoc(c: EmbedConfig): EmbedDoc {
  return {
    mode: c.mode,
    position: c.position,
    offset: c.offset,
    label: c.label,
    icon: c.icon,
    launcher: c.launcher,
    theme: c.theme,
    openOn: c.openOn,
    width: c.width,
    height: c.height,
    autoHeight: c.autoHeight,
  };
}

const TRIGGERS: { value: EmbedConfig["openOn"]; label: string }[] = [
  { value: "scroll:50", label: "Halfway down the page" },
  { value: "load", label: "On page load" },
  { value: "exit-intent", label: "When they're about to leave" },
  { value: "click", label: "Off" },
];

export function EmbedStudio({
  slug,
  formTitle,
  appOrigin,
  status,
  theme,
  blocks,
}: {
  slug: string;
  formTitle: string;
  appOrigin: string;
  status?: string;
  theme: ThemeDoc;
  blocks: Block[];
}) {
  /**
   * The choices live on the form document, so they autosave with the draft and
   * go live on Publish like any other edit: `embed.js` reads the published
   * version, and a site already carrying the script picks the change up
   * without anyone re-pasting it. They used to be component state, so a reload
   * put every choice back to the defaults.
   */
  const saved = useBuilderStore((s) => s.doc?.embed);
  const edit = useBuilderStore((s) => s.edit);
  const chosen = useMemo<EmbedConfig>(
    () => ({ ...STUDIO_DEFAULTS, ...stripUndefined(saved ?? {}) }),
    [saved],
  );
  /**
   * The launcher wears the form's own accent. There used to be a separate
   * picker for it, which only ever produced a button that did not match the
   * form it opened.
   */
  const config = useMemo(() => ({ ...chosen, color: theme.accent }), [chosen, theme.accent]);
  const setConfig = (next: EmbedConfig | ((prev: EmbedConfig) => EmbedConfig)) => {
    // From the store, not the render: two changes in one tick must both land.
    const current = {
      ...STUDIO_DEFAULTS,
      ...stripUndefined(useBuilderStore.getState().doc?.embed ?? {}),
    };
    const value = typeof next === "function" ? next(current) : next;
    edit((draft) => {
      draft.embed = toEmbedDoc(value);
    }, "embed");
  };
  const [target, setTarget] = useState<Target>("ai");
  const [previewOpen, setPreviewOpen] = useState(true);
  const [device, setDevice] = useState<PreviewDevice>("desktop");

  const set = <K extends keyof EmbedConfig>(key: K, value: EmbedConfig[K]) =>
    setConfig((prev) => ({ ...prev, [key]: value }));

  const snippet = useMemo(() => {
    const options = { ...config, slug, origin: appOrigin };
    if (target === "react") return reactSnippet(options);
    if (target === "email") return emailSnippet(slug, appOrigin, "Answer a few questions", config.color);
    if (target === "ai") return aiPrompt(options);
    return embedSnippet(options);
  }, [config, slug, appOrigin, target]);

  const overlay = isOverlay(config.mode);
  const ownButtonHtml = `<button type="button" data-chatform-open>${config.label || EMBED_DEFAULTS.label}</button>`;
  const unpublished = status !== undefined && status !== "published";
  const modeBlurb = EMBED_MODES.find((m) => m.mode === config.mode)?.blurb;
  const modified = JSON.stringify(chosen) !== JSON.stringify(STUDIO_DEFAULTS);

  return (
    <div className="space-y-4">
      {unpublished && (
        <p className="text-caption rounded-xl border border-[var(--warning)]/40 bg-[var(--warning-soft)] px-4 py-3 text-[var(--warning-soft-foreground)]">
          This form isn&apos;t published yet. The snippet is final. Visitors will see a closed
          message until you hit Publish.
        </p>
      )}

      {/*
        One row, one height. The picture takes the width because the corner and
        the proportions are the decision; the rail is fixed at 320 and scrolls,
        so switching from Inline (two controls) to Popup (nine) moves nothing on
        the page around it.
      */}
      <div className="grid gap-4 lg:h-[min(46rem,calc(100svh-17rem))] lg:min-h-[30rem] lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="bg-muted/30 ring-border/60 flex h-[26rem] min-h-0 flex-col overflow-hidden rounded-2xl ring-1 lg:h-auto">
          <div className="border-border/60 flex shrink-0 items-center gap-2 border-b px-3 py-2">
            <SegmentedControl
              size="sm"
              options={[
                { value: "desktop", label: "Desktop", icon: Monitor },
                { value: "mobile", label: "Phone", icon: Smartphone },
              ]}
              value={device}
              onChange={(next) => {
                setDevice(next);
                // `embed.js` never auto-opens on a phone, so the phone preview
                // starts closed: what a visitor sees is the button calling out.
                if (next === "mobile" && config.openOn !== "click" && isOverlay(config.mode)) {
                  setPreviewOpen(false);
                }
              }}
              ariaLabel="Preview size"
            />
            {overlay && (
              <Button
                variant="ghost"
                size="sm"
                shape="pill"
                className="shrink-0"
                onClick={() => setPreviewOpen((v) => !v)}
              >
                {previewOpen ? (
                  <PanelRightClose className="size-3.5" />
                ) : (
                  <PanelRightOpen className="size-3.5" />
                )}
                {previewOpen ? "Close" : "Open"}
              </Button>
            )}
          </div>

          <div className="flex min-h-0 flex-1 p-4">
            <EmbedPreview
              config={config}
              formTitle={formTitle}
              slug={slug}
              theme={theme}
              blocks={blocks}
              device={device}
              open={previewOpen}
              onToggle={() => setPreviewOpen((v) => !v)}
            />
          </div>
        </div>

        <div className="bg-card flex max-h-[32rem] min-h-0 flex-col overflow-hidden rounded-2xl lg:max-h-none">
          {/*
            Sections, each under a divider, so the rail reads as four or five
            decisions instead of one long list of equally loud controls.
          */}
          <div className="divide-border/60 min-h-0 flex-1 divide-y overflow-y-auto">
            <Section
              title="How it appears"
              hint={modeBlurb}
              action={
                modified && (
                  <button
                    type="button"
                    onClick={() => setConfig(STUDIO_DEFAULTS)}
                    className="text-muted-foreground hover:text-foreground text-micro flex shrink-0 items-center gap-1 transition-colors"
                  >
                    <RotateCcw className="size-3" />
                    Reset to defaults
                  </button>
                )
              }
            >
              <div className="grid grid-cols-2 gap-1.5">
                {EMBED_MODES.map((m) => (
                  <ModeButton
                    key={m.mode}
                    active={config.mode === m.mode}
                    label={m.label}
                    blurb={m.blurb}
                    onClick={() =>
                      setConfig((prev) => ({
                        ...prev,
                        mode: m.mode,
                        // A popup auto-opens halfway down by default.
                        openOn: m.mode === "popup" && prev.mode !== "popup" ? "scroll:50" : prev.openOn,
                      }))
                    }
                  />
                ))}
              </div>
            </Section>

            {overlay && (
              <>
                <Section
                  title="Auto open"
                  hint="Opens by itself once per visitor. Closed, it won't open again on any page of your site, and on a phone the button shakes once instead. Clicking a button always opens it."
                >
                  <Select
                    value={config.openOn}
                    onValueChange={(v) => set("openOn", v as EmbedConfig["openOn"])}
                  >
                    <SelectTrigger className="w-full">
                      {/* Spelled out: SelectValue renders empty until the list has opened once. */}
                      <SelectValue>{TRIGGERS.find((t) => t.value === config.openOn)?.label}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {TRIGGERS.map((t) => (
                        <SelectItem key={t.value} value={t.value}>
                          {t.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Section>

                <Section
                  title="Position"
                  hint={
                    config.mode === "side-tab"
                      ? "Which side the panel slides in from, and where its button sits."
                      : "Which corner of the screen the button sits in. The form opens from there."
                  }
                >
                  <Field label="Screen corner">
                    <PositionPicker
                      value={config.position}
                      color={config.color}
                      launcher={config.launcher}
                      label={config.label}
                      onChange={(p) => set("position", p)}
                    />
                  </Field>
                  <Field label="Gap from the edge" hint="In pixels. 20 is the usual.">
                    <NumberInput
                      value={config.offset}
                      min={0}
                      max={80}
                      onChange={(v) => set("offset", v)}
                    />
                  </Field>
                </Section>

                <Section
                  title="Corner button"
                  hint="The round button in the corner that opens the form."
                  action={
                    <Switch
                      aria-label="Show the corner button"
                      checked={config.launcher}
                      onCheckedChange={(v) => set("launcher", v)}
                    />
                  }
                >
                  {config.launcher ? (
                    <>
                      <Field label="Button text" hint="Leave empty for an icon-only circle.">
                        <Input
                          value={config.label}
                          placeholder="Icon only"
                          onChange={(e) => set("label", e.target.value)}
                        />
                      </Field>
                      <div className="flex items-center justify-between">
                        <Label htmlFor="embed-icon" className="text-caption font-normal">
                          Show the chat icon
                        </Label>
                        <Switch
                          id="embed-icon"
                          checked={config.icon}
                          onCheckedChange={(v) => set("icon", v)}
                        />
                      </div>
                    </>
                  ) : (
                    <p className="text-muted-foreground text-caption">No corner button.</p>
                  )}
                </Section>

                <Section title="Size" hint="In pixels. On phones it always fills the screen.">
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Width">
                      <NumberInput
                        value={config.width}
                        min={280}
                        max={720}
                        onChange={(v) => set("width", v)}
                      />
                    </Field>
                    {/* A side tab is full height by definition. */}
                    {config.mode === "popup" && (
                      <Field label="Height">
                        <NumberInput
                          value={config.height}
                          min={320}
                          max={900}
                          onChange={(v) => set("height", v)}
                        />
                      </Field>
                    )}
                  </div>
                </Section>


                <Section
                  title="Open from your own button"
                  hint="Already have a button on your site, like “Join waitlist”? Add the orange word to it, like below. Clicking that button then opens this form."
                >
                  <div className="bg-muted relative rounded-xl p-3 pr-10 font-mono text-xs leading-relaxed">
                    <span className="opacity-60">&lt;button </span>
                    <span className="text-primary font-semibold">data-chatform-open</span>
                    <span className="opacity-60">&gt;</span>
                    {config.label || EMBED_DEFAULTS.label}
                    <span className="opacity-60">&lt;/button&gt;</span>
                    <div className="absolute top-1.5 right-1.5">
                      <CopyButton value={ownButtonHtml} />
                    </div>
                  </div>
                </Section>
              </>
            )}

            {config.mode === "inline" && (
              <Section title="Height">
                <div className="flex items-center justify-between">
                  <Label htmlFor="embed-auto-height" className="text-caption font-normal">
                    Grow to fit the conversation
                  </Label>
                  <Switch
                    id="embed-auto-height"
                    checked={config.autoHeight}
                    onCheckedChange={(v) => set("autoHeight", v)}
                  />
                </div>
                {!config.autoHeight && (
                  <NumberInput
                    value={config.height}
                    min={320}
                    max={1200}
                    onChange={(v) => set("height", v)}
                  />
                )}
              </Section>
            )}

          </div>
        </div>
      </div>

      <div className="bg-card space-y-3 rounded-2xl p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SegmentedControl
            size="sm"
            options={[
              { value: "ai", label: "AI prompt", icon: Sparkles },
              { value: "html", label: "HTML", icon: Code2 },
              { value: "react", label: "React", icon: Code2 },
              { value: "email", label: "Email", icon: Mail },
            ]}
            value={target}
            onChange={setTarget}
            ariaLabel="Where you're pasting this"
          />
          <CopyButton
            value={snippet}
            label={target === "ai" ? "Copy prompt" : "Copy snippet"}
            variant="default"
          />
        </div>

        <pre className="bg-muted text-caption max-h-64 overflow-auto rounded-xl p-4 font-mono">
          <code>{snippet}</code>
        </pre>

        {(target === "html" || target === "react") && (
          <details className="group">
            {/* Underlined, because it opens something. Undecorated it read as a
                caption sitting under the snippet rather than as a control. */}
            <summary className="text-muted-foreground hover:text-foreground text-micro cursor-pointer list-none underline underline-offset-2">
              Your site sets a Content Security Policy?
            </summary>
            <pre className="bg-muted text-caption mt-2 overflow-x-auto rounded-xl p-3 font-mono">
              <code>{cspSnippet(appOrigin)}</code>
            </pre>
          </details>
        )}
      </div>
    </div>
  );
}

/** One decision in the rail, under a divider. */
function Section({
  title,
  hint,
  action,
  children,
}: {
  title: string;
  hint?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-4 px-5 py-5">
      <div className="flex items-start justify-between gap-3">
        {/* Explanations live behind the icon; the rail is titles and controls. */}
        <div className="flex items-center gap-1">
          <h3 className="text-sm font-semibold">{title}</h3>
          {hint && <InfoHint label={`About ${title.toLowerCase()}`} align="start">{hint}</InfoHint>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1">
        <p className="text-caption font-medium">{label}</p>
        {hint && <InfoHint label={`About ${label.toLowerCase()}`} align="start">{hint}</InfoHint>}
      </div>
      {children}
    </div>
  );
}

function ModeButton({
  active,
  label,
  blurb,
  onClick,
}: {
  active: boolean;
  label: string;
  blurb: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={blurb}
      aria-pressed={active}
      className={cn(
        "rounded-xl border px-3 py-2 text-left text-sm",
        "transition-colors duration-[var(--duration-micro)]",
        active
          ? "border-primary bg-primary-soft text-primary font-medium"
          : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground",
      )}
    >
      {label}
    </button>
  );
}

/** Laid out the way a screen is: top row on top, left column on the left. */
const POSITION_GRID: EmbedPosition[] = ["top-left", "top-right", "bottom-left", "bottom-right"];

/**
 * The corner, as a tiny screen.
 *
 * It used to be four boxes with a dot in one corner of each, which nobody read
 * as "a web page with the button here". Each option now draws a miniature page
 * with the button in the form's colour sitting in that corner, and names the
 * corner underneath, so the choice reads the same way the preview does.
 */
function PositionPicker({
  value,
  color,
  launcher,
  label,
  onChange,
}: {
  value: EmbedPosition;
  color: string;
  /** Off: there is no button, so the thumbnail shows the panel in that corner. */
  launcher: boolean;
  /** The button's text. Empty draws a round icon button. */
  label: string;
  onChange: (position: EmbedPosition) => void;
}) {
  return (
    <RadioGroupPrimitive.Root
      value={value}
      onValueChange={(v) => onChange(v as EmbedPosition)}
      aria-label="Screen corner"
      className="grid grid-cols-2 gap-2"
    >
      {POSITION_GRID.map((position) => {
        const active = value === position;
        const name = EMBED_POSITIONS.find((p) => p.position === position)?.label ?? position;
        const top = position.startsWith("top");
        const left = position.endsWith("left");
        return (
          <RadioGroupPrimitive.Item
            key={position}
            value={position}
            className={cn(
              "group rounded-xl border p-1.5 text-left outline-none",
              "focus-visible:ring-ring/50 focus-visible:ring-[3px]",
              "transition-colors duration-[var(--duration-micro)]",
              active ? "border-primary bg-primary-soft" : "border-border hover:border-primary/40",
            )}
          >
            <span className="bg-background border-border/70 relative block aspect-[16/10] overflow-hidden rounded-lg border">
              {/* The page: a nav line and two lines of text, quiet on purpose. */}
              <span className="bg-muted absolute inset-x-0 top-0 block h-2" />
              <span className="bg-muted absolute top-[38%] left-1/4 block h-1 w-1/2 rounded-full" />
              <span className="bg-muted absolute top-[52%] left-1/3 block h-1 w-1/3 rounded-full" />
              <span
                className={cn(
                  "absolute block shadow-sm transition-colors duration-[var(--duration-micro)]",
                  top ? "top-3.5" : "bottom-1.5",
                  left ? "left-1.5" : "right-1.5",
                  !launcher
                    ? "h-5 w-7 rounded-[3px]"
                    : label
                      ? "h-2.5 w-7 rounded-full"
                      : "size-3 rounded-full",
                  !active && "bg-muted-foreground/35",
                )}
                style={active ? { background: color } : undefined}
              />
            </span>
            <span
              className={cn(
                "text-caption mt-1.5 block px-0.5",
                active ? "text-primary font-medium" : "text-muted-foreground group-hover:text-foreground",
              )}
            >
              {name}
            </span>
          </RadioGroupPrimitive.Item>
        );
      })}
    </RadioGroupPrimitive.Root>
  );
}

function NumberInput({
  value,
  min,
  max,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  return (
    <Input
      type="number"
      value={value}
      min={min}
      max={max}
      className="h-8"
      onChange={(e) => {
        const next = Number(e.target.value);
        // Clamped rather than validated on blur: an out-of-range panel is a
        // preview that lies, and the snippet would carry the bad number.
        if (Number.isFinite(next)) onChange(Math.min(max, Math.max(min, Math.round(next))));
      }}
    />
  );
}
