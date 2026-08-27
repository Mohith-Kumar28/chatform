"use client";

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { Shortcut } from "./use-builder-shortcuts";

/**
 * The shortcut sheet, generated from the bindings themselves.
 *
 * Not a hand-written list: it renders the same registry the key handler reads,
 * so a binding cannot be added, changed or removed without this changing with
 * it. Every shortcut sheet I have seen that was maintained separately was
 * wrong within a month.
 */
export function ShortcutsDialog({
  open,
  onOpenChange,
  shortcuts,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  shortcuts: Shortcut[];
}) {
  const groups = ["Move around", "Edit", "The form"] as const;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>
            These work whenever you are not typing in a field.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {groups.map((group) => {
            const items = shortcuts.filter((s) => s.group === group);
            if (items.length === 0) return null;
            return (
              <div key={group}>
                <p className="text-muted-foreground text-micro mb-1.5 font-medium tracking-wide uppercase">
                  {group}
                </p>
                <ul className="space-y-0.5">
                  {items.map((s) => (
                    <li key={s.keys + s.label} className="flex items-center justify-between gap-4 py-1">
                      <span className="text-sm">{s.label}</span>
                      <kbd className="bg-muted text-muted-foreground shrink-0 rounded px-1.5 py-0.5 font-sans text-xs">
                        {s.keys}
                      </kbd>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>

        <p className="text-muted-foreground text-xs">
          Deleting a question has no shortcut on purpose — it takes its wording, its options and
          every rule that mentions it with it.
        </p>
      </DialogContent>
    </Dialog>
  );
}
