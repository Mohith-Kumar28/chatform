"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, Search } from "lucide-react";
import { AuthGuard } from "./auth-guard";
import { AppNav, APP_NAV } from "./app-nav";
import { UsagePill } from "./usage-pill";
import { UserMenu } from "./user-menu";
import { WorkspaceSwitcher } from "./workspace-switcher";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { CommandPalette, openCommandPalette } from "./command-palette";
import { useAppShortcuts } from "./use-app-shortcuts";
import { ShortcutsDialog } from "@/components/ui/shortcuts-dialog";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useModLabel } from "@/lib/shortcuts";
import { cn } from "@/lib/utils";

/**
 * App chrome for every authenticated non-builder page.
 *
 * Session gating lives in AuthGuard so this component and the builder shell
 * share one implementation — they used to duplicate the same redirect logic.
 */
export function DashboardShell({ children }: { children: React.ReactNode }) {
  const { shortcuts, helpOpen, setHelpOpen } = useAppShortcuts();
  const kmod = useModLabel();
  const pathname = usePathname();
  const [navOpen, setNavOpen] = useState(false);

  return (
    <AuthGuard>
      <div className="flex min-h-svh flex-col">
        <header className="bg-card/95 sticky top-0 z-[var(--z-sticky)] backdrop-blur">
          <div className="mx-auto flex h-14 w-full max-w-7xl items-center gap-3 px-4 sm:px-6">
            {/* Below `md` the nav used to collapse to five unlabelled icons
                competing with the logo, the workspace switcher and the avatar
                for a phone's width. It is a drawer there now, with labels. */}
            <Button
              variant="ghost"
              size="icon-sm"
              className="md:hidden"
              aria-label="Open navigation"
              onClick={() => setNavOpen(true)}
            >
              <Menu className="size-4" />
            </Button>

            <Link href="/dashboard" className="flex shrink-0 items-center gap-2">
              <span className="bg-primary text-primary-foreground grid size-7 place-items-center rounded-lg text-sm font-bold">
                c
              </span>
              <span className="font-display hidden font-semibold sm:inline">chatform</span>
            </Link>

            <div className="hidden md:block">
              <WorkspaceSwitcher />
            </div>

            <div className="mx-auto hidden md:block">
              <AppNav />
            </div>

            <div className="ml-auto flex shrink-0 items-center gap-1.5 md:ml-0">
              {/*
                The palette has been ⌘K-only since it was built, which means it
                existed for the people who already guessed it existed. This is
                the smallest thing that tells everyone else.
              */}
              <button
                type="button"
                onClick={openCommandPalette}
                className="text-muted-foreground hover:text-foreground hover:bg-muted/60 hidden items-center gap-2 rounded-full py-1.5 pr-1.5 pl-3 text-sm transition-colors duration-[var(--duration-micro)] md:flex"
              >
                Search
                <Kbd>{`${kmod}K`}</Kbd>
              </button>
              <Button
                variant="ghost"
                size="icon-sm"
                className="md:hidden"
                aria-label="Search"
                onClick={openCommandPalette}
              >
                <Search className="size-4" />
              </Button>
              <UsagePill />
              <ThemeToggle />
              <UserMenu />
            </div>
          </div>
        </header>

        <Sheet open={navOpen} onOpenChange={setNavOpen}>
          <SheetContent side="left" className="w-72 p-0">
            <SheetHeader className="border-border border-b p-4 text-left">
              <SheetTitle className="font-display">chatform</SheetTitle>
            </SheetHeader>
            <div className="p-4">
              <WorkspaceSwitcher />
            </div>
            <nav className="space-y-0.5 px-2 pb-4" aria-label="Main">
              {APP_NAV.map((item) => {
                const active = pathname === item.href || pathname.startsWith(item.href + "/");
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    // Closed on the tap, not in an effect watching the path: a
                    // drawer that outlives the navigation is a drawer covering
                    // the page you just asked for.
                    onClick={() => setNavOpen(false)}
                    className={cn(
                      "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm",
                      "transition-colors duration-[var(--duration-micro)]",
                      active
                        ? "bg-primary-soft text-primary font-medium"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                  >
                    <item.icon className="size-4" strokeWidth={1.75} />
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </SheetContent>
        </Sheet>

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
