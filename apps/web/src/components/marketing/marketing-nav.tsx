"use client";

import { MARKETING_LINKS } from "./nav-links";
import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { useSession } from "@/lib/auth/auth-client";
import { Logo } from "@/components/brand/logo";
import { UseCasesMenu } from "./use-cases-menu";
import { USE_CASE_GROUPS } from "@/content/use-cases";
import { cn } from "@/lib/utils";

/**
 * The marketing shell DESIGN.md 1.2 specified and never got.
 *
 * Note what is absent: `/templates`. The old nav linked to it as though it
 * were public, but that route sits inside the `(app)` group behind a session
 * guard, so every visitor who clicked it got bounced.
 */

/**
 * Four flat links, plus the one that opens.
 *
 * `Use cases` is a menu rather than a link because the answer to "can it do
 * the thing I need?" is a list, and a list of twelve specific jobs is more
 * persuasive at a glance than any single page about them. It sits first: most
 * people arriving here are not shopping for a form builder in the abstract,
 * they have one thing they need to ask people, and the nav should show them
 * their thing before it shows them ours.
 */
// Shared with the docs shell so both navigate the same way.
const LINKS = MARKETING_LINKS;

export function MarketingNav() {
  const [scrolled, setScrolled] = useState(false);
  /**
   * The landing hero is a full-strength brand wash that now runs up behind
   * this bar, and the nav's own colours assume a page-coloured ground: muted
   * grey links and an orange CTA, which on an orange wash is an invisible
   * button on unreadable text. While the bar is transparent over that wash it
   * borrows the band ink instead — the same near-black the hero sets on
   * itself. Once scrolled, the backdrop is back and so are the normal colours.
   */
  const overWash = usePathname() === "/";
  const ctaVariant = overWash && !scrolled ? ("on-brand" as const) : ("default" as const);
  /**
   * These pages are static, so the session is only knowable in the browser.
   * Until the fetch settles the CTA is a placeholder rather than the
   * signed-out one: drawing "Start free" first and swapping it for "Dashboard"
   * a moment later is what made a signed-in user think every refresh had
   * logged them out.
   */
  const { data: session, isPending } = useSession();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={cn(
        "sticky top-0 z-[var(--z-sticky)] transition-colors duration-[var(--duration-standard)] ease-[var(--ease-out)]",
        scrolled && "bg-background/80 border-border/60 border-b backdrop-blur-md",
      )}
      style={overWash && !scrolled ? { color: "var(--on-band-vivid)" } : undefined}
    >
      <nav
        aria-label="Main"
        className="mx-auto flex max-w-6xl items-center gap-6 px-6 py-3.5"
      >
        {/* Over the hero the two-tone mark is two brand-coloured plates on a
            brand-coloured wash: the orange plate all but disappears into the
            orange half of the ground.
            The answer is the `mono` variant, which the logo has carried since
            the CTA band needed it and whose note says exactly this — two-tone
            on a brand ground is a colour clash, not a logo. It draws the whole
            silhouette in `currentColor`, so here it picks up the near-black the
            header is already using and the mark reads at full contrast with no
            plate, no border and no second surface. A pale plate was the first
            attempt and it was worse: `--background` is charcoal in the dark
            theme, so it put near-black type on a near-black pill. */}
        <Link
          href="/"
          className="rounded-md focus-visible:ring-ring/50 focus-visible:ring-[3px]"
        >
          <Logo variant={overWash && !scrolled ? "mono" : "duo"} />
          <span className="sr-only">chatform home</span>
        </Link>

        <ul className="hidden flex-1 items-center gap-1 lg:flex">
          <UseCasesMenu onWash={overWash && !scrolled} />
          {LINKS.map((link) => (
            <li key={link.href}>
              <Link
                href={link.href}
                className={cn(
                  "text-body rounded-full px-3 py-1.5 transition-colors duration-[var(--duration-micro)]",
                  overWash && !scrolled
                    ? "opacity-75 hover:bg-black/5 hover:opacity-100"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent/60",
                )}
              >
                {link.label}
              </Link>
            </li>
          ))}
        </ul>

        <div className="ml-auto flex items-center gap-1.5 lg:ml-0">
          <ThemeToggle />
          {/* One button, not two.

              It was "Sign in" beside "Start free", which is a choice offered
              to somebody who has not been given anything to choose between:
              both links went to `/signin`, the same page, which signs you in
              or creates the account depending on the address you type. Two
              controls with one destination cost the visitor a decision and the
              bar its emphasis — the primary action was sitting next to a
              same-sized sibling arguing with it.

              "Start free" is the one that survives, because it is the one that
              says what happens next. A returning user is not stranded by it:
              this bar shows "Dashboard" once the session resolves, and the
              page it lands on signs them in either way.

              `on-brand` while the bar is transparent over the hero wash: the
              orange fill would be an orange pill on an orange ground. */}
          {isPending ? (
            <div className="shimmer hidden h-8 w-24 rounded-full sm:block" aria-hidden />
          ) : session ? (
            <Button asChild size="sm" shape="pill" variant={ctaVariant} className="hidden sm:inline-flex">
              <Link href="/dashboard">Dashboard</Link>
            </Button>
          ) : (
            <Button asChild size="sm" shape="pill" variant={ctaVariant} className="hidden sm:inline-flex">
              <Link href="/signin">Start free</Link>
            </Button>
          )}

          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon-sm" className="lg:hidden" aria-label="Open menu">
                <Menu className="size-4" strokeWidth={1.75} />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-[min(20rem,85vw)]">
              <SheetHeader>
                <SheetTitle className="text-left">
                  <Logo />
                </SheetTitle>
              </SheetHeader>
              {/* On a phone there is no hover, so the menu is flattened into
                  the sheet rather than reproduced as a nested disclosure
                  somebody has to open with a thumb. */}
              <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
                <ul className="flex flex-col gap-1">
                  {LINKS.map((link) => (
                    <li key={link.href}>
                      <SheetClose asChild>
                        <Link
                          href={link.href}
                          className="text-body-lg hover:bg-accent/60 block rounded-lg px-3 py-2.5"
                        >
                          {link.label}
                        </Link>
                      </SheetClose>
                    </li>
                  ))}
                </ul>

                <p className="text-micro text-muted-foreground mt-5 px-3 font-semibold tracking-[0.12em] uppercase">
                  Use cases
                </p>
                <ul className="mt-1.5 flex flex-col gap-0.5">
                  {USE_CASE_GROUPS.flatMap((group) => group.items).map((item) => (
                    <li key={item.slug}>
                      <SheetClose asChild>
                        <Link
                          href={item.path}
                          className="text-body hover:bg-accent/60 block rounded-lg px-3 py-2"
                        >
                          {item.name}
                        </Link>
                      </SheetClose>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="mt-auto flex flex-col gap-2 p-4">
                {isPending ? (
                  <div className="shimmer h-9 rounded-full" aria-hidden />
                ) : session ? (
                  <SheetClose asChild>
                    <Button asChild shape="pill">
                      <Link href="/dashboard">Dashboard</Link>
                    </Button>
                  </SheetClose>
                ) : (
                  <SheetClose asChild>
                    <Button asChild shape="pill">
                      <Link href="/signin">Start free</Link>
                    </Button>
                  </SheetClose>
                )}
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </nav>
    </header>
  );
}
