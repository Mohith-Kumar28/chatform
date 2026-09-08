"use client";

import { useState } from "react";
import { FolderOpen, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetApiWorkspaces,
  usePostApiWorkspaces,
  usePatchApiWorkspacesById,
  useDeleteApiWorkspacesById,
  getGetApiWorkspacesQueryKey,
} from "@/lib/api/dashboard/dashboard";
import { apiData } from "@/lib/api/payload";
import { invalidateForms } from "@/lib/query-keys";
import { useEntitlements } from "@/hooks/use-entitlements";
import { SettingsSectionHeader } from "@/components/settings/settings-section-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * The folders inside this organization.
 *
 * The switcher in the header creates and moves between them; this is where they
 * are renamed and removed, because neither belongs in a menu you open twenty
 * times a day.
 *
 * Deliberately not a member list. A workspace is an organising boundary, not a
 * permission one — everyone in the organization sees all of them, and roles
 * live one level up on the People page. If per-workspace access is ever added
 * it arrives here, and until then an access column would be a control that
 * implies a restriction the server does not enforce.
 */

interface Workspace {
  id: string;
  name: string;
  slug: string;
  formCount: number;
  createdAt: number;
}

/** The message the server sent, or the exception's own. */
function reason(err: unknown): string | undefined {
  if (err && typeof err === "object" && "error" in err) {
    const inner = (err as { error?: { message?: string } }).error;
    if (inner?.message) return inner.message;
  }
  return err instanceof Error ? err.message : undefined;
}

export function WorkspacesSection() {
  const queryClient = useQueryClient();
  const { allows, limit } = useEntitlements();

  const { data, isLoading } = useGetApiWorkspaces();
  const workspaces = apiData<Workspace[]>(data) ?? [];

  const create = usePostApiWorkspaces();
  const rename = usePatchApiWorkspacesById();
  const remove = useDeleteApiWorkspacesById();

  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<Workspace | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Workspace | null>(null);
  const [name, setName] = useState("");

  const canCreate = allows("workspace", "create");
  const canUpdate = allows("workspace", "update");
  const canDelete = allows("workspace", "delete");
  const max = limit("workspaces_count");

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: getGetApiWorkspacesQueryKey() });
  }

  async function submitCreate(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    try {
      await create.mutateAsync({ data: { name: trimmed } });
      await refresh();
      setCreateOpen(false);
      setName("");
    } catch (err) {
      toast.error("Couldn't create workspace", { description: reason(err) });
    }
  }

  async function submitRename(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || !editing) return;
    try {
      await rename.mutateAsync({ id: editing.id, data: { name: trimmed } });
      await refresh();
      setEditing(null);
      setName("");
    } catch (err) {
      toast.error("Couldn't rename workspace", { description: reason(err) });
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    try {
      await remove.mutateAsync({ id: pendingDelete.id });
      await refresh();
      // A deleted workspace changes what the dashboard grid should show, and
      // the grid is keyed on `?ws=` — which may now name something gone.
      await invalidateForms(queryClient);
      setPendingDelete(null);
    } catch (err) {
      toast.error("Couldn't delete workspace", { description: reason(err) });
      setPendingDelete(null);
    }
  }

  return (
    <>
      <SettingsSectionHeader
        title="Workspaces"
        description={
          <>
            Folders for your forms. Everyone in this organization can see every
            workspace{max != null && <> — your plan includes {max}</>}.
          </>
        }
        readOnly={!canCreate && !canUpdate && !canDelete}
        actions={
          canCreate && (
            <Button
              size="sm"
              onClick={() => {
                setName("");
                setCreateOpen(true);
              }}
            >
              <Plus className="size-3.5" />
              New workspace
            </Button>
          )
        }
      />

      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </div>
      ) : workspaces.length === 0 ? (
        <EmptyState
          icon={FolderOpen}
          title="No workspaces"
          description="Every organization has at least one. Reload if this looks wrong."
        />
      ) : (
        <Card className="divide-border divide-y p-0">
          {workspaces.map((ws) => (
            <div key={ws.id} className="flex items-center gap-3 px-4 py-3">
              <FolderOpen className="text-muted-foreground size-4 shrink-0" strokeWidth={1.75} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{ws.name}</p>
                <p className="text-muted-foreground text-xs">
                  {ws.formCount} {ws.formCount === 1 ? "form" : "forms"}
                </p>
              </div>
              {canUpdate && (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Rename ${ws.name}`}
                  onClick={() => {
                    setEditing(ws);
                    setName(ws.name);
                  }}
                >
                  <Pencil className="size-3.5" />
                </Button>
              )}
              {/* The last workspace has no delete control at all rather than a
                  disabled one: the server refuses it, and a button that exists
                  only to explain why it cannot be pressed is worse than no
                  button. Same for a workspace holding forms — the refusal there
                  arrives as a message, because "move these first" is an
                  instruction rather than a rule about this row. */}
              {canDelete && workspaces.length > 1 && (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Delete ${ws.name}`}
                  onClick={() => setPendingDelete(ws)}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              )}
            </div>
          ))}
        </Card>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={submitCreate}>
            <DialogHeader>
              <DialogTitle>New workspace</DialogTitle>
              <DialogDescription>
                A folder for a set of forms. Everyone in this organization can see it.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-2 py-4">
              <Label htmlFor="new-workspace-name">Name</Label>
              <Input
                id="new-workspace-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Marketing"
                maxLength={60}
                autoFocus
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={!name.trim() || create.isPending}>
                {create.isPending && <Loader2 className="size-3.5 animate-spin" />}
                Create
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={submitRename}>
            <DialogHeader>
              <DialogTitle>Rename workspace</DialogTitle>
              <DialogDescription>
                The link to this workspace changes with its name, so old bookmarks will
                fall back to the first workspace.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-2 py-4">
              <Label htmlFor="edit-workspace-name">Name</Label>
              <Input
                id="edit-workspace-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={60}
                autoFocus
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditing(null)}>
                Cancel
              </Button>
              <Button type="submit" disabled={!name.trim() || rename.isPending}>
                {rename.isPending && <Loader2 className="size-3.5 animate-spin" />}
                Save
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        title={`Delete ${pendingDelete?.name ?? "workspace"}?`}
        description={
          pendingDelete && pendingDelete.formCount > 0 ? (
            <>
              This workspace still holds {pendingDelete.formCount}{" "}
              {pendingDelete.formCount === 1 ? "form" : "forms"}. Move them to another
              workspace first — deleting is refused while anything is inside.
            </>
          ) : (
            "This workspace is empty. Deleting it cannot be undone."
          )
        }
        confirmLabel="Delete"
        onConfirm={confirmDelete}
      />
    </>
  );
}
