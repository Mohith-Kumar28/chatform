"use client";

import { ArrowRight, BookOpen, Lock } from "lucide-react";
import {
  SETTING_SECTION_LABELS,
  settingDef,
  type FormDoc,
  type KnowledgeAdd,
  type SettingChange,
  type SettingSection,
  type SettingValue,
} from "@repo/form-schema";
import { minPlanFor, PLANS, type FeatureKey } from "@repo/entitlements";
import { useUpgrade } from "@/components/billing/gate";
import { cn } from "@/lib/utils";
import { followingColours } from "./ai-settings";

/**
 * What a proposal changes in the form's settings, one row per setting.
 *
 * Every row is the builder's own label and the exact value on each side of the
 * change, so an author can tell before pressing Apply what will be different
 * and by how much. A colour is shown as a colour, not a hex alone.
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
  const bySection = new Map<SettingSection, SettingChange[]>();
  for (const c of changes) bySection.set(c.section, [...(bySection.get(c.section) ?? []), c]);
  const following = doc && !applied ? followingColours(doc, changes) : [];

  return (
    <div className="space-y-2">
      {[...bySection].map(([section, rows]) => (
        <div key={section} className="bg-muted/50 rounded-xl px-2.5 py-2">
          <p className="text-muted-foreground mb-1 text-[0.6875rem] font-medium tracking-wide uppercase">
            {SETTING_SECTION_LABELS[section]}
          </p>
          <ul className="space-y-1">
            {rows.map((c) => (
              <Row key={c.key} change={c} />
            ))}
            {section === "design" &&
              following.map((f) => (
                <li key={f.key} className="text-muted-foreground flex items-center gap-2 text-xs">
                  <span className="min-w-0 flex-1 truncate">{f.label}, to match</span>
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
          <p className="text-muted-foreground mb-1 text-[0.6875rem] font-medium tracking-wide uppercase">Knowledge</p>
          <ul className="space-y-1">
            {knowledge.map((k, i) => (
              <li key={i} className={cn("flex items-center gap-2 text-xs", k.locked && "text-muted-foreground")}>
                <BookOpen className="size-3 shrink-0" />
                <span className="min-w-0 flex-1 truncate" title={k.kind === "link" ? k.url : k.body}>
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

function Row({ change: c }: { change: SettingChange }) {
  const upgrade = useUpgrade();
  if (c.locked) {
    const feature = c.locked.feature as FeatureKey;
    const plan = PLANS[minPlanFor(feature)].name;
    return (
      <li className="text-muted-foreground flex items-center gap-2 text-xs">
        <span className="min-w-0 flex-1 truncate">{c.label}</span>
        <Value change={c} value={c.after} muted />
        <button
          type="button"
          onClick={() => upgrade({ feature }, { from: "ai_bar" })}
          className="bg-background hover:text-foreground inline-flex shrink-0 items-center gap-1 rounded-full border px-1.5 py-0.5 text-[0.6875rem] font-medium"
        >
          <Lock className="size-2.5" />
          {plan}
        </button>
      </li>
    );
  }
  return (
    <li className="flex items-center gap-2 text-xs">
      <span className="min-w-0 flex-1 truncate">{c.label}</span>
      <Value change={c} value={c.before} muted />
      <ArrowRight className="text-muted-foreground size-3 shrink-0" />
      <Value change={c} value={c.after} />
    </li>
  );
}

function Value({ change, value, muted }: { change: SettingChange; value: SettingValue; muted?: boolean }) {
  if (change.format === "color" && typeof value === "string") return <Colour value={value} muted={muted} />;
  const text = describe(change, value);
  return (
    <span
      title={text}
      className={cn(
        "max-w-[11rem] shrink-0 truncate",
        muted ? "text-muted-foreground line-through decoration-[0.5px]" : "font-medium",
      )}
      style={change.format === "font" && typeof value === "string" ? { fontFamily: `"${value}", sans-serif` } : undefined}
    >
      {text}
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

function describe(change: SettingChange, value: SettingValue): string {
  if (value === undefined || value === "" || (Array.isArray(value) && value.length === 0)) return "Not set";
  if (typeof value === "boolean") return value ? "On" : "Off";
  if (Array.isArray(value)) return value.join(", ");
  if (change.format === "enum") return settingDef(change.key)?.options?.find((o) => o.value === value)?.label ?? String(value);
  if (change.format === "date") {
    const d = new Date(String(value));
    return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  }
  if (change.format === "int") return Number(value).toLocaleString();
  return String(value);
}
