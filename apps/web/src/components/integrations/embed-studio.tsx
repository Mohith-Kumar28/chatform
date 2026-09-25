"use client";

import { useMemo, useState } from "react";
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
  ShieldCheck,
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

const TRIGGERS: { value: EmbedConfig["openOn"]; label: string; hint: string }[] = [
  {
    value: "scroll:50",
    label: "After scrolling halfway down the page",
    hint: "Opens once the visitor has scrolled past the middle of the page they are on, measured from the top to the bottom of that page. Once per visit to the page, and never again after they submit. On a phone the button shakes instead of the form covering the screen.",
  },
  { value: "load", label: "As soon as the page loads", hint: "Opens by itself when the page loads. Not again after the visitor submits. On a phone the button shakes instead." },
  {
    value: "exit-intent",
    label: "When the visitor is about to leave",
    hint: "Opens when the mouse moves up out of the page, toward the tabs or the close button. Desktop only. Not again after the visitor submits.",
  },
  {
    value: "click",
    label: "Off, only when a button is clicked",
    hint: "Opens only when a visitor clicks the corner button or your own button.",
  },
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
            <p className="text-muted-foreground text-micro ml-auto hidden truncate sm:block">
              {overlay && device === "mobile"
                ? "Below 520px the panel takes the whole screen."
                : modeBlurb}
            </p>
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
                <Section title="Auto open" hint="Open the form by itself. Clicking a button always opens it too.">
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
                  <p className="text-muted-foreground text-micro">
                    {TRIGGERS.find((t) => t.value === config.openOn)?.hint}
                  </p>
                </Section>

                <Section title="Position">
                  <Field label="Corner">
                    <CornerPicker value={config.position} onChange={(p) => set("position", p)} />
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
                    <p className="text-muted-foreground text-caption">
                      Hidden. The form opens only from a button on your own site (see below).
                    </p>
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
                  <p className="text-muted-foreground text-micro">
                    Works on links too. Keep the script above on the same page.
                  </p>
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
                <p className="text-muted-foreground text-micro">
                  {config.autoHeight
                    ? "Starts at 620px and follows the conversation as it grows."
                    : "A plain iframe with no script, so it works on sites that block scripts."}
                </p>
              </Section>
            )}

            {config.mode === "fullpage" && (
              <Section title="Nothing to set">
                <p className="text-muted-foreground text-caption">
                  The form takes over the whole window. Its look comes from the form&apos;s theme.
                </p>
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

        {/* Kept only where it explains something the snippet cannot: an email
            "embed" that is visibly a link owes a reason. The other half of this
            line answered a question about keys and packages that a single
            script tag had already answered. */}
        {target === "email" && (
          <p className="text-muted-foreground text-micro flex items-start gap-1.5">
            <ShieldCheck className="mt-0.5 size-3 shrink-0" />
            Email clients block iframes and scripts, so this is a styled link to the hosted form.
          </p>
        )}

        {target === "ai" && (
          <p className="text-muted-foreground text-micro flex items-start gap-1.5">
            <Sparkles className="mt-0.5 size-3 shrink-0" />
            Paste this into Cursor, Claude Code, Lovable or any AI coding tool. It asks you a few
            questions first, then adds the form to your site.
          </p>
        )}

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
        <div className="space-y-1">
          <h3 className="text-sm font-semibold">{title}</h3>
          {hint && <p className="text-muted-foreground text-micro">{hint}</p>}
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
      <div className="space-y-0.5">
        <p className="text-caption font-medium">{label}</p>
        {hint && <p className="text-muted-foreground text-micro">{hint}</p>}
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

/**
 * The corner, as a corner.
 *
 * Four rows in a select would say the same thing and mean less — this is the
 * one control on the panel where the shape of the answer is the answer.
 */
function CornerPicker({
  value,
  onChange,
}: {
  value: EmbedPosition;
  onChange: (position: EmbedPosition) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-1.5">
      {EMBED_POSITIONS.map(({ position, label }) => {
        const active = value === position;
        const vertical = position.startsWith("top") ? "items-start" : "items-end";
        const horizontal = position.endsWith("left") ? "justify-start" : "justify-end";
        return (
          <button
            key={position}
            type="button"
            onClick={() => onChange(position)}
            aria-pressed={active}
            aria-label={label}
            title={label}
            className={cn(
              "flex h-11 rounded-xl border p-2",
              vertical,
              horizontal,
              "transition-colors duration-[var(--duration-micro)]",
              active ? "border-primary bg-primary-soft" : "border-border hover:border-primary/40",
            )}
          >
            <span
              className={cn("size-3 rounded-full", active ? "bg-primary" : "bg-muted-foreground/30")}
            />
          </button>
        );
      })}
    </div>
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
