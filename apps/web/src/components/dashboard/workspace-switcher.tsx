"use client";

import { useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Folder, ChevronsUpDown, Loader2, Plus, Check, Settings2, Users } from "lucide-react";
import { WorkspaceAccessDialog } from "@/components/settings/access/workspace-access-dialog";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetApiWorkspaces,
  useGetApiWorkspacesEverywhere,
  usePostApiWorkspaces,
  getGetApiWorkspacesQueryKey,
  getGetApiWorkspacesEverywhereQueryKey,
} from "@/lib/api/dashboard/dashboard";
import { authClient } from "@/lib/auth/auth-client";
import { useActiveOrg } from "@/hooks/use-active-org";
import { apiData } from "@/lib/api/payload";
import { switchOrganization } from "@/lib/api/persist";
import { useEntitlements } from "@/hooks/use-entitlements";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
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

/** Past this many workspaces in the menu (so eight or more), it gets a search box. */
const SEARCH_THRESHOLD = 7;

/**
 * Matches on the words a row carries in `keywords` (its name and its
 * organization's), never on `value`, which holds the id to keep rows unique.
 */
function keywordFilter(_value: string, search: string, keywords?: string[]): number {
  const haystack = (keywords ?? []).join(" ").toLowerCase();
  const terms = search.toLowerCase().split(/\s+/).filter(Boolean);
  return terms.every((t) => haystack.includes(t)) ? 1 : 0;
}

interface EverywhereWorkspace {
  id: string;
  name: string;
  slug: string;
  formCount: number;
  organizationId: string;
  organizationName: string;
  organizationRole: string;
  myRole: string;
}

const hasRole = (roles: string, name: string) => roles.split(",").some((r) => r.trim() === name);

/** How the caller belongs to an organization, as a heading pill. */
function orgPill(role: string): string {
  if (hasRole(role, "owner")) return "Yours";
  if (hasRole(role, "admin")) return "Admin";
  return "Member";
}

/** Owned organizations first, then admin, then member. */
function orgRank(role: string): number {
  return hasRole(role, "owner") ? 0 : hasRole(role, "admin") ? 1 : 2;
}

/** A workspace grant, as a row pill. Owners and admins open everything and get none. */
function grantPill(myRole?: string): string | null {
  if (myRole === "editor") return "Editor";
  if (myRole === "viewer") return "Viewer";
  return null;
}

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="bg-muted text-muted-foreground shrink-0 rounded-full px-1.5 py-px text-[0.6875rem] font-medium">
      {children}
    </span>
  );
}

