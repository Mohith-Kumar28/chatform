"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  BookOpen,
  Bug,
  ExternalLink,
  FileClock,
  Keyboard,
  Lightbulb,
  MessageSquareHeart,
  Moon,
  Plus,
  Sun,
} from "lucide-react";
import { useTheme } from "next-themes";
import { openFeedback } from "@/components/feedback/feedback-launcher";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  substringFilter,
} from "@/components/ui/command";
import { Kbd } from "@/components/ui/kbd";
import { APP_NAV } from "@/components/dashboard/app-nav";
import { SETTINGS_SECTIONS } from "@/components/settings/sections";
import { BUILDER_TABS } from "@/components/builder/builder-tabs";
import { showHistory } from "@/components/builder/history-sheet";
import { showShortcuts } from "@/components/builder/use-builder-shortcuts";
import { requestLeave } from "@/lib/leave-guard";
import { getGetApiFormsQueryKey, useGetApiForms } from "@/lib/api/dashboard/dashboard";
import { apiData } from "@/lib/api/payload";
import { templateAccent } from "@/lib/category-accent";
import { useTemplates } from "@/lib/templates";
import { relativeTime, type FormRow } from "@/components/forms/form-card";
import { cn } from "@/lib/utils";

/**
 * Opening the palette from a button rather than from ⌘K.
 *
 * An event rather than lifted state because the palette is mounted once per
 * shell and the things that want to open it — a header button here, a menu item
 * there — are neither its parent nor its child.
 */
const OPEN_EVENT = "chatform:open-command-palette";

export function openCommandPalette(): void {
  window.dispatchEvent(new CustomEvent(OPEN_EVENT));
}

/**
 * What a result is, ahead of how well it matches.
 *
 * cmdk ranks every result by match quality alone, so typing "team" put a
 * "Team retrospective" template above the Team settings page. Somebody in the
 * palette is almost always heading somewhere in their own account, so the
 * app's own pages and forms always outrank the docs, and both outrank the
 * template catalogue. Match quality only orders results within a tier.
 */
const TIER = { app: 2, doc: 1, template: 0 } as const;

/**
 * Every item's `value` is `<tier>:<unique id>` and the words to search go in
 * `keywords`. The value is cmdk's identity for an item, so two forms with the
 * same title used to light up together and stop the arrow keys on the first
 * of them; an id makes each row its own stop.
 */
function itemValue(tier: keyof typeof TIER, id: string): string {
  return `${tier}:${id}`;
}

function paletteFilter(value: string, search: string, keywords?: string[]): number {
  const score = substringFilter(keywords?.join(" ") ?? "", search);
  if (score === 0) return 0;
  const tier = value.slice(0, value.indexOf(":")) as keyof typeof TIER;
  return score + (TIER[tier] ?? TIER.app);
}

/** The form being built, when the palette is open inside the builder. */
function useBuilderContext(): { formId: string } | null {
  const pathname = usePathname();
  const match = /^\/forms\/([^/]+)\//.exec(pathname);
  return match?.[1] ? { formId: match[1] } : null;
}

/**
 * ⌘K palette. DESIGN.md promised one from the start and it was never built.
 * Forms are searchable by name so jumping to a specific form does not require
 * going back to the dashboard and scanning a grid.
 *
 * Mounted in both shells. Inside the builder it puts that form's own sections
 * first — the palette is meant to answer "take me to the thing I am thinking
 * about", and in the builder that is almost never another form.
 */
