"use client";

import Link from "next/link";
import { AuthGuard } from "./auth-guard";
import { AppNav } from "./app-nav";
import { UsagePill } from "./usage-pill";
import { UserMenu } from "./user-menu";
import { WorkspaceSwitcher } from "./workspace-switcher";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { CommandPalette, openCommandPalette } from "./command-palette";
import { useAppShortcuts } from "./use-app-shortcuts";
import { ShortcutsDialog } from "@/components/ui/shortcuts-dialog";
import { Kbd } from "@/components/ui/kbd";
import { useModLabel } from "@/lib/shortcuts";

/**
 * App chrome for every authenticated non-builder page.
 *
 * Session gating lives in AuthGuard so this component and the builder shell
 * share one implementation — they used to duplicate the same redirect logic.
 */
export function DashboardShell({ children }: { children: React.ReactNode }) {
  const { shortcuts, helpOpen, setHelpOpen } = useAppShortcuts();
  const kmod = useModLabel();

  return (
    <AuthGuard>
      <div className="flex min-h-svh flex-col">
        <header className="bg-card/95 sticky top-0 z-[var(--z-sticky)] backdrop-blur">
          <div className="mx-auto flex h-14 w-full max-w-7xl items-center gap-3 px-4 sm:px-6">
            <Link href="/dashboard" className="flex shrink-0 items-center gap-2">
              <span className="bg-primary text-primary-foreground grid size-7 place-items-center rounded-lg text-sm font-bold">
                c
              </span>
              <span className="font-display hidden font-semibold sm:inline">chatform</span>
            </Link>

            <WorkspaceSwitcher />

            <div className="mx-auto">
              <AppNav />
            </div>

            <div className="flex shrink-0 items-center gap-2">
              {/*
                The palette has been ⌘K-only since it was built, which means it
                existed for the people who already guessed it existed. This is
                the smallest thing that tells everyone else.
              */}
              <button
                type="button"
                onClick={openCommandPalette}
                className="text-muted-foreground hover:text-foreground hover:bg-muted/60 hidden items-center gap-2 rounded-full py-1.5 pr-1.5 pl-3 text-sm transition-colors md:flex"
              >
                Search
                <Kbd>{`${kmod}K`}</Kbd>
              </button>
              <UsagePill />
              <ThemeToggle />
              <UserMenu />
            </div>
          </div>
        </header>

        <main className="min-h-0 flex-1">{children}</main>
        <CommandPalette />
        <ShortcutsDialog
          open={helpOpen}
          onOpenChange={setHelpOpen}
          shortcuts={shortcuts}
          footnote="Deleting a form has no shortcut on purpose — it takes every response with it."
        />
      </div>
    </AuthGuard>
  );
}
