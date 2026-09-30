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
 * Everyone starts in light, whatever their operating system says. Dark and
 * System stay one click away in the theme menu, and a stored choice always
 * wins over `defaultTheme`.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemes attribute="class" defaultTheme="light" enableSystem disableTransitionOnChange>
      {children}
    </NextThemes>
  );
}
