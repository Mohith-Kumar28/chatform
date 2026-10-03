"use client";

import { MARKETING_LINKS, RESOURCE_LINKS } from "./nav-links";
import Link from "next/link";

import { usePathname } from "next/navigation";
import { ChevronDown, Menu } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useSignedIn } from "@/lib/auth/use-signed-in";
import { Logo } from "@/components/brand/logo";
import { cn } from "@/lib/utils";
import dynamic from "next/dynamic";

// Loaded only for a signed-in visitor; see `MarketingAccountButton`.
const MarketingAccountButton = dynamic(
  () => import("./marketing-account-button").then((m) => m.MarketingAccountButton),
  { ssr: false, loading: () => <div className="shimmer size-8 rounded-full" aria-hidden /> },
);

/**
 * The marketing shell DESIGN.md 1.2 specified and never got.
 *
 * Note what is absent: `/templates`. The old nav linked to it as though it
 * were public, but that route sits inside the `(app)` group behind a session
 * guard, so every visitor who clicked it got bounced.
 */

/**
 * Flat links, Templates first. The use-case menu is out of the nav for now;
 * the pages themselves are still live and linked from the footer.
 */
// Shared with the docs shell so both navigate the same way.
const LINKS = MARKETING_LINKS;

export function MarketingNav() {
  /**
   * Not sticky. It sits at the top of the page and scrolls away with it, the
   * owner's call: a bar that first changed its background and then slid out
   * read as a glitch, and the bottom bar (`StickyCta`) is the page's one
   * control once you are reading.
   */
  /**
   * The landing hero is a full-strength brand wash that now runs up behind
   * this bar, and the nav's own colours assume a page-coloured ground: muted
   * grey links and an orange CTA, which on an orange wash is an invisible
   * button on unreadable text. While the bar is transparent over that wash it
   * borrows the band ink instead — the same near-black the hero sets on
   * itself. Every other page has a page-coloured ground and keeps the normal colours.
   */
  const pathname = usePathname();
  const overWash = pathname === "/";
  const ctaVariant = overWash ? ("on-brand" as const) : ("default" as const);
  /**
   * These pages are static, so the session is only knowable in the browser.
   * Until the fetch settles the CTA is a placeholder rather than the
   * signed-out one: drawing "Start free" first and swapping it for "Dashboard"
   * a moment later is what made a signed-in user think every refresh had
   * logged them out.
   */
  const signedIn = useSignedIn();
  const navItem = cn(
    "rounded-full px-3 py-1.5 transition-colors duration-[var(--duration-micro)]",
    overWash ? "font-medium hover:bg-black/5" : "text-foreground/80 hover:text-foreground hover:bg-accent/60",
  );

  return (
    <header
      className="relative z-[var(--z-sticky)]"
      style={overWash ? { color: "var(--on-band-vivid)" } : undefined}
    >
      <nav
        aria-label="Main"
        // Three columns from `lg`, so the links sit in the middle of the
        // screen whatever the widths of the logo and the buttons either side.
        className="mx-auto flex max-w-6xl items-center gap-6 px-6 py-3.5 lg:grid lg:grid-cols-[1fr_auto_1fr]"
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
          className="rounded-md justify-self-start focus-visible:ring-ring/50 focus-visible:ring-[3px]"
        >
          <Logo variant={overWash ? "mono" : "duo"} />
          <span className="sr-only">chatform home</span>
        </Link>

        <ul className="hidden items-center gap-1 lg:flex">
          {LINKS.map((link) => (
            <li key={link.href}>
              {/* `text-body` stays outside `cn`: tailwind-merge reads our
                  custom size as a colour and drops it beside
                  `text-muted-foreground`. */}
              <Link href={link.href} className={`text-body ${navItem}`}>
                {link.label}
              </Link>
            </li>
          ))}
          <li>
            <DropdownMenu>
              <DropdownMenuTrigger className={`text-body group flex items-center gap-1 outline-none ${navItem}`}>
                Resources
                <ChevronDown className="size-3.5 transition-transform duration-200 group-data-[state=open]:rotate-180" strokeWidth={2} />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="center" sideOffset={10} className="w-72 rounded-2xl p-2">
                {RESOURCE_LINKS.map((link) => (
                  <DropdownMenuItem key={link.href} asChild className="cursor-pointer rounded-xl px-3 py-2.5">
                    <Link href={link.href} className="flex flex-col items-start gap-0.5">
                      <span className="text-[0.9375rem] font-semibold">{link.label}</span>
                      <span className="text-muted-foreground text-xs">{link.detail}</span>
                    </Link>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </li>
        </ul>

        <div className="ml-auto flex items-center gap-1.5 lg:ml-0 lg:justify-self-end">
          {/* "Log in" as quiet text, "Sign up free" as the button. They go
              to the two modes of `/signin`, so they are different
              destinations now, and the button stays the one loud thing in the
              bar.

              `on-brand` while the bar is transparent over the hero wash: the
              orange fill would be an orange pill on an orange ground. */}
          {signedIn === null ? (
            <div className="shimmer hidden h-8 w-24 rounded-full sm:block" aria-hidden />
          ) : signedIn ? (
            <>
              <Button asChild size="sm" shape="pill" variant={ctaVariant} className="hidden sm:inline-flex">
                <Link href="/dashboard">Dashboard</Link>
              </Button>
              <MarketingAccountButton />
            </>
          ) : (
            <>
              <Link
                href="/signin"
                className="hidden rounded-full px-3 py-1.5 text-sm font-medium transition-opacity hover:opacity-70 sm:inline-flex"
              >
                Log in
              </Link>
              <Button asChild size="sm" shape="pill" variant={ctaVariant} className="hidden sm:inline-flex">
                <Link href="/signin?mode=signup">Sign up free</Link>
              </Button>
            </>
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
                  {[...LINKS, ...RESOURCE_LINKS].map((link) => (
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
              </div>
              <div className="mt-auto flex flex-col gap-2 p-4">
                {signedIn === null ? (
                  <div className="shimmer h-9 rounded-full" aria-hidden />
                ) : signedIn ? (
                  <SheetClose asChild>
                    <Button asChild shape="pill">
                      <Link href="/dashboard">Dashboard</Link>
                    </Button>
                  </SheetClose>
                ) : (
                  <>
                    <SheetClose asChild>
                      <Button asChild shape="pill">
                        <Link href="/signin?mode=signup">Sign up free</Link>
                      </Button>
                    </SheetClose>
                    <SheetClose asChild>
                      <Button asChild shape="pill" variant="ghost">
                        <Link href="/signin">Log in</Link>
                      </Button>
                    </SheetClose>
                  </>
                )}
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </nav>
    </header>
  );
}
