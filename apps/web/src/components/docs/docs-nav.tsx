"use client";

import Link from "next/link";
import { MARKETING_LINKS } from "@/components/marketing/nav-links";
import { ThemeToggle } from "@/components/theme/theme-toggle";

/**
 * The docs header.
 *
 * Deliberately the marketing nav's links, not a docs-only set: someone who lands
 * on a reference page from a search result should be one click from the pricing
 * page they would have reached from the home page.
 */
export function DocsNav() {
  return (
    <div className="flex w-full items-center gap-6 px-4">
      <Link href="/" className="font-display text-h3 shrink-0 tracking-tight">
        chatform
      </Link>
      <nav className="text-body hidden items-center gap-5 md:flex">
        {MARKETING_LINKS.filter((l) => l.href !== "/docs").map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            {link.label}
          </Link>
        ))}
      </nav>
      <div className="ml-auto flex items-center gap-3">
        <ThemeToggle />
        <Link
          href="/signin"
          className="bg-primary text-on-primary text-caption rounded-full px-4 py-1.5 font-medium"
        >
          Get an API key
        </Link>
      </div>
    </div>
  );
}
