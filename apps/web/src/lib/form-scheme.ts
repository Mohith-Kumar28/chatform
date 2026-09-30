"use client";

import { useSyncExternalStore } from "react";
import { resolveScheme, type ThemeDoc } from "@repo/form-schema";

// The rule itself lives in the shared package (the API makes forms dark too).
export { appearanceOf, resolveScheme, withAppearance } from "@repo/form-schema";

/** The form's theme with its light/dark choice applied, following the device for `auto`. */
export function useSchemeTheme(theme: ThemeDoc): ThemeDoc {
  const prefersDark = usePrefersDark(theme.colorScheme === "auto");
  return resolveScheme(theme, prefersDark);
}

const QUERY = "(prefers-color-scheme: dark)";

/**
 * The device's preference, live. Only subscribed when a form is on `auto`,
 * and false on the server, so a light form never waits on it.
 */
function usePrefersDark(watch: boolean): boolean {
  return useSyncExternalStore(
    (onChange) => {
      if (!watch || typeof window === "undefined") return () => {};
      const media = window.matchMedia(QUERY);
      media.addEventListener("change", onChange);
      return () => media.removeEventListener("change", onChange);
    },
    () => watch && typeof window !== "undefined" && window.matchMedia(QUERY).matches,
    () => false,
  );
}
