"use client";

import Link from "next/link";
import { AuthGuard } from "./auth-guard";
import { AppNav } from "./app-nav";
import { UsagePill } from "./usage-pill";
import { UserMenu } from "./user-menu";
import { WorkspaceSwitcher } from "./workspace-switcher";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { CommandPalette } from "./command-palette";

/**
 * App chrome for every authenticated non-builder page.
 *
 * Session gating lives in AuthGuard so this component and the builder shell
 * share one implementation — they used to duplicate the same redirect logic.
 */
export function DashboardShell({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <div className="flex min-h-svh flex-col">
        <header className="bg-card/95 border-border sticky top-0 z-[var(--z-sticky)] border-b backdrop-blur">
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
              <UsagePill />
              <ThemeToggle />
              <UserMenu />
            </div>
          </div>
        </header>

        <main className="min-h-0 flex-1">{children}</main>
        <CommandPalette />
      </div>
    </AuthGuard>
  );
}
