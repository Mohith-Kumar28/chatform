"use client";

import { useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Folder, ChevronsUpDown, Loader2, Plus, Check, Settings2, Users } from "lucide-react";
import { WorkspaceAccessDialog } from "@/components/settings/access/workspace-access-dialog";
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
 * The dashboard fills in a missing `?ws=` from the last workspace viewed in
 * this browser, or every workspace (`all`) the first time.
 */
/** `?ws=all`: every workspace at once. The API never issues it as a slug. */
export const ALL_WORKSPACES = "all";

interface Workspace {
  id: string;
  name: string;
  slug: string;
  formCount: number;
  createdAt: number;
  myRole?: string;
}

export function WorkspaceSwitcher({
  className,
  value,
}: {
  className?: string;
  /** The workspace the page is showing, when it resolves `?ws=` itself. */
  value?: string;
} = {}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const queryClient = useQueryClient();
  const { allows } = useEntitlements();

  const { data: workspaces, isLoading } = useGetApiWorkspaces();
  const create = usePostApiWorkspaces();

  const [createOpen, setCreateOpen] = useState(false);
  const [accessOpen, setAccessOpen] = useState(false);
  const [name, setName] = useState("");

  // `apiData` because the generated types claim a `{ data, headers }` wrapper
  // the mutator does not actually produce. See `lib/api/payload.ts`.
  const list = apiData<Workspace[]>(workspaces) ?? [];
  const slug = value ?? params.get("ws");
  // Absent or unrecognised falls back to the first, which is the same rule the
  // server applies. An unrecognised slug is a link to a workspace that has been
  // renamed or deleted; showing the default beats showing nothing.
  const showingAll = slug === ALL_WORKSPACES && list.length > 1;
  const current = showingAll ? undefined : (list.find((w) => w.slug === slug) ?? list[0]);

  /**
   * One workspace and no permission to make another is not a switcher, it is a
   * label — so it renders nothing at all rather than a menu with one dead row.
   * Most accounts are in exactly this state and the header should not carry a
   * control for a feature they are not using.
   */
  if (isLoading || list.length === 0) return null;
  const canCreate = allows("workspace", "create");
  const canManageAccess = allows("member", "update");
  const canManage = allows("workspace", "update") || allows("workspace", "delete");
  if (list.length === 1 && !canCreate) return null;

  function switchTo(next: string) {
    // Always explicit: with no `?ws=` the dashboard opens the last workspace
    // viewed, so leaving it off no longer means the first one.
    const query = new URLSearchParams(params.toString());
    query.set("ws", next);
    router.push(`${pathname}?${query}`);
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
        {/*
          A bordered control, and visible at every width.

          It used to be a bare ghost pill hidden below `md`, because it lived in
          the app header among other ghost pills. It now sits on the forms
          toolbar as the label for the list underneath it — the one control on
          that row that says what you are looking at rather than how it is
          filtered — so it reads as a control, and a phone gets it too.
        */}
        <DropdownMenuTrigger
          className={cn(
            "border-border bg-card hover:bg-muted inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-sm",
            "focus-visible:ring-ring/50 outline-none transition-colors focus-visible:ring-2",
            className,
          )}
        >
          <Folder className="size-3.5 opacity-60" strokeWidth={1.75} />
          <span className="max-w-32 truncate font-medium">
            {showingAll ? "All workspaces" : (current?.name ?? "Workspace")}
          </span>
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
          {list.length > 1 && (
            <DropdownMenuItem onSelect={() => switchTo(ALL_WORKSPACES)}>
              <Check className={cn("size-3.5 shrink-0", showingAll ? "opacity-100" : "opacity-0")} />
              <span className={cn("min-w-0 flex-1 truncate", showingAll && "font-medium")}>All workspaces</span>
              <span className="text-muted-foreground w-5 shrink-0 text-right text-xs tabular-nums">
                {list.reduce((n, w) => n + w.formCount, 0)}
              </span>
            </DropdownMenuItem>
          )}
          {list.map((ws) => (
            <DropdownMenuItem key={ws.id} onSelect={() => switchTo(ws.slug)}>
              {/* The tick leads, in a slot every row keeps, so names line up
                  and the mark cannot be read as part of the form count. */}
              <Check className={cn("size-3.5 shrink-0", ws.id === current?.id ? "opacity-100" : "opacity-0")} />
              <span className={cn("min-w-0 flex-1 truncate", ws.id === current?.id && "font-medium")}>{ws.name}</span>
              {ws.myRole === "viewer" && (
                <span className="text-muted-foreground shrink-0 text-xs">View only</span>
              )}
              <span className="text-muted-foreground w-5 shrink-0 text-right text-xs tabular-nums">
                {ws.formCount}
              </span>
            </DropdownMenuItem>
          ))}
          {(canCreate || canManage || (canManageAccess && current)) && <DropdownMenuSeparator />}
          {/* Who can open the workspace you are in: the door for the admin who
              starts from the folder rather than from a person. */}
          {canManageAccess && current && (
            <DropdownMenuItem onSelect={() => setAccessOpen(true)}>
              <Users className="size-3.5" />
              Manage access…
            </DropdownMenuItem>
          )}
          {canCreate && (
            <DropdownMenuItem onSelect={() => setCreateOpen(true)}>
              <Plus className="size-3.5" />
              New workspace
            </DropdownMenuItem>
          )}
          {/* Rename and delete live in settings; this is the way there. */}
          {canManage && (
            <DropdownMenuItem asChild>
              <Link href="/settings/workspaces">
                <Settings2 className="size-3.5" />
                Manage workspaces
              </Link>
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {accessOpen && current && (
        <WorkspaceAccessDialog open onOpenChange={setAccessOpen} workspace={current} />
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={submit}>
            <DialogHeader>
              <DialogTitle>New workspace</DialogTitle>
              <DialogDescription>
                A folder for a set of forms. Admins can open it straight away; add anyone
                else with Manage access.
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
