"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import {
  ArrowLeft,
  Check,
  CircleAlert,
  CloudOff,
  ExternalLink,
  Loader2,
  Redo2,
  Undo2,
} from "lucide-react";
import { motion } from "motion/react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CopyButton } from "@/components/ui/copy-button";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { BUILDER_TABS } from "./builder-tabs";
import { useBuilderStore, useCanRedo, useCanUndo } from "@/stores/builder-store";
import { cn } from "@/lib/utils";

/**
 * The single builder header, mounted in the layout so it persists across tab
 * navigation. Tabs are real links now, so each has a URL, the back button
 * works, and only the active tab's code is loaded.
 */
export function BuilderHeader({
  formId,
  title,
  slug,
  status,
  activeVersion,
  onPublish,
  publishing,
}: {
  formId: string;
  title: string;
  slug: string | null;
  status: string | undefined;
  activeVersion: number | null;
  onPublish: () => void | Promise<void>;
  publishing: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const published = status === "published";

  const undo = useBuilderStore((s) => s.undo);
  const redo = useBuilderStore((s) => s.redo);
  const canUndo = useCanUndo();
  const canRedo = useCanRedo();

  const publicUrl =
    slug && typeof window !== "undefined" ? `${window.location.origin}/f/${slug}` : "";

  return (
    <TooltipProvider delayDuration={300}>
      <header className="bg-card/95 border-border sticky top-0 z-[var(--z-sticky)] border-b backdrop-blur">
        <div className="flex h-14 items-center gap-3 px-3 sm:px-4">
          {/* left: back + identity */}
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <Button variant="ghost" size="icon-sm" asChild aria-label="Back to forms">
              <Link href="/dashboard">
                <ArrowLeft className="size-4" />
              </Link>
            </Button>
            <div className="flex min-w-0 items-center gap-2">
              <h1 className="truncate text-sm font-semibold">{title}</h1>
              <Badge
                variant={published ? "secondary" : "outline"}
                className={cn("shrink-0 gap-1", published && "text-[var(--success)]")}
              >
                {published ? `v${activeVersion ?? 1}` : "Draft"}
              </Badge>
              <SaveIndicator />
            </div>
          </div>

          {/* center: tabs */}
          <nav
            aria-label="Builder sections"
            className="border-border bg-muted/50 hidden items-center gap-0.5 rounded-full border p-1 lg:flex"
          >
            {BUILDER_TABS.map((tab) => {
              const href = `/forms/${formId}/${tab.segment}`;
              const active = pathname === href;
              return (
                <Tooltip key={tab.segment}>
                  <TooltipTrigger asChild>
                    <Link
                      href={href}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "relative isolate flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium",
                        "transition-colors duration-[var(--duration-micro)] ease-[var(--ease-out)]",
                        active
                          ? "text-foreground"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {active && (
                        <motion.span
                          layoutId="builder-tab-pill"
                          className="bg-card shadow-xs absolute inset-0 -z-10 rounded-full"
                          transition={{ type: "spring", stiffness: 500, damping: 40 }}
                        />
                      )}
                      <tab.icon className="size-3.5" strokeWidth={1.75} />
                      <span className="hidden xl:inline">{tab.label}</span>
                    </Link>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    <p className="font-medium">{tab.label}</p>
                    <p className="text-muted-foreground text-micro">{tab.hint}</p>
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </nav>

          {/* Below lg the tab strip collapses. A select is a poor nav control,
              but it beats a horizontally scrolling icon row on a phone. */}
          <select
            aria-label="Builder section"
            className="border-input bg-background h-8 rounded-md border px-2 text-xs lg:hidden"
            value={BUILDER_TABS.find((t) => pathname.endsWith(`/${t.segment}`))?.segment ?? "build"}
            onChange={(e) => router.push(`/forms/${formId}/${e.target.value}`)}
          >
            {BUILDER_TABS.map((t) => (
              <option key={t.segment} value={t.segment}>
                {t.label}
              </option>
            ))}
          </select>

          {/* right: history, links, publish */}
          <div className="flex flex-1 items-center justify-end gap-1">
            <div className="mr-1 hidden items-center gap-0.5 md:flex">
              <IconAction
                label="Undo"
                shortcut="⌘Z"
                icon={Undo2}
                disabled={!canUndo}
                onClick={undo}
              />
              <IconAction
                label="Redo"
                shortcut="⇧⌘Z"
                icon={Redo2}
                disabled={!canRedo}
                onClick={redo}
              />
            </div>

            <ThemeToggle className="mr-1 hidden sm:inline-flex" />

            {slug && published && (
              <>
                <CopyButton value={publicUrl} label={undefined} toastMessage="Link copied" />
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon-sm" asChild>
                      <a href={`/f/${slug}`} target="_blank" rel="noreferrer" aria-label="Open live form">
                        <ExternalLink className="size-3.5" />
                      </a>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">Open live form</TooltipContent>
                </Tooltip>
              </>
            )}

            <Button
              size="sm"
              shape="pill"
              onClick={async () => {
                await onPublish();
                toast.success(published ? "Changes published" : "Form published");
              }}
              disabled={publishing}
              className="ml-1"
            >
              {publishing ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : published ? (
                <Check className="size-3.5" />
              ) : null}
              {published ? "Publish changes" : "Publish"}
            </Button>
          </div>
        </div>
      </header>
    </TooltipProvider>
  );
}

function IconAction({
  label,
  shortcut,
  icon: Icon,
  disabled,
  onClick,
}: {
  label: string;
  shortcut?: string;
  icon: React.ComponentType<{ className?: string }>;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon-sm" onClick={onClick} disabled={disabled} aria-label={label}>
          <Icon className="size-3.5" />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        {label}
        {shortcut && <span className="text-muted-foreground ml-2">{shortcut}</span>}
      </TooltipContent>
    </Tooltip>
  );
}

/**
 * Save status. Every state is nameable — the old header showed three bare
 * strings ("saving…", "unsaved", "saved") and nothing at all when a save failed.
 */
function SaveIndicator() {
  const saveState = useBuilderStore((s) => s.saveState);
  const saveError = useBuilderStore((s) => s.saveError);
  const lastSavedAt = useBuilderStore((s) => s.lastSavedAt);
  const [, force] = useState(0);

  if (saveState === "error") {
    return (
      <span className="text-destructive text-micro flex shrink-0 items-center gap-1" title={saveError ?? undefined}>
        <CircleAlert className="size-3" />
        Not saved
      </span>
    );
  }
  if (saveState === "offline") {
    return (
      <span className="text-muted-foreground text-micro flex shrink-0 items-center gap-1">
        <CloudOff className="size-3" />
        Offline
      </span>
    );
  }
  if (saveState === "saving") {
    return (
      <span className="text-muted-foreground text-micro flex shrink-0 items-center gap-1">
        <Loader2 className="size-3 animate-spin" />
        Saving
      </span>
    );
  }
  if (saveState === "dirty") {
    return <span className="text-muted-foreground text-micro shrink-0">Unsaved</span>;
  }
  return (
    <span
      className="text-muted-foreground text-micro shrink-0"
      onMouseEnter={() => force((n) => n + 1)}
    >
      {lastSavedAt
        ? `Saved ${new Date(lastSavedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
        : "Saved"}
    </span>
  );
}
