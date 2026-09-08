"use client";

import { useState } from "react";
import { Building2, ChevronsUpDown, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { authClient, useListOrganizations } from "@/lib/auth/auth-client";
import { useActiveOrg } from "@/hooks/use-active-org";
import { useMyRole } from "@/hooks/use-my-role";
import { roleTitle } from "@/lib/roles";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { CreateOrganizationDialog } from "@/components/auth/organization/create-organization-dialog";

/**
 * Organization switcher.
 *
 * Always a menu, even with one organization — otherwise there is nowhere to
 * create a second, which left people stuck with whatever org signup happened
 * to make.
 *
 * All of this is Better Auth's organization plugin: `organization.create`,
 * `setActive` and `checkSlug` are endpoints it already ships.
 *
 * `useActiveOrg` rather than `useActiveOrganization` because this component was
 * hiding the bug it now helps fix: falling back to `list[0]` meant a session
 * with no active organization still showed a workspace name up here, while
 * `/team` — which asks for the active org honestly — said there wasn't one.
 * The fallback stays for the moment the repair is in flight; it is no longer
 * the only thing standing between the user and a blank page.
 *
 * The menu opens on the reader's own role, because this is the one control in
 * the product that already names the workspace they are in, and "what can I do
 * here" had no answer anywhere outside `/team` — a page an editor or a viewer
 * has no other reason to open, and which a viewer reads as a roster of other
 * people. Somebody who cannot publish a form should be able to find out why
 * without being told.
 *
 * It sits above the switch list rather than beside a row, and that is the
 * point: `organization.list` returns organizations without the membership that
 * produced them, so a role per row would be a claim about workspaces this
 * component cannot see into. One label about the workspace it *can* see into is
 * both honest and the question being asked.
 *
 * A pill rather than the sentence it used to be. "You're an owner here" reads
 * as a line of prose in a menu made of names, and it says "here" underneath the
 * name of the place it means — restating in words what its position already
 * says. The pill sits on the same line as the workspace, which is where the
 * relationship between the two is legible without reading.
 *
 * The list below is the workspaces you are NOT in. It used to be all of them,
 * with a tick against the current one, so a two-workspace account saw its own
 * workspace named twice in a menu six lines long — once as the heading and once
 * as a row confirming what the heading said. A switcher only needs to offer the
 * things you can switch to.
 */
export function WorkspaceSwitcher() {
  const { data: orgs } = useListOrganizations();
  const { org: active } = useActiveOrg();
  const myRole = useMyRole();
  const [createOpen, setCreateOpen] = useState(false);
  const [switching, setSwitching] = useState<string | null>(null);

  const list = orgs ?? [];
  const current = active ?? list[0];
  // Everything except where you already are. With one workspace this is empty
  // and the whole section disappears, which is correct: there is nowhere to go.
  const others = list.filter((org) => org.id !== current?.id);

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

        <DropdownMenuContent align="start" className="w-64">
          <div className="flex items-center gap-2 px-2 py-1.5">
            <p className="min-w-0 flex-1 truncate text-sm font-medium">
              {current?.name ?? "Workspace"}
            </p>
            {/* Nothing at all while the membership is in flight. It shares a
                line with the name now, so an absent pill costs no height and
                the menu cannot resize under the cursor — which is what the old
                non-breaking space was holding open. A role that arrives late is
                fine; a wrong one is not. */}
            {myRole && (
              <Badge variant="soft" className="shrink-0">
                {roleTitle(myRole)}
              </Badge>
            )}
          </div>
          {others.length > 0 && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-muted-foreground text-xs font-normal">
                Switch to
              </DropdownMenuLabel>
              {others.map((org) => (
                <DropdownMenuItem key={org.id} onSelect={() => void switchTo(org.id)}>
                  <span className="min-w-0 flex-1 truncate">{org.name}</span>
                  {switching === org.id && <Loader2 className="size-3.5 shrink-0 animate-spin" />}
                </DropdownMenuItem>
              ))}
            </>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setCreateOpen(true)}>
            <Plus className="size-3.5" />
            New workspace
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Better Auth UI's own dialog, extended with a logo field and an
          invite step. This component used to carry a second create form of its
          own — including a hand-written copy of the slug-collision retry that
          `useCreateOrganization` already does — so the product had two
          different "new workspace" experiences depending on whether you came
          from this menu or from Settings. Now it has one.

          `hideSlug` keeps this menu's behaviour: the slug is derived from the
          name and never asked for. */}
      <CreateOrganizationDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        hideSlug
        onCompleted={() => {
          // The new workspace is active in the session cookie — Better Auth's
          // `organization.create` sets it server-side — and the server reads
          // that on every request, so this has to be a real navigation. A
          // client transition would render the previous workspace's cached
          // dashboard under the new workspace's name.
          // eslint-disable-next-line @next/next/no-location-assign-relative-destination
          window.location.assign("/dashboard");
        }}
      />
    </>
  );
}
