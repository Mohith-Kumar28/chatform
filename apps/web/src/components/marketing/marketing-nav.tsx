"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
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
import { Logo } from "@/components/brand/logo";
import { cn } from "@/lib/utils";

/**
 * The marketing shell DESIGN.md 1.2 specified and never got.
 *
 * Note what is absent: `/templates`. The old nav linked to it as though it
 * were public, but that route sits inside the `(app)` group behind a session
 * guard, so every visitor who clicked it got bounced.
 */

/**
 * Four links, not five. `/#question-types` is gone because the section it
 * pointed at is gone — the 26-tile grid moved to `/pricing#question-types`,
 * and `/#compare` moved with it. A nav link to an anchor that no longer
 * exists scrolls nowhere and says nothing, which is exactly the bug the
 * removed `/templates` link had.
 */
const LINKS = [
  { href: "/#the-moment", label: "How it answers" },
  { href: "/#product", label: "How it works" },
  { href: "/#developers", label: "Developers" },
  { href: "/pricing", label: "Pricing" },
] as const;

export function MarketingNav() {
  const [scrolled, setScrolled] = useState(false);

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
    >
      <nav
        aria-label="Main"
        className="mx-auto flex max-w-6xl items-center gap-6 px-6 py-3.5"
      >
        <Link href="/" className="rounded-md focus-visible:ring-ring/50 focus-visible:ring-[3px]">
          <Logo />
          <span className="sr-only">chatform home</span>
        </Link>

        <ul className="hidden flex-1 items-center gap-1 lg:flex">
          {LINKS.map((link) => (
            <li key={link.href}>
              <Link
                href={link.href}
                className="text-body text-muted-foreground hover:text-foreground hover:bg-accent/60 rounded-full px-3 py-1.5 transition-colors duration-[var(--duration-micro)]"
              >
                {link.label}
              </Link>
            </li>
          ))}
        </ul>

        <div className="ml-auto flex items-center gap-1.5 lg:ml-0">
          <ThemeToggle />
          <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
            <Link href="/signin">Sign in</Link>
          </Button>
          <Button asChild size="sm" shape="pill" className="hidden sm:inline-flex">
            <Link href="/signin">Start free</Link>
          </Button>

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
              <ul className="flex flex-col gap-1 px-4">
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
              <div className="mt-auto flex flex-col gap-2 p-4">
                <SheetClose asChild>
                  <Button asChild variant="outline" shape="pill">
                    <Link href="/signin">Sign in</Link>
                  </Button>
                </SheetClose>
                <SheetClose asChild>
                  <Button asChild shape="pill">
                    <Link href="/signin">Start free</Link>
                  </Button>
                </SheetClose>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </nav>
    </header>
  );
}
