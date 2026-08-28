"use client";

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Kbd } from "@/components/ui/kbd";
import type { Shortcut } from "@/lib/shortcuts";

/**
 * The shortcut sheet, generated from the bindings themselves.
 *
 * Not a hand-written list: it renders the same registry the key handler reads,
 * so a binding cannot be added, changed or removed without this changing with
 * it. Every shortcut sheet I have seen that was maintained separately was
 * wrong within a month. Groups come from the registry's own order too, so a new
 * heading needs no edit here.
 */
export function ShortcutsDialog({
  open,
  onOpenChange,
  shortcuts,
  footnote,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  shortcuts: Shortcut[];
  /** The one thing worth saying about what is deliberately *not* bound. */
  footnote?: string;
}) {
  const groups = [...new Set(shortcuts.map((s) => s.group))];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>
            These work whenever you are not typing in a field.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] space-y-4 overflow-y-auto">
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
                      <Kbd>{s.keys}</Kbd>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>

        {footnote && <p className="text-muted-foreground text-xs">{footnote}</p>}
      </DialogContent>
    </Dialog>
  );
}
