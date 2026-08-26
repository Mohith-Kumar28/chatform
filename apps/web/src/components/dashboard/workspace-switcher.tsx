"use client";

import { Building2, Check, ChevronsUpDown } from "lucide-react";
import { useListOrganizations, useActiveOrganization } from "@/lib/auth/auth-client";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

/**
 * Organization switcher — Youform's leading nav element, and the first thing
 * a multi-workspace user looks for. `useListOrganizations` and
 * `useActiveOrganization` were both exported from the auth client and used
 * nowhere.
 */
export function WorkspaceSwitcher() {
  const { data: orgs } = useListOrganizations();
  const { data: active } = useActiveOrganization();

  const list = orgs ?? [];
  const current = active ?? list[0];
  if (!current) return null;

  // With a single organization there is nothing to switch to; show it as a
  // label rather than a control that does nothing when clicked.
  if (list.length <= 1) {
    return (
      <span className="text-muted-foreground hidden items-center gap-1.5 rounded-full px-2.5 py-1 text-sm md:inline-flex">
        <Building2 className="size-3.5" strokeWidth={1.75} />
        {current.name}
      </span>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          "hover:bg-muted text-muted-foreground hover:text-foreground hidden items-center gap-1.5 rounded-full px-2.5 py-1 text-sm md:inline-flex",
          "focus-visible:ring-ring/50 outline-none transition-colors focus-visible:ring-2",
        )}
      >
        <Building2 className="size-3.5" strokeWidth={1.75} />
        {current.name}
        <ChevronsUpDown className="size-3 opacity-50" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel>Workspaces</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {list.map((org) => (
          <DropdownMenuItem
            key={org.id}
            onSelect={() => {
              // Better Auth owns the active-organization cookie; a full
              // navigation guarantees the server picks up the new value.
              void fetch(`/api/auth/organization/set-active`, {
                method: "POST",
                headers: { "content-type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ organizationId: org.id }),
              }).then(() => window.location.assign("/dashboard"));
            }}
          >
            <span className="min-w-0 flex-1 truncate">{org.name}</span>
            {org.id === current.id && <Check className="size-3.5 shrink-0" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
