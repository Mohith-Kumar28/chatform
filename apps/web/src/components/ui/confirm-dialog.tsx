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
import { TypeToConfirm, phraseMatches } from "@/components/ui/type-to-confirm";

/**
 * Destructive confirmation. Replaces `window.confirm`, which the product used
 * for form deletion — it is unstyled, unthemed, blocks the whole tab, and on
 * some platforms is suppressed entirely.
 *
 * `confirmText` gates anything that deletes data behind typing its name, the
 * way GitHub does. A slipped click on a delete button should never be enough.
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

  const blocked = confirmText !== undefined && !phraseMatches(typed, confirmText);

  function setOpen(o: boolean) {
    if (busy) return;
    // A half-typed name never carries over to the next thing this dialog confirms.
    if (!o) setTyped("");
    onOpenChange(o);
  }

  async function run() {
    if (blocked) return;
    setBusy(true);
    try {
      await onConfirm();
      setTyped("");
      onOpenChange(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>

        {confirmText !== undefined && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void run();
            }}
          >
            <TypeToConfirm phrase={confirmText} value={typed} onChange={setTyped} disabled={busy} />
          </form>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
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
