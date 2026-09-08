"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, Search } from "lucide-react";
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

            {/* One control, not three.

                This slot used to hold the organization switcher, the workspace
                switcher and a settings gear. The workspace switcher moved down
                onto the forms toolbar, where the list it scopes actually is —
                the header is every screen, and a folder of forms means nothing
                on Settings or Templates. The gear moved inside this menu, onto
                the line naming the organization it configures; it was a
                permanent header slot pointing at a page most people open
                rarely, and what it opens (members, plan, workspaces, API keys)
                is the organization, not the account.

                `UserMenu` still carries its own Settings item, so the phone —
                where this trigger is hidden — keeps a door to the same place. */}
            <div className="hidden items-center md:flex">
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
            {/* The switcher, and the gear inside it.

                A standalone gear sat here until the trigger beside it stopped
                being `hidden md:inline-flex` — which meant this row had been
                rendering a lone settings button next to an invisible switcher
                on every phone. The trigger now shows wherever it is placed and
                the header gates it instead, so the drawer gets the real control
                and the gear travels inside its menu like everywhere else. */}
            <div className="flex items-center p-4">
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
