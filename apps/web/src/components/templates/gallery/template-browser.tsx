"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { TemplateCard } from "@/components/templates/template-card";
import type { TemplateSummary } from "@/lib/templates";
import { cn } from "@/lib/utils";

export interface BrowsableTemplate {
  summary: TemplateSummary;
  path: string;
  type: "form" | "survey" | "quiz";
  /** Lower-cased words to match a search against. */
  haystack: string;
}

const FILTERS = [
  { value: "all", label: "All types" },
  { value: "form", label: "Forms" },
  { value: "survey", label: "Surveys" },
  { value: "quiz", label: "Quizzes" },
] as const;

/**
 * Search and a type filter over every template.
 *
 * The first page of cards is server-rendered; the rest appear on "Show all" or
 * as soon as the visitor searches or filters. Rendering all of them made the
 * gallery a megabyte and a half of HTML, and every template is already linked
 * in plain HTML from its hub pages and the sitemap.
 */
const FIRST_PAGE = 30;

export function TemplateBrowser({ templates }: { templates: BrowsableTemplate[] }) {
  const [query, setQuery] = useState("");
  const [type, setType] = useState<(typeof FILTERS)[number]["value"]>("all");
  const [expanded, setExpanded] = useState(false);

  const shown = useMemo(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    return templates.filter(
      (t) => (type === "all" || t.type === type) && words.every((w) => t.haystack.includes(w)),
    );
  }, [templates, query, type]);
  const narrowed = query.trim() !== "" || type !== "all";
  const visible = expanded || narrowed ? shown : shown.slice(0, FIRST_PAGE);

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <label className="border-border bg-card focus-within:ring-ring/40 flex h-11 flex-1 items-center gap-2 rounded-full border px-4 focus-within:ring-2">
          <Search className="text-muted-foreground size-4 shrink-0" />
          <span className="sr-only">Search templates</span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search templates, e.g. feedback, quote, quiz"
            className="placeholder:text-muted-foreground w-full bg-transparent text-sm outline-none"
          />
        </label>
        <div role="radiogroup" aria-label="Template type" className="bg-muted flex rounded-full p-1">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              role="radio"
              aria-checked={type === f.value}
              onClick={() => setType(f.value)}
              className={cn(
                "rounded-full px-3.5 py-1.5 text-sm transition-colors duration-[var(--duration-micro)]",
                type === f.value ? "bg-card text-foreground font-medium shadow-xs" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <p className="text-muted-foreground tabular mt-4 text-sm" aria-live="polite">
        {shown.length} {shown.length === 1 ? "template" : "templates"}
      </p>

      {shown.length > 0 ? (
        <ul className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((t) => (
            <li key={t.summary.slug} className="flex">
              <TemplateCard template={t.summary} href={t.path} />
            </li>
          ))}
        </ul>
      ) : null}
      {visible.length < shown.length && (
        <div className="mt-8 flex justify-center">
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="border-border bg-card hover:bg-accent/60 rounded-full border px-5 py-2.5 text-sm font-medium transition-colors duration-[var(--duration-micro)]"
          >
            Show all {shown.length} templates
          </button>
        </div>
      )}
      {shown.length === 0 && (
        <p className="text-muted-foreground text-body mt-8">
          Nothing matches that. Try a broader word, or describe the form you want on the AI form builder.
        </p>
      )}
    </div>
  );
}
