"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "motion/react";
import { Palette, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BUILD_VIEWS } from "./builder-tabs";
import { useBuilderStore } from "@/stores/builder-store";
import { DesignSheet } from "./design-sheet";
import { cn } from "@/lib/utils";

/**
 * The toolbar under the header, shared by every surface in the Build cluster.
 *
 * Design, Questions and Flow are all ways of shaping the same form, so they
 * sit together on one row rather than competing for slots in the top nav —
 * which keeps the header down to the six places you actually navigate between.
 *
 * Left: Design. Centre: Questions ⇄ Flow. Right: upgrade.
 */
export function BuildToolbar() {
  const pathname = usePathname();
  const formId = useBuilderStore((s) => s.formId);
  const [designOpen, setDesignOpen] = useState(false);
  const onFlow = pathname.endsWith("/workflow");

  // The flow canvas already carries a node library on the left and an
  // inspector on the right; a Design link and an upgrade pill on top of that
  // is clutter. Keep the switcher there and nothing else.
  const showSideActions = !onFlow;

  return (
    <div className="flex items-center gap-2 px-4 pt-3">
      <div className="flex flex-1 justify-start">
        {showSideActions && (
          <button
            type="button"
            onClick={() => setDesignOpen(true)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium",
              "transition-colors duration-[var(--duration-micro)] ease-[var(--ease-out)]",
              designOpen
                ? "bg-primary-soft text-primary"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/60",
            )}
          >
            <Palette className="size-3.5" strokeWidth={1.75} />
            Design
          </button>
        )}
      </div>

      {/* Questions and Flow are two views of one thing. On the Design route
          neither is active, so the pill simply isn't rendered. */}
      <div className="bg-muted/60 inline-flex shrink-0 items-center rounded-full p-1">
        {BUILD_VIEWS.map((view) => {
          const href = `/forms/${formId}/${view.segment}`;
          const active = pathname.endsWith(`/${view.segment}`);
          return (
            <Link
              key={view.segment}
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "relative isolate inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-medium",
                "transition-colors duration-[var(--duration-micro)] ease-[var(--ease-out)]",
                active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {active && (
                <motion.span
                  layoutId="build-view-pill"
                  className="bg-card shadow-xs absolute inset-0 -z-10 rounded-full"
                  transition={{ type: "spring", stiffness: 500, damping: 40 }}
                />
              )}
              <view.icon className="size-3.5" strokeWidth={1.75} />
              {view.label}
            </Link>
          );
        })}
      </div>

      <div className="flex flex-1 justify-end">
        {showSideActions && (
          <Button size="sm" shape="pill" variant="soft" asChild>
            <Link href="/usage">
              <Sparkles className="size-3.5" />
              Upgrade
            </Link>
          </Button>
        )}
      </div>

      <DesignSheet open={designOpen} onOpenChange={setDesignOpen} />
    </div>
  );
}
