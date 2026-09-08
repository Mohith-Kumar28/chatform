"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, Search, Settings as SettingsIcon } from "lucide-react";
import { AuthGuard } from "./auth-guard";
import { APP_NAV } from "./app-nav";
import { AppMark } from "./app-mark";
import { PlanBadge } from "./plan-badge";
import { UserMenu } from "./user-menu";
import { UsagePill } from "./usage-pill";
import { OrganizationSwitcher } from "./organization-switcher";
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
              <AppMark />
              <span className="font-display hidden font-semibold sm:inline">chatform</span>
            </Link>

            {/* The organization only. Workspace moved down onto the forms
                toolbar, where the list it scopes actually is: the header is
                every screen, and a folder of forms means nothing on Settings or
                Templates. Two nested switchers side by side also read as one
                two-part control, which is what made picking the wrong one easy. */}
            <div className="hidden items-center gap-1 md:flex">
              <OrganizationSwitcher />
            </div>

            {/*
              No nav pills.

              There were five, then three, and the honest end of that argument is
              zero: Forms is the product and the logo already goes there, the
              templates gallery is a second door to a picker the New form flow
              already opens, and usage is only worth looking at when something is
              close to running out — which `UsagePill` says, when it is true, and
              says nothing the rest of the time. A one-item pill nav is not a nav.

              Everything that used to be a pill is a keystroke away in ⌘K and a
              click away behind the gear.
            */}
            <div className="ml-auto flex shrink-0 items-center gap-1.5">
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
              <PlanBadge />
              {/* The gear is here as well as in the account menu, because
                  Settings absorbed two nav items and a dropdown entry — burying
                  the only door to all of it one level deep would have made those
                  screens harder to reach, not easier. */}
              <Button variant="ghost" size="icon-sm" asChild aria-label="Settings">
                <Link href="/settings">
                  <SettingsIcon className="size-4" strokeWidth={1.75} />
                </Link>
              </Button>
              {/* Theme moved into the account menu: it is a setting you change
                  once, and it was spending a permanent header slot next to the
                  avatar that opens a menu with room for it. */}
              <UserMenu />
            </div>
          </div>
        </header>

        <Sheet open={navOpen} onOpenChange={setNavOpen}>
          <SheetContent side="left" className="w-72 p-0">
            <SheetHeader className="border-border border-b p-4 text-left">
              <SheetTitle className="font-display">chatform</SheetTitle>
            </SheetHeader>
            <div className="flex flex-col items-start gap-1 p-4">
              <OrganizationSwitcher />
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
                      // Violet marks where you are, throughout the chrome —
                      // the header spends the same colour on nothing else now
                      // that the pills are gone.
                      active
                        ? "bg-brand-violet-soft text-brand-violet-soft-foreground font-medium"
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
        />
      </div>
    </AuthGuard>
  );
}
