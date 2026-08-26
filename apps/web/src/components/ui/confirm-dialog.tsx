"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

/**
 * Destructive confirmation. Replaces `window.confirm`, which the product used
 * for form deletion — it is unstyled, unthemed, blocks the whole tab, and on
 * some platforms is suppressed entirely.
 *
 * `confirmText` gates genuinely irreversible actions behind typing the name,
 * the way GitHub does. Use it only where undo is impossible.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Delete",
  cancelLabel = "Cancel",
  destructive = true,
  confirmText,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  confirmText?: string;
  onConfirm: () => void | Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [typed, setTyped] = useState("");

  const blocked = confirmText !== undefined && typed.trim() !== confirmText;

  async function run() {
    if (blocked) return;
    setBusy(true);
    try {
      await onConfirm();
      onOpenChange(false);
      setTyped("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => (busy ? null : onOpenChange(o))}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>

        {confirmText !== undefined && (
          <div className="space-y-2">
            <p className="text-muted-foreground text-caption">
              Type <span className="text-foreground font-mono font-medium">{confirmText}</span> to
              confirm.
            </p>
            <input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoComplete="off"
              className="border-input bg-background focus-visible:ring-ring/50 h-9 w-full rounded-md border px-3 text-sm outline-none focus-visible:ring-[3px]"
            />
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            {cancelLabel}
          </Button>
          <Button
            variant={destructive ? "destructive" : "default"}
            onClick={run}
            disabled={busy || blocked}
          >
            {busy && <Loader2 className="size-3.5 animate-spin" />}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Hook form of the above, for list rows that each need their own confirm. */
export function useConfirm() {
  const [state, setState] = useState<{
    open: boolean;
    props?: Omit<React.ComponentProps<typeof ConfirmDialog>, "open" | "onOpenChange">;
  }>({ open: false });

  return {
    confirm: (props: Omit<React.ComponentProps<typeof ConfirmDialog>, "open" | "onOpenChange">) =>
      setState({ open: true, props }),
    dialog: state.props ? (
      <ConfirmDialog
        {...state.props}
        open={state.open}
        onOpenChange={(open) => setState((s) => ({ ...s, open }))}
      />
    ) : null,
  };
}
