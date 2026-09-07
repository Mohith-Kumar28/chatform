"use client";

import { ThemeProvider as NextThemes } from "next-themes";

/**
 * `.dark` was fully defined in globals.css and never activated — there was no
 * provider, so the class was never applied and `dark:` never fired.
 *
 * `attribute="class"` matches the `@custom-variant dark (&:is(.dark *))` in
 * globals.css. Transitions are disabled during the swap so the whole page does
 * not cross-fade every color at once when toggling.
 *
 * `defaultTheme="system"` follows the operating system until somebody chooses
 * otherwise in the account menu, and `defaultTheme` only decides what happens
 * before there is a choice — a stored Light or Dark always wins over it.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemes attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      {children}
    </NextThemes>
  );
}
