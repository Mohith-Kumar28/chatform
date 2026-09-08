"use client";

import { useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Folder, ChevronsUpDown, Loader2, Plus, Check } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetApiWorkspaces,
  usePostApiWorkspaces,
  getGetApiWorkspacesQueryKey,
} from "@/lib/api/dashboard/dashboard";
import { apiData } from "@/lib/api/payload";
import { useEntitlements } from "@/hooks/use-entitlements";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/**
 * Workspace switcher — the second of the two levels.
 *
 * A workspace is a folder of forms inside an organization. Everyone in the
 * organization can see every workspace in it: this is an organising boundary,
 * not a permission one, and roles stay where the seats and the subscription are.
 *
 * ## Why the active workspace is in the URL
 *
 * `OrganizationSwitcher` next door has to do a full `window.location.assign`,
 * because the active organization lives in the session cookie and the server
 * reads it on every request. That is a page reload to change a folder, and it
 * is avoidable: `?ws=` is read by `GET /forms` directly, so switching is an
 * ordinary client-side push. It also makes a workspace link something you can
 * send to a colleague, and it is what forces the server to check the workspace
 * belongs to the caller — a check that was missing while the parameter was
 * only ever supplied by our own code.
 *
 * No `?ws=` at all means the organization's oldest workspace, which is what
 * every link written before this control existed means.
 */
interface Workspace {
  id: string;
  name: string;
  slug: string;
  formCount: number;
  createdAt: number;
}

export function WorkspaceSwitcher() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const queryClient = useQueryClient();
  const { allows } = useEntitlements();

  const { data: workspaces, isLoading } = useGetApiWorkspaces();
  const create = usePostApiWorkspaces();

  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");

  // `apiData` because the generated types claim a `{ data, headers }` wrapper
  // the mutator does not actually produce. See `lib/api/payload.ts`.
  const list = apiData<Workspace[]>(workspaces) ?? [];
  const slug = params.get("ws");
  // Absent or unrecognised falls back to the first, which is the same rule the
  // server applies. An unrecognised slug is a link to a workspace that has been
  // renamed or deleted; showing the default beats showing nothing.
  const current = list.find((w) => w.slug === slug) ?? list[0];

  /**
   * One workspace and no permission to make another is not a switcher, it is a
   * label — so it renders nothing at all rather than a menu with one dead row.
   * Most accounts are in exactly this state and the header should not carry a
   * control for a feature they are not using.
   */
  if (isLoading || list.length === 0) return null;
  const canCreate = allows("workspace", "create");
  if (list.length === 1 && !canCreate) return null;

  function switchTo(next: string) {
    const query = new URLSearchParams(params.toString());
    // The first workspace is the no-parameter case, so switching back to it
    // clears `?ws=` instead of pinning it. Keeps the common URL clean and means
    // a bookmark of the dashboard keeps working after a rename.
    if (next === list[0]?.slug) query.delete("ws");
    else query.set("ws", next);
    const qs = query.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    try {
      const ws = apiData<Workspace>(await create.mutateAsync({ data: { name: trimmed } }));
      await queryClient.invalidateQueries({ queryKey: getGetApiWorkspacesQueryKey() });
      setCreateOpen(false);
      setName("");
      switchTo(ws.slug);
    } catch (err) {
      /**
       * The refusal here is a 402 carrying the plan and the limit, not a
       * generic failure — `POST /workspaces` is gated on `workspaces_count`.
       * Surfacing its message verbatim is the difference between "couldn't
       * create" and "you've used all 1 workspaces on Free".
       */
      const message =
        err && typeof err === "object" && "error" in err
          ? ((err as { error?: { message?: string } }).error?.message ?? null)
          : null;
      toast.error("Couldn't create workspace", {
        description: message ?? (err instanceof Error ? err.message : undefined),
      });
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          className={cn(
            "hover:bg-muted text-muted-foreground hover:text-foreground hidden items-center gap-1.5 rounded-full px-2.5 py-1 text-sm md:inline-flex",
            "focus-visible:ring-ring/50 outline-none transition-colors focus-visible:ring-2",
          )}
        >
          <Folder className="size-3.5" strokeWidth={1.75} />
          <span className="max-w-32 truncate">{current?.name ?? "Workspace"}</span>
          <ChevronsUpDown className="size-3 opacity-50" />
        </DropdownMenuTrigger>

        <DropdownMenuContent align="start" className="w-64">
          <DropdownMenuLabel className="text-muted-foreground text-xs font-normal">
            Workspaces
          </DropdownMenuLabel>
          {/* Every workspace, with a tick on the current one — unlike the
              organization menu next door, which lists only the others. The
              difference is that these are peers you move between constantly and
              the count is small; a list that reorders itself as you switch is
              harder to use than one that holds still. */}
          {list.map((ws) => (
            <DropdownMenuItem key={ws.id} onSelect={() => switchTo(ws.slug)}>
              <span className="min-w-0 flex-1 truncate">{ws.name}</span>
              <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                {ws.formCount}
              </span>
              {ws.id === current?.id && <Check className="size-3.5 shrink-0" />}
            </DropdownMenuItem>
          ))}
          {canCreate && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => setCreateOpen(true)}>
                <Plus className="size-3.5" />
                New workspace
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={submit}>
            <DialogHeader>
              <DialogTitle>New workspace</DialogTitle>
              <DialogDescription>
                A folder for a set of forms. Everyone in this organization can see it.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-2 py-4">
              <Label htmlFor="workspace-name">Name</Label>
              <Input
                id="workspace-name"
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
    </>
  );
}
