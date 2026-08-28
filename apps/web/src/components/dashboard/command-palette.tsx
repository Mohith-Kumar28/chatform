"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Command } from "cmdk";
import {
  FileStack,
  Gauge,
  KeyRound,
  LayoutGrid,
  Moon,
  Plus,
  Sun,
  Users,
} from "lucide-react";
import { useTheme } from "next-themes";
import { customFetch } from "@/lib/api/mutator";
import { Kbd } from "@/components/ui/kbd";
import { BUILDER_TABS } from "@/components/builder/builder-tabs";
import { cn } from "@/lib/utils";

interface FormRow {
  id: string;
  title: string;
  status: string;
}

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

  const { data } = useQuery({
    queryKey: ["forms"],
    queryFn: () => customFetch<unknown>("/api/forms"),
    // Only fetch once the palette has been opened at least once.
    enabled: open,
    staleTime: 60_000,
  });
  const forms = (Array.isArray(data) ? data : []) as FormRow[];

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
        className="bg-card border-border shadow-lg w-full max-w-lg overflow-hidden rounded-xl border"
      >
        <Command.Input
          autoFocus
          placeholder="Search forms or jump to a page…"
          className="border-border placeholder:text-muted-foreground w-full border-b bg-transparent px-4 py-3 text-sm outline-none"
        />
        <Command.List className="max-h-80 overflow-y-auto p-2">
          <Command.Empty className="text-muted-foreground py-8 text-center text-sm">
            Nothing matches that.
          </Command.Empty>

          {builder && (
            <Command.Group heading="This form" className={GROUP}>
              {BUILDER_TABS.map((tab, i) => (
                <Command.Item
                  key={tab.segment}
                  value={`${tab.label} ${tab.hint}`}
                  onSelect={() => go(`/forms/${builder.formId}/${tab.segment}`)}
                  className={ITEM}
                >
                  <tab.icon className="size-3.5 opacity-60" />
                  <span className="min-w-0 flex-1 truncate">{tab.label}</span>
                  <Kbd>{i + 1}</Kbd>
                </Command.Item>
              ))}
            </Command.Group>
          )}

          {forms.length > 0 && (
            <Command.Group heading="Forms" className={GROUP}>
              {forms.map((f) => (
                <Command.Item key={f.id} value={f.title} onSelect={() => go(`/forms/${f.id}/build`)} className={ITEM}>
                  <LayoutGrid className="size-3.5 opacity-60" />
                  <span className="min-w-0 flex-1 truncate">{f.title}</span>
                  <span className="text-muted-foreground shrink-0 text-xs">{f.status}</span>
                </Command.Item>
              ))}
            </Command.Group>
          )}

          <Command.Group heading="Go to" className={GROUP}>
            {[
              { label: "Forms", href: "/dashboard", icon: LayoutGrid },
              { label: "Templates", href: "/templates", icon: FileStack },
              { label: "API keys", href: "/api-keys", icon: KeyRound },
              { label: "Usage", href: "/usage", icon: Gauge },
              { label: "Team", href: "/team", icon: Users },
            ].map((item) => (
              <Command.Item key={item.href} value={item.label} onSelect={() => go(item.href)} className={ITEM}>
                <item.icon className="size-3.5 opacity-60" />
                {item.label}
              </Command.Item>
            ))}
          </Command.Group>

          <Command.Group heading="Actions" className={GROUP}>
            <Command.Item value="New form" onSelect={() => go("/dashboard?new=1")} className={ITEM}>
              <Plus className="size-3.5 opacity-60" />
              <span className="min-w-0 flex-1">New form</span>
              <Kbd>N</Kbd>
            </Command.Item>
            <Command.Item
              value="Light theme"
              onSelect={() => {
                setTheme("light");
                setOpen(false);
              }}
              className={ITEM}
            >
              <Sun className="size-3.5 opacity-60" />
              Light theme
            </Command.Item>
            <Command.Item
              value="Dark theme"
              onSelect={() => {
                setTheme("dark");
                setOpen(false);
              }}
              className={ITEM}
            >
              <Moon className="size-3.5 opacity-60" />
              Dark theme
            </Command.Item>
          </Command.Group>
        </Command.List>

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

const GROUP =
  "[&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium";
const ITEM = cn(
  "flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2 text-sm outline-none",
  "data-[selected=true]:bg-muted",
);
