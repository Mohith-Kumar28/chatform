"use client";

import Link from "next/link";
import { KeyRound, LogOut, Settings, Users } from "lucide-react";
import { signOut, useSession } from "@/lib/auth/auth-client";
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
          <Link href="/usage">
            <Settings className="size-3.5" />
            Usage &amp; billing
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          onSelect={async () => {
            await signOut();
            // Full navigation so the server sees the cleared cookie.
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
