"use client";

import { useMemo, useState } from "react";
import {
  Code2,
  Mail,
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
  cspSnippet,
  emailSnippet,
  embedSnippet,
  EMBED_DEFAULTS,
  EMBED_MODES,
  EMBED_POSITIONS,
  isOverlay,
  reactSnippet,
  type EmbedConfig,
  type EmbedMode,
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

type Target = "html" | "react" | "email";

// The brand pair leads, in the mark's order, then four hues far enough apart
// to be told apart at 20px. `#8b5cf6` is gone: it sat one swatch away from the
// brand violet and close enough to it that the two read as a rendering bug.
const SWATCHES = ["#FD6F29", "#9D6EE4", "#0ea5e9", "#10b981", "#ef4444", "#111827"];

const TRIGGERS: { value: EmbedConfig["openOn"]; label: string }[] = [
  { value: "click", label: "When the launcher is clicked" },
  { value: "load", label: "As soon as the page loads" },
  { value: "exit-intent", label: "When the cursor leaves the page" },
  { value: "scroll:50", label: "After scrolling halfway" },
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
  const [config, setConfig] = useState<EmbedConfig>(EMBED_DEFAULTS);
  const [target, setTarget] = useState<Target>("html");
  const [previewOpen, setPreviewOpen] = useState(true);
  const [device, setDevice] = useState<PreviewDevice>("desktop");

  const set = <K extends keyof EmbedConfig>(key: K, value: EmbedConfig[K]) =>
    setConfig((prev) => ({ ...prev, [key]: value }));

  const snippet = useMemo(() => {
    const options = { ...config, slug, origin: appOrigin };
    if (target === "react") return reactSnippet(options);
    if (target === "email") return emailSnippet(slug, appOrigin, "Answer a few questions", config.color);
    return embedSnippet(options);
  }, [config, slug, appOrigin, target]);

  const overlay = isOverlay(config.mode);
  const unpublished = status !== undefined && status !== "published";
  const modeBlurb = EMBED_MODES.find((m) => m.mode === config.mode)?.blurb;
  const modified = JSON.stringify(config) !== JSON.stringify(EMBED_DEFAULTS);

  return (
    <div className="space-y-4">
      {unpublished && (
        <p className="text-caption rounded-xl border border-[var(--warning)]/40 bg-[var(--warning-soft)] px-4 py-3 text-[var(--warning-soft-foreground)]">
          This form isn&apos;t published yet. The snippet is final — respondents will just see a
          closed message until you hit Publish.
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
              onChange={setDevice}
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
              theme={theme}
              blocks={blocks}
              device={device}
              open={previewOpen}
              onToggle={() => setPreviewOpen((v) => !v)}
            />
          </div>
        </div>

        <div className="bg-card flex max-h-[32rem] min-h-0 flex-col overflow-hidden rounded-2xl lg:max-h-none">
          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5">
            <Field label="How it appears">
              <div className="grid grid-cols-2 gap-1.5">
                {EMBED_MODES.map((m) => (
                  <ModeButton
                    key={m.mode}
                    active={config.mode === m.mode}
                    label={m.label}
                    blurb={m.blurb}
                    onClick={() => set("mode", m.mode as EmbedMode)}
                  />
                ))}
              </div>
            </Field>

            {overlay && (
              <>
                <Field label="Corner" hint="Where the launcher sits on the page.">
                  <CornerPicker value={config.position} onChange={(p) => set("position", p)} />
                </Field>

                <Field label="Launcher">
                  <Input
                    value={config.label}
                    placeholder="Icon only"
                    onChange={(e) => set("label", e.target.value)}
                  />
                  <div className="flex items-center justify-between pt-1">
                    <Label
                      htmlFor="embed-icon"
                      className="text-muted-foreground text-caption font-normal"
                    >
                      Show the chat icon
                    </Label>
                    <Switch
                      id="embed-icon"
                      checked={config.icon}
                      onCheckedChange={(v) => set("icon", v)}
                    />
                  </div>
                </Field>

                <Field
                  label="Launcher colour"
                  hint="The bubble only — the conversation uses the form's theme."
                >
                  <div className="flex flex-wrap items-center gap-1.5">
                    {SWATCHES.map((hex) => (
                      <button
                        key={hex}
                        type="button"
                        aria-label={hex}
                        onClick={() => set("color", hex)}
                        style={{ background: hex }}
                        className={cn(
                          "size-6 rounded-full transition-transform duration-[var(--duration-micro)]",
                          config.color.toLowerCase() === hex.toLowerCase()
                            ? "ring-foreground ring-2 ring-offset-2 ring-offset-[var(--card)]"
                            : "hover:scale-110",
                        )}
                      />
                    ))}
                  </div>
                  {/*
                    A colour well next to the hex, because "#FD6F29" is not a
                    colour anybody can pick — it is one you can only paste.
                  */}
                  <div className="relative flex items-center gap-2">
                    <input
                      type="color"
                      aria-label="Pick a launcher colour"
                      value={/^#[0-9a-f]{6}$/i.test(config.color) ? config.color : "#000000"}
                      onChange={(e) => set("color", e.target.value.toUpperCase())}
                      className="border-border size-8 shrink-0 cursor-pointer rounded-lg border bg-transparent p-0.5"
                    />
                    <Input
                      value={config.color}
                      onChange={(e) => set("color", e.target.value)}
                      className="h-8 font-mono text-xs"
                      aria-label="Launcher colour, as hex"
                    />
                  </div>
                </Field>

                <div className="grid grid-cols-2 gap-3">
                  <Field label="Width">
                    <NumberInput
                      value={config.width}
                      min={280}
                      max={720}
                      onChange={(v) => set("width", v)}
                    />
                  </Field>
                  {/* A side tab is full height by definition, so it has no height
                      to set — and the gap it does have is the launcher's. */}
                  {config.mode === "popup" ? (
                    <Field label="Height">
                      <NumberInput
                        value={config.height}
                        min={320}
                        max={900}
                        onChange={(v) => set("height", v)}
                      />
                    </Field>
                  ) : (
                    <Field label="Edge gap">
                      <NumberInput
                        value={config.offset}
                        min={0}
                        max={80}
                        onChange={(v) => set("offset", v)}
                      />
                    </Field>
                  )}
                </div>

                {config.mode === "popup" && (
                  <Field label="Edge gap" hint="Distance from the corner, in pixels.">
                    <NumberInput
                      value={config.offset}
                      min={0}
                      max={80}
                      onChange={(v) => set("offset", v)}
                    />
                  </Field>
                )}

                <Field label="Opens">
                  <Select
                    value={config.openOn}
                    onValueChange={(v) => set("openOn", v as EmbedConfig["openOn"])}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TRIGGERS.map((t) => (
                        <SelectItem key={t.value} value={t.value}>
                          {t.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              </>
            )}

            {config.mode === "inline" && (
              <Field label="Height">
                <div className="flex items-center justify-between">
                  <Label
                    htmlFor="embed-auto-height"
                    className="text-muted-foreground text-caption font-normal"
                  >
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
                    ? "Starts at 620px and follows the conversation as it grows. Needs the loader."
                    : "A plain iframe — no script, so it survives a strict CSP."}
                </p>
              </Field>
            )}

            {config.mode === "fullpage" && (
              <p className="text-muted-foreground text-micro">
                The form takes over the window, so there is nothing to place and nothing to size.
                Everything it looks like comes from the form&apos;s own theme.
              </p>
            )}
          </div>

          <div className="border-border/60 shrink-0 border-t p-2">
            <Button
              variant="ghost"
              size="sm"
              className="w-full"
              onClick={() => setConfig(EMBED_DEFAULTS)}
              disabled={!modified}
            >
              <RotateCcw className="size-3.5" />
              Reset to defaults
            </Button>
          </div>
        </div>
      </div>

      <div className="bg-card space-y-3 rounded-2xl p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SegmentedControl
            size="sm"
            options={[
              { value: "html", label: "HTML", icon: Code2 },
              { value: "react", label: "React", icon: Code2 },
              { value: "email", label: "Email", icon: Mail },
            ]}
            value={target}
            onChange={setTarget}
            ariaLabel="Where you're pasting this"
          />
          <CopyButton value={snippet} label="Copy snippet" variant="default" />
        </div>

        <pre className="bg-muted text-caption max-h-64 overflow-auto rounded-xl p-4 font-mono">
          <code>{snippet}</code>
        </pre>

        <p className="text-muted-foreground text-micro flex items-start gap-1.5">
          <ShieldCheck className="mt-0.5 size-3 shrink-0" />
          {target === "email"
            ? "Email clients block iframes and scripts, so this is a styled link to the hosted form."
            : "No API key, no package, no backend. A published form is public — the frame talks to the API itself."}
        </p>

        {target !== "email" && (
          <details className="group">
            <summary className="text-muted-foreground hover:text-foreground text-micro cursor-pointer list-none">
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
        <p className="text-h3">{label}</p>
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
