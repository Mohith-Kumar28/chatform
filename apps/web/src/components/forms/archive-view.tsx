"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Archive } from "lucide-react";
import { toast } from "sonner";
import {
  useDeleteApiArchiveFormsById,
  usePostApiArchiveFormsByIdRestore,
} from "@/lib/api/dashboard/dashboard";
import { invalidateForms } from "@/lib/query-keys";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";

/** One archived form, as `GET /archive/forms` returns it. */
export interface ArchivedFormRow {
  id: string;
  title: string;
  workspaceId: string;
  archivedAt: number;
  purgeAt: number;
  archivedBy: string | null;
  responses: number;
  partials: number;
  conversations: number;
  uploads: number;
}

const DAY = 24 * 60 * 60 * 1000;

function shortDate(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n.toLocaleString()} ${n === 1 ? one : many}`;
}

/** "Deletes today", "Deletes tomorrow", "Deletes in 12 days". */
function deletesIn(purgeAt: number, now: number): string {
  const days = Math.ceil((purgeAt - now) / DAY);
  if (days <= 0) return "Deletes today";
  if (days === 1) return "Deletes tomorrow";
  return `Deletes in ${days} days`;
}

/**
 * Deleted forms, restorable until their purge date.
 *
 * A list rather than the card grid: these forms are not something to open and
 * edit, only to bring back or let go, so each row is what goes with it and when.
 */
export function ArchiveView({
  forms,
  workspaceName,
  canEdit,
  openId,
  onOpenChange,
}: {
  forms: ArchivedFormRow[];
  /** The folder each form is in, when the view spans every workspace. */
  workspaceName?: (workspaceId: string) => string | undefined;
  canEdit: (workspaceId: string) => boolean;
  /** The form whose details are open, so a link from the warning email can open one. */
  openId: string | null;
  onOpenChange: (id: string | null) => void;
}) {
  const queryClient = useQueryClient();
  const [confirmPurge, setConfirmPurge] = useState<ArchivedFormRow | null>(null);
  // Read once per mount: a countdown in days does not need to tick.
  const [now] = useState(() => Date.now());
  const open = forms.find((f) => f.id === openId) ?? null;

  const restore = usePostApiArchiveFormsByIdRestore<Error>({
    mutation: {
      onSuccess: () => {
        void invalidateForms(queryClient);
        onOpenChange(null);
        toast.success("Form restored", { description: "It's back in your forms as a draft." });
      },
      onError: (e) => toast.error("Couldn't restore it", { description: e.message }),
    },
  });

  const purge = useDeleteApiArchiveFormsById<Error>({
    mutation: {
      onSuccess: () => {
        void invalidateForms(queryClient);
        onOpenChange(null);
        toast.success("Form deleted");
      },
      onError: (e) => toast.error("Couldn't delete it", { description: e.message }),
    },
  });

  if (forms.length === 0) {
    return (
      <EmptyState
        compact
        icon={Archive}
        title="Archive is empty"
        description="Deleted forms stay here for 30 days before they're gone for good."
      />
    );
  }

  return (
    <>
      <ul className="divide-border bg-card divide-y overflow-hidden rounded-2xl border">
        {forms.map((f) => {
          const soon = f.purgeAt - now <= 3 * DAY;
          const where = workspaceName?.(f.workspaceId);
          return (
            <li key={f.id}>
              <button
                type="button"
                onClick={() => onOpenChange(f.id)}
                className="hover:bg-accent/50 focus-visible:bg-accent/50 flex w-full items-center gap-3 px-4 py-3 text-left outline-none"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{f.title}</p>
                  <p className="text-muted-foreground truncate text-sm">
                    {[where, plural(f.responses, "response"), `Archived ${shortDate(f.archivedAt)}`]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
                <Badge variant={soon ? "destructive" : "secondary"}>{deletesIn(f.purgeAt, now)}</Badge>
              </button>
            </li>
          );
        })}
      </ul>

      <Dialog open={open !== null} onOpenChange={(o) => !o && onOpenChange(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="truncate">{open?.title}</DialogTitle>
            <DialogDescription>
              {open
                ? `Archived ${shortDate(open.archivedAt)}${open.archivedBy ? ` by ${open.archivedBy}` : ""}`
                : ""}
            </DialogDescription>
          </DialogHeader>
          {open && (
            <>
              <dl className="bg-muted/40 grid grid-cols-2 gap-px overflow-hidden rounded-xl border">
                {(
                  [
                    ["Responses", open.responses],
                    ["Partial", open.partials],
                    ["Conversations", open.conversations],
                    ["Files", open.uploads],
                  ] as const
                ).map(([label, value]) => (
                  <div key={label} className="bg-card px-4 py-3">
                    <dt className="text-muted-foreground text-xs">{label}</dt>
                    <dd className="text-lg font-semibold tabular-nums">{value.toLocaleString()}</dd>
                  </div>
                ))}
              </dl>
              <p className={cn("text-sm", open.purgeAt - now <= 3 * DAY && "text-destructive")}>
                Deleted for good on {shortDate(open.purgeAt)} ({deletesIn(open.purgeAt, now).replace("Deletes ", "")})
              </p>
            </>
          )}
          {open && canEdit(open.workspaceId) && (
            <DialogFooter className="sm:justify-between">
              <Button
                variant="ghost"
                className="text-destructive hover:text-destructive"
                onClick={() => setConfirmPurge(open)}
              >
                Delete now
              </Button>
              <Button
                shape="pill"
                disabled={restore.isPending}
                onClick={() => restore.mutate({ id: open.id })}
              >
                Restore form
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        key={confirmPurge?.id}
        open={confirmPurge !== null}
        onOpenChange={(o) => !o && setConfirmPurge(null)}
        title={`Delete “${confirmPurge?.title}” for good?`}
        description={`This can't be undone. ${confirmPurge ? plural(confirmPurge.responses, "response") : ""} and every upload go with it.`}
        confirmText={confirmPurge?.title}
        confirmLabel="Delete for good"
        onConfirm={() => {
          if (confirmPurge) purge.mutate({ id: confirmPurge.id });
        }}
      />
    </>
  );
}
