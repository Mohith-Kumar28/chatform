"use client";

import { useState } from "react";
import { Building2, Check, ChevronsUpDown, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { authClient, useActiveOrganization, useListOrganizations } from "@/lib/auth/auth-client";
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/**
 * Organization switcher.
 *
 * Always a menu, even with one organization — otherwise there is nowhere to
 * create a second, which left people stuck with whatever org signup happened
 * to make.
 *
 * All of this is Better Auth's organization plugin: `organization.create`,
 * `setActive` and `checkSlug` are endpoints it already ships.
 */
export function WorkspaceSwitcher() {
  const { data: orgs } = useListOrganizations();
  const { data: active } = useActiveOrganization();
  const [createOpen, setCreateOpen] = useState(false);
  const [switching, setSwitching] = useState<string | null>(null);

  const list = orgs ?? [];
  const current = active ?? list[0];

  async function switchTo(id: string) {
    if (id === current?.id) return;
    setSwitching(id);
    try {
      await authClient.organization.setActive({ organizationId: id });
      // The active org lives in the session cookie and the server reads it on
      // every request, so this has to be a real navigation — a client
      // transition would show the previous workspace's cached data.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign("/dashboard");
    } catch (err) {
      setSwitching(null);
      toast.error("Couldn't switch", {
        description: err instanceof Error ? err.message : undefined,
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
          <Building2 className="size-3.5" strokeWidth={1.75} />
          <span className="max-w-32 truncate">{current?.name ?? "Workspace"}</span>
          <ChevronsUpDown className="size-3 opacity-50" />
        </DropdownMenuTrigger>

        <DropdownMenuContent align="start" className="w-60">
          <DropdownMenuLabel className="text-muted-foreground text-xs font-normal">
            Workspaces
          </DropdownMenuLabel>
          {list.map((org) => (
            <DropdownMenuItem key={org.id} onSelect={() => void switchTo(org.id)}>
              <span className="min-w-0 flex-1 truncate">{org.name}</span>
              {switching === org.id ? (
                <Loader2 className="size-3.5 shrink-0 animate-spin" />
              ) : (
                org.id === current?.id && <Check className="size-3.5 shrink-0" />
              )}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setCreateOpen(true)}>
            <Plus className="size-3.5" />
            New workspace
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <CreateOrgDialog open={createOpen} onOpenChange={setCreateOpen} />
    </>
  );
}

function CreateOrgDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  async function create() {
    const trimmed = name.trim();
    if (!trimmed) return;
    setBusy(true);
    try {
      // Slugs are globally unique, so derive one and let checkSlug tell us it
      // is taken rather than colliding on insert.
      const base =
        trimmed
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/(^-|-$)/g, "")
          .slice(0, 40) || "workspace";
      let slug = base;
      for (let i = 0; i < 5; i++) {
        const check = await authClient.organization.checkSlug({ slug });
        if (check.data?.status) break;
        slug = `${base}-${Math.random().toString(36).slice(2, 6)}`;
      }

      const created = await authClient.organization.create({ name: trimmed, slug });
      if (created.error) throw new Error(created.error.message ?? "Could not create");
      if (created.data?.id) {
        await authClient.organization.setActive({ organizationId: created.data.id });
      }
      // As above: the new workspace is only active once the server re-reads the cookie.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign("/dashboard");
    } catch (err) {
      setBusy(false);
      toast.error("Couldn't create the workspace", {
        description: err instanceof Error ? err.message : undefined,
      });
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => (busy ? null : onOpenChange(o))}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>New workspace</DialogTitle>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="org-name">Name</Label>
          <Input
            id="org-name"
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Acme Inc"
            onKeyDown={(e) => {
              if (e.key === "Enter" && name.trim()) void create();
            }}
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={create} disabled={busy || !name.trim()}>
            {busy && <Loader2 className="size-3.5 animate-spin" />}
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
