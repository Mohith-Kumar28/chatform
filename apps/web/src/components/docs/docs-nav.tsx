"use client";

import Link from "next/link";
import { ThemeToggle } from "@/components/theme/theme-toggle";

/**
 * The docs header.
 *
 * Deliberately almost empty. It used to carry the marketing nav — Why chat?,
 * Compare, Pricing — on the theory that someone arriving on a reference page
 * from a search result should be one click from the pricing page. What that
 * actually produced was three links back to the sales site sitting above the
 * reference for an API the reader has already chosen, competing with the one
 * control they want. Those pages are still one click away: the marketing
 * footer runs under every docs page, and the brand at the top of the sidebar
 * links home.
 *
 * The theme control lives here and nowhere else. Fumadocs draws its own at the
 * foot of the sidebar; both were on screen at once, and with no icon links
 * beside it the sidebar one rendered as a wide empty box with two icons pinned
 * to its right edge. `themeSwitch: { enabled: false }` in the layout turns that
 * one off — see the note there.
 */
export function DocsNav() {
  return (
    <div className="flex w-full items-center justify-end gap-3 px-4">
      <ThemeToggle />
      <Link
        href="/signin"
        className="bg-primary text-on-primary text-caption rounded-full px-4 py-1.5 font-medium"
      >
        Get an API key
      </Link>
    </div>
  );
}
