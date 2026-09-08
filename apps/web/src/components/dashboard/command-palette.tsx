"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  BookOpen,
  ExternalLink,
  FileClock,
  Keyboard,
  Moon,
  Plus,
  Sun,
} from "lucide-react";
import { useTheme } from "next-themes";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Kbd } from "@/components/ui/kbd";
import { APP_NAV } from "@/components/dashboard/app-nav";
import { SETTINGS_SECTIONS } from "@/components/settings/sections";
import { BUILDER_TABS } from "@/components/builder/builder-tabs";
import { showHistory } from "@/components/builder/history-sheet";
import { showShortcuts } from "@/components/builder/use-builder-shortcuts";
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
    router.push(href);
  }

  if (!open) return null;

  return (
    <div
      className="bg-background/60 fixed inset-0 z-[var(--z-modal)] flex items-start justify-center p-4 pt-[14vh] backdrop-blur-sm"
      onClick={() => setOpen(false)}
    >
      <Command
        label="Command palette"
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
                  value={`${tab.label} ${tab.hint}`}
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
                value="History changes published versions"
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
                value="Keyboard shortcuts"
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
                <CommandItem key={f.id} value={f.title} onSelect={() => go(`/forms/${f.id}/build`)}>
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

          {templates.length > 0 && (
            <CommandGroup heading="Templates">
              {/* Searching "nps" should offer the NPS template, not just any
                  form that happens to be named after it. */}
              {templates.map((t) => {
                const accent = templateAccent(t.category, t.accent, t.icon);
                const Icon = accent.icon;
                return (
                  <CommandItem
                    key={t.slug}
                    value={`${t.title} ${t.category} ${(t.tags ?? []).join(" ")}`}
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

          {/* Derived from APP_NAV rather than retyped, so a nav change cannot
              leave the palette pointing at a route that moved. */}
          <CommandGroup heading="Go to">
            {APP_NAV.map((item) => (
              <CommandItem key={item.href} value={item.label} onSelect={() => go(item.href)}>
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
                value={`${s.label} ${s.keywords}`}
                onSelect={() => go(s.href)}
              >
                <s.icon className="size-3.5 opacity-60" />
                {s.label}
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
                value={`${doc.label} ${doc.hint}`}
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
            <CommandItem value="New form" onSelect={() => go("/dashboard?new=1")}>
              <Plus className="size-3.5 opacity-60" />
              <span className="min-w-0 flex-1">New form</span>
              <Kbd>N</Kbd>
            </CommandItem>
            <CommandItem
              value="Light theme"
              onSelect={() => {
                setTheme("light");
                setOpen(false);
              }}
            >
              <Sun className="size-3.5 opacity-60" />
              Light theme
            </CommandItem>
            <CommandItem
              value="Dark theme"
              onSelect={() => {
                setTheme("dark");
                setOpen(false);
              }}
            >
              <Moon className="size-3.5 opacity-60" />
              Dark theme
            </CommandItem>
          </CommandGroup>
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
