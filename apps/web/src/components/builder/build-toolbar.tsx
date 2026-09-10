"use client";

import { usePathname } from "next/navigation";
import { Cloud, CloudAlert, CloudCheck, CloudOff, Loader2, Palette, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TooltipHint } from "@/components/ui/kbd";
import { SegmentedControl } from "@/components/ui/segmented-control";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useEntitlements } from "@/hooks/use-entitlements";
import { usePlansDialog } from "@/stores/paywall-store";
import { formatTime } from "@/lib/format";
import { BUILD_VIEWS } from "./builder-tabs";
import { useBuilderStore } from "@/stores/builder-store";
import { DesignSheet } from "./design-sheet";
import { KEY } from "./use-builder-shortcuts";
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
  // Held in the store, not locally, so `D` can open it from the shell's
  // keyboard layer — which has no way to reach state declared in here.
  const designOpen = useBuilderStore((s) => s.designOpen);
  const setDesignOpen = useBuilderStore((s) => s.setDesignOpen);
  const onFlow = pathname.endsWith("/workflow");

  // The flow canvas already carries a node library on the left and an
  // inspector on the right; a Design link and an upgrade pill on top of that
  // is clutter. Keep the switcher there and nothing else.
  const showSideActions = !onFlow;
  const ent = useEntitlements();
  /**
   * Only ever shown to someone who can act on it.
   *
   * `ready` matters as much as the plan here: entitlements load optimistically, so without
   * it a paying customer gets an Upgrade chip on every first paint that then disappears.
   * A nag aimed at a customer who already paid is worse than no chip at all.
   */
  const openPlans = usePlansDialog((s) => s.openPlans);
  const showUpgrade = showSideActions && ent.ready && ent.data?.planId === "free";
  /**
   * The autosave cloud is a paying-plan perk, not a free-plan consolation prize.
   *
   * Free accounts see the Upgrade chip in this slot; showing both would crowd the
   * toolbar, and showing the cloud instead of Upgrade would bury the one ask this
   * row exists to make. Gated on `ent.ready` too, so it doesn't flash on before the
   * plan is known and then vanish under the Upgrade chip a moment later.
   */
  const showSaveStatus = showSideActions && ent.ready && ent.data?.planId !== "free";

  return (
    <TooltipProvider delayDuration={400}>
      <div className="flex items-center gap-2 px-4 pt-3">
        <div className="flex flex-1 justify-start">
          {showSideActions && (
            <Tooltip>
              <TooltipTrigger asChild>
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
              </TooltipTrigger>
              <TooltipContent side="bottom">
                <TooltipHint label="Design" hint="Colours, type and layout" keys={KEY.design} />
              </TooltipContent>
            </Tooltip>
          )}
        </div>

        {/* Questions and Flow are two views of one thing — the same
            `SegmentedControl` as every other tab strip in the product, so the
            selected view wears the same violet as the header above it. On the
            Design route neither is active and the pill simply isn't drawn. */}
        <SegmentedControl
          ariaLabel="Build view"
          size="sm"
          className="shrink-0"
          value={BUILD_VIEWS.find((v) => pathname.endsWith(`/${v.segment}`))?.segment ?? ""}
          options={BUILD_VIEWS.map((view) => ({
            value: view.segment,
            label: view.label,
            icon: view.icon,
            href: `/forms/${formId}/${view.segment}`,
            // One key toggles the pair, so it is named on both halves.
            tooltip: <TooltipHint label={`Switch to ${view.label}`} keys={KEY.flow} />,
          }))}
        />

        <div className="flex flex-1 items-center justify-end gap-3">
          {showSaveStatus && <SaveStatusCloud />}
          {/* The only ask on this toolbar, and the only thing here wearing the
              brand at full strength. `soft` put it at the same volume as the
              Design chip opposite it — two quiet pills, neither read. */}
          {/* Opens the plan picker over the builder rather than navigating out of
              it. Losing an unfinished form to go and read a price was never a
              trade anybody wanted to make. */}
          {showUpgrade && (
            <Button size="sm" shape="pill" variant="gradient" onClick={() => openPlans()}>
              <Sparkles className="size-3.5" />
              Upgrade
            </Button>
          )}
        </div>

        <DesignSheet open={designOpen} onOpenChange={setDesignOpen} />
      </div>
    </TooltipProvider>
  );
}

/**
 * A quiet confirmation that edits are actually reaching the server, living
 * where a paying editor's eye already rests instead of a corner of the header
 * nobody watches while typing. Grayed while a save is pending, green once it
 * lands — the tooltip is the only place the state is spelled out in words.
 */
function SaveStatusCloud() {
  const saveState = useBuilderStore((s) => s.saveState);
  const saveError = useBuilderStore((s) => s.saveError);
  const docIssues = useBuilderStore((s) => s.docIssues);
  const lastSavedAt = useBuilderStore((s) => s.lastSavedAt);

  const { icon, className, label } = (() => {
    switch (saveState) {
      /*
        Held back rather than failed. Nothing is in flight and nothing is being
        retried — the document has a value in it that cannot be stored, and it
        will keep having one until the field is edited. The tooltip says which.
      */
      case "invalid":
        return {
          icon: <CloudAlert className="size-4" />,
          className: "text-[var(--warning)]",
          label: docIssues.length
            ? `Not saved — ${docIssues.map((i) => i.message).join("; ")}`
            : "Not saved — one field needs fixing",
        };
      case "saving":
        return {
          icon: <Loader2 className="size-4 animate-spin" />,
          className: "text-muted-foreground",
          label: "Saving changes…",
        };
      case "error":
        return {
          icon: <CloudAlert className="size-4" />,
          className: "text-destructive",
          label: saveError ? `Couldn't save: ${saveError}` : "Couldn't save",
        };
      case "offline":
        return {
          icon: <CloudOff className="size-4" />,
          className: "text-muted-foreground",
          label: "Offline — changes will save once you're back",
        };
      case "dirty":
        return {
          icon: <Cloud className="size-4" />,
          className: "text-muted-foreground/60",
          label: "Unsaved changes",
        };
      default:
        return {
          icon: <CloudCheck className="size-4" />,
          className: "text-[var(--success-soft-foreground)]",
          label: lastSavedAt ? `All changes saved · ${formatTime(lastSavedAt)}` : "All changes saved",
        };
    }
  })();

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={cn("inline-flex items-center justify-center transition-colors", className)}
          aria-label={label}
          tabIndex={0}
        >
          {icon}
        </span>
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  );
}
