"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { Monitor } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useBuilderStore } from "@/stores/builder-store";
import { BUILDER_TABS } from "./builder-tabs";

/**
 * The narrowest window the editing canvas is laid out for — Tailwind's `lg`.
 *
 * Questions, the live preview and the inspector sit side by side. At 1024 that
 * is 240 + 464 + 320, and the preview column is still wider than a phone, which
 * is what it is showing. Below that something has to go, and every version of
 * "something goes" — hiding the inspector, stacking the panels — left an editor
 * that looked usable and was not: the settings for the question you picked were
 * simply nowhere. Saying so is better than a half-working screen.
 *
 * Keep in step with the `lg:` variant on the overlay below.
 */
const WIDE_ENOUGH = "(min-width: 64rem)";

/** The tabs that are single-column already and work at any width. */
const ANYWHERE = BUILDER_TABS.filter((t) =>
  (["results", "share", "integrate", "settings"] as string[]).includes(t.segment),
);

function subscribe(onChange: () => void) {
  const mq = window.matchMedia(WIDE_ENOUGH);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

/**
 * Wraps the Build and Flow views, and covers them when the window is too narrow
 * to edit in.
 *
 * The overlay is shown by CSS, so it is right on the first paint with no flash
 * of a squeezed editor. The media query only decides whether the editor behind
 * it is `inert` — without that, Tab walks straight into controls you cannot see.
 */
export function SmallScreenGate({ children }: { children: React.ReactNode }) {
  const formId = useBuilderStore((s) => s.formId);
  const narrow = useSyncExternalStore(
    subscribe,
    () => !window.matchMedia(WIDE_ENOUGH).matches,
    () => false,
  );

  return (
    <>
      <div inert={narrow}>{children}</div>

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="small-screen-title"
        className="bg-background/60 fixed inset-0 z-[var(--z-overlay)] flex items-center justify-center overflow-y-auto p-4 backdrop-blur-md lg:hidden"
      >
        <div className="bg-card w-full max-w-sm rounded-2xl p-6 text-center shadow-xl">
          <div className="bg-primary-soft text-primary mx-auto mb-4 grid size-10 place-items-center rounded-xl">
            <Monitor className="size-5" />
          </div>
          <p className="text-muted-foreground text-micro font-medium tracking-wide uppercase">
            Larger screen needed
          </p>
          <h2 id="small-screen-title" className="mt-1.5 text-lg font-semibold text-balance">
            The builder needs a wider window
          </h2>
          <p className="text-muted-foreground mt-2 text-sm text-pretty">
            Your questions, their settings and the live preview sit side by side. Open this
            form on a laptop or desktop to edit it.
          </p>

          <p className="mt-4 rounded-lg bg-[var(--info-soft)] px-3 py-2.5 text-left text-xs text-pretty text-[var(--info)]">
            Already on a computer? Widen the window or zoom out (⌘ −) and this goes away.
          </p>

          {formId && (
            <>
              <p className="text-muted-foreground text-micro mt-5 mb-2 font-medium tracking-wide uppercase">
                Works on any screen
              </p>
              <div className="grid grid-cols-2 gap-2">
                {ANYWHERE.map((tab) => (
                  <Button key={tab.segment} asChild variant="outline" size="sm">
                    <Link href={`/forms/${formId}/${tab.segment}`}>
                      <tab.icon className="size-3.5" />
                      {tab.label}
                    </Link>
                  </Button>
                ))}
              </div>
            </>
          )}

          <Button asChild shape="pill" className="mt-5 w-full">
            <Link href="/dashboard">Back to forms</Link>
          </Button>
        </div>
      </div>
    </>
  );
}
