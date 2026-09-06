"use client";

import Link from "next/link";
import { Crown, KeyRound, LogOut, Settings, Users } from "lucide-react";
import { signOut, useSession } from "@/lib/auth/auth-client";
import { useEntitlements } from "@/hooks/use-entitlements";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

/**
 * Account menu. Replaces a bare email string plus a "Sign out" ghost button,
 * and finally uses the `avatar` and `dropdown-menu` primitives, which had zero
 * importers despite being installed.
 */
export function UserMenu() {
  const { data: session } = useSession();
  const ent = useEntitlements();
  if (!session) return null;

  const email = session.user.email;
  const name = session.user.name || email;
  const initials = (name.match(/\b\w/g) ?? ["?"]).slice(0, 2).join("").toUpperCase();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="focus-visible:ring-ring/50 rounded-full outline-none focus-visible:ring-2">
        <Avatar className="size-8">
          <AvatarFallback className="bg-primary-soft text-primary text-xs font-medium">
            {initials}
          </AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="font-normal">
          <p className="truncate text-sm font-medium">{name}</p>
          <p className="text-muted-foreground truncate text-xs">{email}</p>
          {/*
            The plan again, spelled out. The header badge is a mark you learn to
            read; this is the sentence for the first time you see it, and it is
            where someone looks when they want to check rather than glance.
          */}
          {ent.data && (
            <p className="text-muted-foreground mt-1.5 flex items-center gap-1 text-xs">
              {ent.data.planId !== "free" && (
                <Crown className="text-brand-violet-soft-foreground size-3" strokeWidth={2.25} aria-hidden />
              )}
              {ent.data.planName} plan
            </p>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/team">
            <Users className="size-3.5" />
            Team
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/api-keys">
            <KeyRound className="size-3.5" />
            API keys
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          {/* `/billing` directly: `/usage` is a redirect stub kept for bookmarks. */}
          <Link href="/billing">
            <Settings className="size-3.5" />
            Plan &amp; usage
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          onSelect={async () => {
            await signOut();
            // Full navigation so the server sees the cleared cookie — and so
            // no cached query from the signed-in session survives the exit.
            // eslint-disable-next-line @next/next/no-location-assign-relative-destination
            window.location.assign("/signin");
          }}
        >
          <LogOut className="size-3.5" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
