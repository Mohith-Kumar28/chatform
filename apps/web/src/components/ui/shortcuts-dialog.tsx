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
/**
 * Just the list, so the same rendering serves the dialog and the settings pane.
 *
 * The builder shows these as a settings section rather than a sheet — a list
 * you read while working is not a thing to interrupt yourself with — and the
 * dashboard still opens the dialog. One component, so the two cannot drift.
 */
export function ShortcutsList({ shortcuts }: { shortcuts: Shortcut[] }) {
  const groups = [...new Set(shortcuts.map((s) => s.group))];
  return (
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
                  {/* `always`: this sheet is reachable by tapping a row in the
                      command palette, and a list of shortcuts with the keys
                      taken out of it is a list of nothing. */}
                  <Kbd always>{s.keys}</Kbd>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

export function ShortcutsDialog({
  open,
  onOpenChange,
  shortcuts,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  shortcuts: Shortcut[];
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>
            These work whenever you are not typing in a field.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] overflow-y-auto">
          <ShortcutsList shortcuts={shortcuts} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
