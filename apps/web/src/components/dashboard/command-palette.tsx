"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  FileStack,
  Gauge,
  KeyRound,
  Plug,
  LayoutGrid,
  Moon,
  Plus,
  Sun,
  Users,
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
import { BUILDER_TABS } from "@/components/builder/builder-tabs";
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
  const { data } = useGetApiForms({
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
                    onSelect={() => go(`/templates?t=${t.slug}`)}
                  >
                    <Icon className="size-3.5 opacity-60" />
                    <span className="min-w-0 flex-1 truncate">{t.title}</span>
                    <span className="text-muted-foreground shrink-0 text-xs">{t.category}</span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          )}

          <CommandGroup heading="Go to">
            {[
              { label: "Forms", href: "/dashboard", icon: LayoutGrid },
              { label: "Templates", href: "/templates", icon: FileStack },
              { label: "Integrations", href: "/integrations", icon: Plug },
              { label: "API keys", href: "/api-keys", icon: KeyRound },
              { label: "Usage", href: "/usage", icon: Gauge },
              { label: "Team", href: "/team", icon: Users },
            ].map((item) => (
              <CommandItem key={item.href} value={item.label} onSelect={() => go(item.href)}>
                <item.icon className="size-3.5 opacity-60" />
                {item.label}
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
