"use client";

import { ArrowRight, ArrowUpRight, BookOpen, Lock } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { settingDef, type FormDoc, type KnowledgeAdd, type SettingChange, type SettingValue } from "@repo/form-schema";
import { minPlanFor, PLANS, type FeatureKey } from "@repo/entitlements";
import { useUpgrade } from "@/components/billing/gate";
import { useBuilderStore } from "@/stores/builder-store";
import { cn } from "@/lib/utils";
import { followingColours } from "./ai-settings";
import { revealSetting } from "./setting-reveal";

/**
 * What a proposal changes in the form's settings, one row per setting.
 *
 * Grouped by where each setting lives in the builder, and that place is a link:
 * it opens the tab, scrolls to the control and shakes it, so the author learns
 * where to change it by hand next time. Every row is the builder's own label and
 * the exact value on each side of the change, in full: a persona or a message is
 * the whole point of the row, so it wraps rather than being cut off.
 */
export function SettingRows({
  changes,
  knowledge,
  doc,
  applied,
}: {
  changes: readonly SettingChange[];
  knowledge: readonly KnowledgeAdd[];
  /** The form as it is now; the colours that follow are worked out against it. */
  doc: FormDoc | null;
  applied?: boolean;
}) {
  const byPlace = new Map<string, SettingChange[]>();
  for (const c of changes) byPlace.set(c.where, [...(byPlace.get(c.where) ?? []), c]);
  const following = doc && !applied ? followingColours(doc, changes) : [];

  return (
    <div className="space-y-2">
      {[...byPlace].map(([where, rows]) => (
        <div key={where} className="bg-muted/50 rounded-xl px-2.5 py-2">
          <PlaceLink where={where} settingKey={rows[0]!.key} />
          <ul className="space-y-1.5">
            {rows.map((c) => (
              <Row key={c.key} change={c} />
            ))}
            {rows.some((c) => settingDef(c.key)?.derives === "palette" || c.key === "theme.colorScheme") &&
              following.map((f) => (
                <li key={f.key} className="text-muted-foreground flex items-center gap-2 text-xs">
                  <span className="min-w-0 flex-1">{f.label}, to match</span>
                  <Colour value={f.before} muted />
                  <ArrowRight className="size-3 shrink-0" />
                  <Colour value={f.after} />
                </li>
              ))}
          </ul>
        </div>
      ))}
      {knowledge.length > 0 && (
        <div className="bg-muted/50 rounded-xl px-2.5 py-2">
          <PlaceLink where="Agent → Knowledge" section="knowledge" />
          <ul className="space-y-1.5">
            {knowledge.map((k, i) => (
              <li key={i} className={cn("flex items-start gap-2 text-xs", k.locked && "text-muted-foreground")}>
                <BookOpen className="mt-0.5 size-3 shrink-0" />
                <span className="min-w-0 flex-1 break-words">
                  {k.kind === "link" ? `Read ${k.url.replace(/^https?:\/\//, "")}` : `Add "${k.title}"`}
                </span>
                {k.locked && <span className="shrink-0">Source limit reached</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/**
 * The place a group of settings lives, as a quiet link to it.
 *
 * The builder's own path ("Agent › Persona"), not a category name: it is the
 * answer to "where would I change this myself", which is what it is for. A
 * setting with no control yet names that plainly and links nowhere.
 */
function PlaceLink({ where, settingKey, section }: { where: string; settingKey?: string; section?: string }) {
  const formId = useBuilderStore((s) => s.formId);
  const pathname = usePathname();
  const router = useRouter();
  const label = where.replace(/^Build → /, "").replace(/ → /g, " › ");
  const linked = Boolean(formId) && !where.startsWith("Only through the AI");

  if (!linked) return <p className="text-muted-foreground mb-1.5 text-xs">{label}</p>;
  return (
    <button
      type="button"
      onClick={() => {
        if (settingKey) revealSetting(settingKey, { formId: formId!, pathname, push: router.push });
        else router.push(`/forms/${formId}/agent?section=${section}`);
      }}
      className="text-muted-foreground hover:text-foreground mb-1.5 inline-flex items-center gap-0.5 text-xs underline decoration-dotted decoration-1 underline-offset-[3px] transition-colors"
    >
      {label}
      <ArrowUpRight className="size-3" />
    </button>
  );
}

/** Values that read as a line of prose get their own line, in full. */
function isLong(change: SettingChange): boolean {
  if (change.format === "longtext" || change.format === "list" || change.format === "emails" || change.format === "url") return true;
  return [change.before, change.after].some((v) => typeof v === "string" && v.length > 28);
}

function Row({ change: c }: { change: SettingChange }) {
  const upgrade = useUpgrade();
  const lock = c.locked ? (
    <button
      type="button"
      onClick={() => upgrade({ feature: c.locked!.feature as FeatureKey }, { from: "ai_bar" })}
      className="bg-background hover:text-foreground text-muted-foreground inline-flex shrink-0 items-center gap-1 rounded-full border px-1.5 py-0.5 text-[0.6875rem] font-medium"
    >
      <Lock className="size-2.5" />
      {PLANS[minPlanFor(c.locked.feature as FeatureKey)].name}
    </button>
  ) : null;

  if (isLong(c)) {
    const hadBefore = !isEmpty(c.before);
    return (
      <li className={cn("space-y-0.5 text-xs", c.locked && "text-muted-foreground")}>
        <div className="flex items-center gap-2">
          <span className="min-w-0 flex-1">{c.label}</span>
          {lock}
        </div>
        {hadBefore && !c.locked && (
          <p className="text-muted-foreground break-words whitespace-pre-line line-through decoration-[0.5px]">{describe(c, c.before)}</p>
        )}
        <p className={cn("break-words whitespace-pre-line", !c.locked && "font-medium")}>{describe(c, c.after)}</p>
      </li>
    );
  }

  if (c.locked) {
    return (
      <li className="text-muted-foreground flex items-center gap-2 text-xs">
        <span className="min-w-0 flex-1">{c.label}</span>
        <Value change={c} value={c.after} tone="dim" />
        {lock}
      </li>
    );
  }
  return (
    <li className="flex items-center gap-2 text-xs">
      <span className="min-w-0 flex-1">{c.label}</span>
      <Value change={c} value={c.before} tone="before" />
      <ArrowRight className="text-muted-foreground size-3 shrink-0" />
      <Value change={c} value={c.after} tone="after" />
    </li>
  );
}

/** `before` is struck through, `after` is the new value, `dim` is a value the plan will not take. */
function Value({ change, value, tone }: { change: SettingChange; value: SettingValue; tone: "before" | "after" | "dim" }) {
  if (change.format === "color" && typeof value === "string") return <Colour value={value} muted={tone !== "after"} />;
  return (
    <span
      className={cn(
        "shrink-0",
        tone === "before" && "text-muted-foreground line-through decoration-[0.5px]",
        tone === "after" && "font-medium",
      )}
      style={change.format === "font" && typeof value === "string" ? { fontFamily: `"${value}", sans-serif` } : undefined}
    >
      {describe(change, value)}
    </span>
  );
}

function Colour({ value, muted }: { value: string; muted?: boolean }) {
  return (
    <span className={cn("inline-flex shrink-0 items-center gap-1 font-mono", muted && "text-muted-foreground")}>
      <span className="ring-foreground/15 size-3 rounded-full ring-1" style={{ background: value }} />
      {value}
    </span>
  );
}

const isEmpty = (v: SettingValue) => v === undefined || v === "" || (Array.isArray(v) && v.length === 0);

function describe(change: SettingChange, value: SettingValue): string {
  if (isEmpty(value)) return "Not set";
  if (typeof value === "boolean") return value ? "On" : "Off";
  if (Array.isArray(value)) return change.format === "list" ? value.join("\n") : value.join(", ");
  if (change.format === "enum") return settingDef(change.key)?.options?.find((o) => o.value === value)?.label ?? String(value);
  if (change.format === "date") {
    const d = new Date(String(value));
    return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  }
  if (change.format === "int") return Number(value).toLocaleString();
  return String(value);
}
