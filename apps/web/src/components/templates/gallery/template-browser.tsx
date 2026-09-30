"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, ChevronRight, Search } from "lucide-react";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TemplateTile, type TileData } from "./template-tile";

export interface BrowsableTemplate {
  tile: TileData;
  type: "form" | "survey" | "quiz";
  /** Lower-cased words a search is matched against. */
  haystack: string;
}

export interface BrowseSection {
  title: string;
  href: string;
  count: number;
  slugs: string[];
}

const TYPES = [
  { value: "all", label: "All types" },
  { value: "form", label: "Forms" },
  { value: "survey", label: "Surveys" },
  { value: "quiz", label: "Quizzes" },
] as const;

/** Shown before "Show all", so the page is not three hundred cards of HTML. */
const FIRST_PAGE = 24;

/**
 * Search, a type filter and the grid, with the bar pinned while you scroll.
 *
 * The bar carries the breadcrumb, so where you are stays visible however far
 * down the grid you go. With nothing typed the page shows its sections (the
 * gallery's goals) and then everything; the moment you search or pick a type
 * it becomes one list of matches.
 */
export function TemplateBrowser({
  templates,
  sections,
  crumbs,
  allTitle = "All templates",
  typeFilter = true,
}: {
  templates: BrowsableTemplate[];
  sections?: BrowseSection[];
  crumbs: { name: string; path: string }[];
  allTitle?: string;
  typeFilter?: boolean;
}) {
  const [draft, setDraft] = useState("");
  const [query, setQuery] = useState("");
  // Filter once typing pauses, not on every keystroke over three hundred cards.
  useEffect(() => {
    const t = setTimeout(() => setQuery(draft), 200);
    return () => clearTimeout(t);
  }, [draft]);
  const [type, setType] = useState<(typeof TYPES)[number]["value"]>("all");
  const [expanded, setExpanded] = useState(false);

  const bySlug = useMemo(() => new Map(templates.map((t) => [t.tile.slug, t])), [templates]);
  const shown = useMemo(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    return templates.filter((t) => (type === "all" || t.type === type) && words.every((w) => t.haystack.includes(w)));
  }, [templates, query, type]);
  const narrowed = query.trim() !== "" || type !== "all";
  const visible = expanded || narrowed ? shown : shown.slice(0, FIRST_PAGE);

  return (
    <div>
      <div className="bg-background/92 sticky top-0 z-20 -mx-4 border-b border-transparent px-4 py-3 backdrop-blur-md supports-[backdrop-filter]:bg-background/80 sm:-mx-6 sm:px-6">
        {crumbs.length > 1 && (
          <nav aria-label="Breadcrumb" className="text-foreground/65 mb-3 flex flex-wrap items-center gap-1 text-sm">
            {crumbs.map((c, i) => (
              <span key={c.path} className="inline-flex items-center gap-1">
                {i < crumbs.length - 1 ? (
                  <Link prefetch={false} href={c.path} className="hover:text-foreground transition-colors duration-[var(--duration-micro)]">
                    {c.name}
                  </Link>
                ) : (
                  <span aria-current="page" className="text-foreground font-medium">
                    {c.name}
                  </span>
                )}
                {i < crumbs.length - 1 && <ChevronRight className="size-3.5" />}
              </span>
            ))}
          </nav>
        )}
        <div className="flex gap-2">
          <InputGroup className="bg-card h-11 flex-1">
            <InputGroupAddon>
              <Search />
            </InputGroupAddon>
            <InputGroupInput
              type="search"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={'Try "event" or "feedback"'}
              aria-label="Search templates"
              className="text-[0.9375rem]"
            />
          </InputGroup>
          {typeFilter && (
            <Select value={type} onValueChange={(v) => setType(v as typeof type)}>
              <SelectTrigger aria-label="Template type" className="bg-card !h-11 w-36 shrink-0 text-[0.9375rem]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent align="end">
                {TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </div>

      {narrowed ? (
        <section className="mt-8">
          <p className="text-foreground/70 text-sm" aria-live="polite">
            {shown.length} {shown.length === 1 ? "template" : "templates"}
          </p>
          {shown.length > 0 ? (
            <Grid tiles={shown.map((t) => t.tile)} />
          ) : (
            <p className="text-foreground/75 mt-6">
              Nothing matches that. Try a broader word, or{" "}
              <Link prefetch={false} href="/ai-form-builder" className="text-primary font-medium underline-offset-4 hover:underline">
                describe your form to the AI builder
              </Link>
              .
            </p>
          )}
        </section>
      ) : (
        <>
          {sections?.map((s) => {
            const tiles = s.slugs.map((slug) => bySlug.get(slug)?.tile).filter((t): t is TileData => Boolean(t));
            return (
              <section key={s.href} className="border-border/70 mt-10 border-b pb-12">
                <div className="flex items-end justify-between gap-4">
                  <h2 className="font-display text-foreground text-2xl font-semibold tracking-tight sm:text-[1.75rem]">{s.title}</h2>
                  <Link prefetch={false} href={s.href} className="text-foreground hover:text-primary inline-flex shrink-0 items-center gap-1.5 text-sm font-semibold">
                    View all {s.count}
                    <ArrowRight className="size-4" />
                  </Link>
                </div>
                <Grid tiles={tiles} />
              </section>
            );
          })}
          <section className="mt-10">
            {sections && (
              <h2 className="font-display text-foreground text-2xl font-semibold tracking-tight sm:text-[1.75rem]">{allTitle}</h2>
            )}
            <Grid tiles={visible.map((t) => t.tile)} />
            {visible.length < shown.length && (
              <div className="mt-10 flex justify-center">
                <button
                  type="button"
                  onClick={() => setExpanded(true)}
                  className="bg-foreground text-background hover:bg-foreground/90 rounded-xl px-5 py-3 text-sm font-semibold transition-colors duration-[var(--duration-micro)]"
                >
                  Show all {shown.length} templates
                </button>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function Grid({ tiles }: { tiles: TileData[] }) {
  return (
    <ul className="mt-6 grid gap-x-6 gap-y-10 sm:grid-cols-2 xl:grid-cols-3">
      {tiles.map((t) => (
        <li key={t.slug} className="flex">
          <TemplateTile tile={t} />
        </li>
      ))}
    </ul>
  );
}
