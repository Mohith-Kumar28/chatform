"use client";

import { useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { modLabel, plain, useShortcutRunner, type Shortcut } from "@/lib/shortcuts";
import { APP_NAV } from "./app-nav";

/**
 * The keyboard layer outside the builder.
 *
 * Deliberately much smaller than the builder's: the dashboard is a list you
 * look at, not a surface you work on for an hour, so the only things worth a
 * key are getting somewhere and starting a form. Everything else is one click
 * away and would just be a key to forget.
 *
 * Section keys are bare digits to match the builder, and for the same reason —
 * ⌘1–⌘9 belongs to the browser's own tabs.
 */

/** Fired when `N` is pressed while the forms list is already on screen. */
export const NEW_FORM_EVENT = "chatform:new-form";

export function useAppShortcuts(): {
  shortcuts: Shortcut[];
  helpOpen: boolean;
  setHelpOpen: (open: boolean) => void;
} {
  const [helpOpen, setHelpOpen] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  const shortcuts = useMemo<Shortcut[]>(() => {
    const navKeys: Shortcut[] = APP_NAV.map((item, i) => ({
      keys: String(i + 1),
      label: `Go to ${item.label}`,
      group: "Move around",
      match: (e) => plain(e) && !e.shiftKey && e.code === `Digit${i + 1}`,
      run: () => router.push(item.href),
    }));

    return [
      ...navKeys,
      {
        keys: `${modLabel()}K`,
        label: "Search and jump anywhere",
        group: "Move around",
        // Owned by the command palette; listed so the sheet is complete.
        match: () => false,
        run: () => {},
      },
      {
        keys: "N",
        label: "New form",
        group: "Actions",
        match: (e) => plain(e) && e.key.toLowerCase() === "n",
        run: () => {
          /**
           * The dialog belongs to the list, which is already mounted when we
           * are on it — pushing `?new=1` would not remount it and nothing would
           * open. So: shout at it if it is here, navigate if it is not.
           */
          if (pathname === "/dashboard") {
            window.dispatchEvent(new CustomEvent(NEW_FORM_EVENT));
            return;
          }
          router.push("/dashboard?new=1");
        },
      },
      {
        keys: "?",
        label: "Show this list",
        group: "Actions",
        match: (e) => plain(e) && e.key === "?",
        run: () => setHelpOpen(true),
      },
    ];
  }, [router, pathname]);

  useShortcutRunner(shortcuts);

  return { shortcuts, helpOpen, setHelpOpen };
}