export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const { setTheme } = useTheme();
  const builder = useBuilderContext();

  // Both lists are lazy: nothing is fetched until the palette has been opened
  // once, and neither changes often enough to refetch on every open.
  // No workspace filter on purpose: ⌘K searches everything the organization
  // has, because "which folder is it in" is the question the palette exists to
  // avoid asking. The dashboard grid is the workspace-scoped view.
  const { data } = useGetApiForms(undefined, {
    query: { queryKey: getGetApiFormsQueryKey(), enabled: open, staleTime: 60_000 },
  });
  const forms = apiData<FormRow[]>(data) ?? [];
  const { templates } = useTemplates(open);

  /*
    cmdk highlights its first row once, on mount, and the forms and templates
    arrive a moment later. They render above that row, so the highlight was
    left on "Forms" under Go to, halfway down, and the arrow keys walked on
    from there. Put it back on the top row whenever the lists fill in.
  */
  const rootRef = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState("");
  useEffect(() => {
    if (!open) return;
    const first = rootRef.current?.querySelector<HTMLElement>('[cmdk-item]:not([aria-disabled="true"])');
    const value = first?.getAttribute("data-value");
    if (value) setSelected(value);
  }, [open, forms.length, templates.length]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    }
    function onOpen() {
      setOpen(true);
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_EVENT, onOpen);
    };
  }, []);

  function go(href: string) {
    setOpen(false);
    /*
      A `router.push` fires no click and no `beforeunload`, so it is the one exit
      the builder's unpublished-changes guard cannot see for itself. It gets
      asked here instead, and when it takes the navigation it owns finishing it.
    */
    if (requestLeave(href, () => router.push(href))) return;
    router.push(href);
  }

  if (!open) return null;

  return (
    <div
      className="bg-background/60 fixed inset-0 z-[var(--z-modal)] flex items-start justify-center p-4 pt-[14vh] backdrop-blur-sm"
      onClick={() => setOpen(false)}
    >
      <Command
        ref={rootRef}
        label="Command palette"
        filter={paletteFilter}
        value={selected}
        onValueChange={setSelected}
        onClick={(e) => e.stopPropagation()}
        className="border-border shadow-lg w-full max-w-lg overflow-hidden border"
      >
        <CommandInput autoFocus placeholder="Search forms and templates, or jump to a page…" />
        <CommandList>
          <CommandEmpty>Nothing matches that.</CommandEmpty>

          {builder && (
            <CommandGroup heading="This form">
              {BUILDER_TABS.map((tab, i) => (
                <CommandItem
                  key={tab.segment}
                  value={itemValue("app", `tab-${tab.segment}`)}
                  keywords={[tab.label, tab.hint]}
                  onSelect={() => go(`/forms/${builder.formId}/${tab.segment}`)}
                >
                  <tab.icon className="size-3.5 opacity-60" />
                  <span className="min-w-0 flex-1 truncate">{tab.label}</span>
                  <Kbd>{i + 1}</Kbd>
                </CommandItem>
              ))}
              {/*
                History lost its tab, not its way in. It is a sheet behind a
                header icon beside undo and redo now, and listed here by hand
                rather than through BUILDER_TABS — a panel without a nav slot is
                exactly what a command palette is for, and it carries no number
                because the digit shortcuts are the tab strip's.
              */}
              <CommandItem
                value={itemValue("app", "history")}
                keywords={["History changes published versions"]}
                onSelect={() => {
                  setOpen(false);
                  showHistory();
                }}
              >
                <FileClock className="size-3.5 opacity-60" />
                <span className="min-w-0 flex-1 truncate">History</span>
              </CommandItem>
              {/*
                The shortcut sheet used to sit in the header as a permanent Keyboard
                button — a screen slot spent on a list most people open once. It lives
                here instead, where someone goes when they are looking for a faster way
                to do something, and stays on ? for everyone who already knows.
              */}
              <CommandItem
                value={itemValue("app", "shortcuts")}
                keywords={["Keyboard shortcuts"]}
                onSelect={() => {
                  setOpen(false);
                  showShortcuts();
                }}
              >
                <Keyboard className="size-3.5 opacity-60" />
                <span className="min-w-0 flex-1">Keyboard shortcuts</span>
                <Kbd>?</Kbd>
              </CommandItem>
            </CommandGroup>
          )}

          {forms.length > 0 && (
            <CommandGroup heading="Forms">
              {forms.map((f) => (
                <CommandItem
                  key={f.id}
                  value={itemValue("app", `form-${f.id}`)}
                  keywords={[f.title]}
                  onSelect={() => go(`/forms/${f.id}/build`)}>
                  <span
                    aria-hidden
                    className={cn(
                      "size-1.5 shrink-0 rounded-full",
                      f.status === "published" ? "bg-[var(--success)]" : "bg-muted-foreground/40",
                    )}
                  />
                  <span className="min-w-0 flex-1 truncate">{f.title}</span>
                  {/* Recency rather than the raw status string, which read as
                      a stray "draft" hanging off the end of every row. */}
                  <span className="text-muted-foreground shrink-0 text-xs">
                    {relativeTime(f.updatedAt)}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}

          {/* Derived from APP_NAV rather than retyped, so a nav change cannot
              leave the palette pointing at a route that moved. */}
          <CommandGroup heading="Go to">
            {APP_NAV.map((item) => (
              <CommandItem
                key={item.href}
                value={itemValue("app", `nav-${item.href}`)}
                keywords={[item.label]}
                onSelect={() => go(item.href)}>
                <item.icon className="size-3.5 opacity-60" />
                {item.label}
              </CommandItem>
            ))}
          </CommandGroup>

          {/*
            This group is what stops the consolidation from *hiding* things.

            Team and API keys gave up their nav slots; if the only way back were
            remembering they are now inside Settings, the change would have made
            them harder to reach rather than easier. The `value` strings carry the
            words somebody would actually type — "invite", "seats", "password",
            "leave workspace" — so the match does not depend on knowing our
            section names.
          */}
          <CommandGroup heading="Settings">
            {SETTINGS_SECTIONS.map((s) => (
              <CommandItem
                key={s.href}
                value={itemValue("app", `settings-${s.href}`)}
                keywords={[s.label, s.keywords]}
                onSelect={() => go(s.href)}
              >
                <s.icon className="size-3.5 opacity-60" />
                {s.label}
              </CommandItem>
            ))}
          </CommandGroup>

          {/* The "?" button's three actions, for somebody who reaches for ⌘K first. */}
          <CommandGroup heading="Feedback">
            {(
              [
                { kind: "bug", label: "Report a bug", icon: Bug, keywords: "broken error issue problem support" },
                { kind: "feature", label: "Request a feature", icon: Lightbulb, keywords: "idea suggestion wish" },
                { kind: "feedback", label: "Share feedback", icon: MessageSquareHeart, keywords: "rate opinion contact" },
              ] as const
            ).map((f) => (
              <CommandItem
                key={f.kind}
                value={itemValue("app", `feedback-${f.kind}`)}
                keywords={[f.label, f.keywords]}
                onSelect={() => {
                  setOpen(false);
                  openFeedback(f.kind);
                }}
              >
                <f.icon className="size-3.5 opacity-60" />
                {f.label}
              </CommandItem>
            ))}
          </CommandGroup>

          {/*
            The docs are a different app in the same domain, and the palette is
            where someone types "docs" expecting something to happen. Each opens
            in a new tab: you look something up to keep working, not to lose the
            screen you were working on. The `value` strings carry the words
            people actually type — "api", "reference", "help", "scopes" — so the
            match does not depend on remembering our page titles.
          */}
          <CommandGroup heading="Documentation">
            {[
              { label: "Documentation", href: "/docs", hint: "docs help guide reference" },
              { label: "Quickstart", href: "/docs/quickstart", hint: "docs getting started first request" },
              // Not `/docs/api`: that folder has no index page, only generated
              // operation pages under it, so the link would 404.
              { label: "Authentication", href: "/docs/authentication", hint: "docs api keys headers 401 auth" },
              { label: "Scopes", href: "/docs/scopes", hint: "docs scopes permissions api keys reference" },
            ].map((doc) => (
              <CommandItem
                key={doc.href}
                value={itemValue("doc", doc.href)}
                keywords={[doc.label, doc.hint]}
                onSelect={() => {
                  setOpen(false);
                  window.open(doc.href, "_blank", "noopener,noreferrer");
                }}
              >
                <BookOpen className="size-3.5 opacity-60" />
                <span className="min-w-0 flex-1 truncate">{doc.label}</span>
                <ExternalLink className="text-muted-foreground size-3 shrink-0" />
              </CommandItem>
            ))}
          </CommandGroup>

          <CommandGroup heading="Actions">
            <CommandItem
              value={itemValue("app", "new-form")}
              keywords={["New form"]}
              onSelect={() => go("/dashboard?new=1")}
            >
              <Plus className="size-3.5 opacity-60" />
              <span className="min-w-0 flex-1">New form</span>
              <Kbd>N</Kbd>
            </CommandItem>
            <CommandItem
              value={itemValue("app", "light-theme")}
              keywords={["Light theme"]}
              onSelect={() => {
                setTheme("light");
                setOpen(false);
              }}
            >
              <Sun className="size-3.5 opacity-60" />
              Light theme
            </CommandItem>
            <CommandItem
              value={itemValue("app", "dark-theme")}
              keywords={["Dark theme"]}
              onSelect={() => {
                setTheme("dark");
                setOpen(false);
              }}
            >
              <Moon className="size-3.5 opacity-60" />
              Dark theme
            </CommandItem>
          </CommandGroup>
          {templates.length > 0 && (
            <CommandGroup heading="Templates">
              {/* Last, and last in search too (see TIER): the catalogue is
                  long enough to bury everything below it. */}
              {/* Searching "nps" should offer the NPS template, not just any
                  form that happens to be named after it. */}
              {templates.map((t) => {
                const accent = templateAccent(t.category, t.accent, t.icon);
                const Icon = accent.icon;
                return (
                  <CommandItem
                    key={t.slug}
                    value={itemValue("template", t.slug)}
                    keywords={[t.title, t.category, ...(t.tags ?? [])]}
                    onSelect={() => go(`/templates/${t.slug}`)}
                  >
                    <Icon className="size-3.5 opacity-60" />
                    <span className="min-w-0 flex-1 truncate">{t.title}</span>
                    <span className="text-muted-foreground shrink-0 text-xs">{t.category}</span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          )}
        </CommandList>

        {/* The palette is where people end up when they are looking for a
            faster way to do something — so it is where to mention there is
            a whole list of them. */}
        <div className="border-border text-muted-foreground flex items-center justify-end gap-1.5 border-t px-3 py-2 text-xs">
          All shortcuts
          <Kbd>?</Kbd>
        </div>
      </Command>
    </div>
  );
}
