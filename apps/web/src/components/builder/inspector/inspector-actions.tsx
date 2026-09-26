"use client";

import { Copy, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

/**
 * Duplicate and Delete, in the panel header, for whatever is selected.
 *
 * Both lived only in the right-click menu for endings, which nobody finds, so
 * an ending could be edited from this panel but not removed from it.
 * `onDelete` absent draws Delete disabled with the reason as its tooltip,
 * rather than hiding it and leaving the author to wonder where it went.
 */
export function InspectorActions({
  label,
  onDuplicate,
  onDelete,
  deleteBlockedReason,
}: {
  /** "question" or "ending", for the tooltips and the accessible names. */
  label: string;
  onDuplicate: () => void;
  onDelete?: () => void;
  deleteBlockedReason?: string;
}) {
  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex shrink-0 items-center gap-0.5">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Duplicate ${label}`}
              onClick={onDuplicate}
              className="text-muted-foreground hover:text-foreground"
            >
              <Copy className="size-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Duplicate</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            {/* A span, so a disabled button still gets its tooltip. */}
            <span tabIndex={onDelete ? -1 : 0}>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Delete ${label}`}
                onClick={onDelete}
                disabled={!onDelete}
                className="text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="size-3.5" />
              </Button>
            </span>
          </TooltipTrigger>
          <TooltipContent side="bottom">{onDelete ? "Delete" : deleteBlockedReason}</TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  );
}