/** An organization heading: its name, and how you belong to it. */
function OrgHeading({ name, role }: { name: string; role?: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="min-w-0 truncate">{name}</span>
      {role && <Pill>{orgPill(role)}</Pill>}
    </span>
  );
}

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
  const { data: everywhere } = useGetApiWorkspacesEverywhere();
  const { org: activeOrg } = useActiveOrg();
  const create = usePostApiWorkspaces();

  const [open, setOpen] = useState(false);
  const [switchingTo, setSwitchingTo] = useState<string | null>(null);
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
   * The other organizations' workspaces, grouped by organization. The active
   * organization's own rows come from `GET /workspaces`, which carries the
   * permissions this menu's actions need; this list only adds places to go.
   */
  const everywhereRows = apiData<EverywhereWorkspace[]>(everywhere) ?? [];
  const activeOrgRole = everywhereRows.find((w) => list.some((l) => l.id === w.id))?.organizationRole;
  const otherOrgs = (() => {
    const groups = new Map<string, { name: string; role: string; workspaces: EverywhereWorkspace[] }>();
    for (const ws of everywhereRows) {
      if (activeOrg && ws.organizationId === activeOrg.id) continue;
      if (!activeOrg && list.some((w) => w.id === ws.id)) continue;
      const group = groups.get(ws.organizationId) ?? {
        name: ws.organizationName,
        role: ws.organizationRole,
        workspaces: [],
      };
      group.workspaces.push(ws);
      groups.set(ws.organizationId, group);
    }
    // The organization you are in stays on top; the rest follow, yours first.
    return [...groups.entries()]
      .map(([id, g]) => ({ id, ...g }))
      .sort((a, b) => orgRank(a.role) - orgRank(b.role) || a.name.localeCompare(b.name));
  })();
  // Headings and membership pills only earn their place with more than one organization.
  const multiOrg = otherOrgs.length > 0;

  /**
   * Shown even with one workspace and no permission to make another. It used to
   * hide in that state, which meant a member invited into a single workspace
   * lost the only thing on the page naming the folder they were looking at.
   */
  if (isLoading || list.length === 0) return null;
  const canCreate = allows("workspace", "create");
  const canManageAccess = allows("member", "update");
  const canManage = allows("workspace", "update") || allows("workspace", "delete");

  const total = list.length + otherOrgs.reduce((n, g) => n + g.workspaces.length, 0);
  const searchable = total > SEARCH_THRESHOLD;

  function switchTo(next: string) {
    setOpen(false);
    // Always explicit: with no `?ws=` the dashboard opens the last workspace
    // viewed, so leaving it off no longer means the first one.
    const query = new URLSearchParams(params.toString());
    query.set("ws", next);
    router.push(`${pathname}?${query}`);
  }

  /**
   * A workspace in another organization: switch the organization first, then
   * land on the workspace. The active organization lives in the session cookie,
   * so this is a full navigation, like the organization switcher's.
   */
  async function switchOrgTo(ws: EverywhereWorkspace) {
    setSwitchingTo(ws.id);
    try {
      await switchOrganization(
        authClient.organization.setActive,
        ws.organizationId,
        `/dashboard?ws=${encodeURIComponent(ws.slug)}`,
      );
    } catch (err) {
      setSwitchingTo(null);
      toast.error("Couldn't switch", { description: err instanceof Error ? err.message : undefined });
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    try {
      const ws = apiData<Workspace>(await create.mutateAsync({ data: { name: trimmed } }));
      await queryClient.invalidateQueries({ queryKey: getGetApiWorkspacesQueryKey() });
      void queryClient.invalidateQueries({ queryKey: getGetApiWorkspacesEverywhereQueryKey() });
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
      <Popover
        open={open}
        onOpenChange={(next) => {
          if (!switchingTo) setOpen(next);
        }}
      >
        {/*
          A bordered control, and visible at every width.

          It sits on the forms toolbar as the label for the list underneath it,
          the one control on that row that says what you are looking at rather
          than how it is filtered, so it reads as a control and a phone gets it
          too.
        */}
        <PopoverTrigger
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
        </PopoverTrigger>

        <PopoverContent align="start" className="w-72 p-0">
          <Command filter={keywordFilter}>
            {searchable && <CommandInput placeholder="Search workspaces" className="h-10" />}
            <CommandList className="max-h-96 p-1">
              <CommandEmpty className="py-6">No workspace by that name.</CommandEmpty>

              {/* Every workspace, grouped by the organization it belongs to, with
                  a tick on the current one. The organization you are in comes
                  first; picking a row in another one switches both. */}
              <CommandGroup
                heading={multiOrg ? <OrgHeading name={activeOrg?.name ?? "Workspaces"} role={activeOrgRole} /> : undefined}
              >
                {list.length > 1 && (
                  <CommandItem
                    value="__all"
                    keywords={["All workspaces", activeOrg?.name ?? ""]}
                    onSelect={() => switchTo(ALL_WORKSPACES)}
                  >
                    <Check className={cn("size-3.5", showingAll ? "opacity-100" : "opacity-0")} />
                    <span className={cn("min-w-0 flex-1 truncate", showingAll && "font-medium")}>All workspaces</span>
                    <span className="text-muted-foreground w-5 text-right text-xs tabular-nums">
                      {list.reduce((n, w) => n + w.formCount, 0)}
                    </span>
                  </CommandItem>
                )}
                {list.map((ws) => (
                  <CommandItem
                    key={ws.id}
                    value={ws.id}
                    keywords={[ws.name, activeOrg?.name ?? ""]}
                    onSelect={() => switchTo(ws.slug)}
                  >
                    <Check className={cn("size-3.5", ws.id === current?.id ? "opacity-100" : "opacity-0")} />
                    <span className={cn("min-w-0 flex-1 truncate", ws.id === current?.id && "font-medium")}>
                      {ws.name}
                    </span>
                    {grantPill(ws.myRole) && <Pill>{grantPill(ws.myRole)}</Pill>}
                    <span className="text-muted-foreground w-5 text-right text-xs tabular-nums">{ws.formCount}</span>
                  </CommandItem>
                ))}
              </CommandGroup>

              {otherOrgs.map((org) => (
                <CommandGroup key={org.id} heading={<OrgHeading name={org.name} role={org.role} />}>
                  {org.workspaces.map((ws) => (
                    <CommandItem
                      key={ws.id}
                      value={ws.id}
                      keywords={[ws.name, org.name]}
                      disabled={switchingTo !== null}
                      onSelect={() => void switchOrgTo(ws)}
                    >
                      <Check className="size-3.5 opacity-0" />
                      <span className="min-w-0 flex-1 truncate">{ws.name}</span>
                      {switchingTo === ws.id && <Loader2 className="size-3.5 animate-spin" />}
                      {grantPill(ws.myRole) && <Pill>{grantPill(ws.myRole)}</Pill>}
                      <span className="text-muted-foreground w-5 text-right text-xs tabular-nums">{ws.formCount}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              ))}

              {(canCreate || canManage || (canManageAccess && current)) && (
                <>
                  <CommandSeparator className="-mx-1" />
                  {/* Actions on the organization you are in. */}
                  <CommandGroup>
                    {/* Who can open the workspace you are in: the door for the
                        admin who starts from the folder rather than a person. */}
                    {canManageAccess && current && (
                      <CommandItem
                        value="__access"
                        keywords={["Manage access"]}
                        onSelect={() => {
                          setOpen(false);
                          setAccessOpen(true);
                        }}
                      >
                        <Users className="size-3.5" />
                        Manage access…
                      </CommandItem>
                    )}
                    {canCreate && (
                      <CommandItem
                        value="__create"
                        keywords={["New workspace"]}
                        onSelect={() => {
                          setOpen(false);
                          setCreateOpen(true);
                        }}
                      >
                        <Plus className="size-3.5" />
                        New workspace
                      </CommandItem>
                    )}
                    {/* Rename and delete live in settings; this is the way there. */}
                    {canManage && (
                      <CommandItem
                        value="__manage"
                        keywords={["Manage workspaces"]}
                        onSelect={() => {
                          setOpen(false);
                          router.push("/settings/workspaces");
                        }}
                      >
                        <Settings2 className="size-3.5" />
                        Manage workspaces
                      </CommandItem>
                    )}
                  </CommandGroup>
                </>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

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
