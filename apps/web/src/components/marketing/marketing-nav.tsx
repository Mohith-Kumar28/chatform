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
  const [scrolled, setScrolled] = useState(false);
  /**
   * Out of the way while reading, back the moment you scroll up.
   *
   * Hidden only once the page is past the first screen's top and the last
   * movement was downward; any upward scroll brings it straight back, and so
   * does returning to the top. The bottom CTA (`StickyCta`) carries the one
   * action that matters while the bar is away.
   */
  const [hidden, setHidden] = useState(false);
  /**
   * The landing hero is a full-strength brand wash that now runs up behind
   * this bar, and the nav's own colours assume a page-coloured ground: muted
   * grey links and an orange CTA, which on an orange wash is an invisible
   * button on unreadable text. While the bar is transparent over that wash it
   * borrows the band ink instead — the same near-black the hero sets on
   * itself. Once scrolled, the backdrop is back and so are the normal colours.
   */
  const pathname = usePathname();
  const overWash = pathname === "/";
  /**
   * The template gallery pins its own search bar to the top of the viewport,
   * so a nav sliding back in on scroll-up lands on top of it. There the bar
   * stays away until you are back at the top of the page.
   */
  const staysHidden = pathname.startsWith("/form-templates");
  const ctaVariant = overWash && !scrolled ? ("on-brand" as const) : ("default" as const);
  /**
   * These pages are static, so the session is only knowable in the browser.
   * Until the fetch settles the CTA is a placeholder rather than the
   * signed-out one: drawing "Start free" first and swapping it for "Dashboard"
   * a moment later is what made a signed-in user think every refresh had
   * logged them out.
   */
  const signedIn = useSignedIn();

  useEffect(() => {
    let last = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      setScrolled(y > 8);
      if (Math.abs(y - last) > 6) {
        setHidden(y > 120 && (staysHidden || y > last));
        last = y;
      }
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [staysHidden]);

  return (
    <header
      className={cn(
        // The border is always there and only changes colour, so turning the
        // backdrop on never adds a pixel to the bar's height.
        "sticky top-0 z-[var(--z-sticky)] border-b border-transparent transition-[transform,background-color,border-color] duration-[var(--duration-standard)] ease-[var(--ease-out)] motion-reduce:transition-none",
        scrolled && "bg-background/90 border-border/60 backdrop-blur-md",
        hidden && "-translate-y-full",
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
          {LINKS.map((link) => (
            <li key={link.href}>
              <Link
                href={link.href}
                // `text-body` stays outside `cn`: tailwind-merge reads our
                // custom size as a colour and drops it beside
                // `text-muted-foreground`, so the links grew 2px on scroll.
                className={`text-body ${cn(
                  "rounded-full px-3 py-1.5 transition-colors duration-[var(--duration-micro)]",
                  overWash && !scrolled
                    ? "font-medium hover:bg-black/5"
                    : "text-foreground/80 hover:text-foreground hover:bg-accent/60",
                )}`}
              >
                {link.label}
              </Link>
            </li>
          ))}
        </ul>

        <div className="ml-auto flex items-center gap-1.5 lg:ml-0">
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
