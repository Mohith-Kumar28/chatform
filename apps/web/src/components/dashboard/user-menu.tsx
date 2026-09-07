"use client";

import { BookOpen, Building2, Check, Crown, LogOut, Monitor, Moon, Sun, UserRound } from "lucide-react";
import { useTheme } from "next-themes";
import Link from "next/link";
import { signOut, useSession } from "@/lib/auth/auth-client";
import { useEntitlements } from "@/hooks/use-entitlements";
import { useHydrated } from "@/hooks/use-client-value";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

/**
 * Account menu.
 *
 * It used to be a second copy of the navigation — Team, API keys, Plan &
 * usage — three items that are already in the header nav two inches to the
 * left, and were the only things in the menu besides Sign out. A menu whose
 * entire contents are duplicates of the visible nav is a menu that teaches
 * people not to open it.
 *
 * What belongs here is what has nowhere else to be: who you are signed in as,
 * the theme (a setting you change once, which was spending a permanent header
 * slot on itself), the way out to the docs, and the way out entirely.
 */

const THEMES = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
] as const;

export function UserMenu() {
  const { data: session } = useSession();
  const ent = useEntitlements();
  const { theme, setTheme } = useTheme();
  // The server cannot know the resolved theme, so no tick is drawn until the
  // client has told us which one is real.
  const mounted = useHydrated();
  if (!session) return null;

  const email = session.user.email;
  const name = session.user.name || email;
  const image = session.user.image;
  const initials = (name.match(/\b\w/g) ?? ["?"]).slice(0, 2).join("").toUpperCase();
  const current = THEMES.find((t) => t.value === theme) ?? THEMES[2];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="focus-visible:ring-ring/50 rounded-full outline-none focus-visible:ring-2">
        <Avatar className="size-8">
          {/*
            Google and GitHub both hand us a photo at sign-in and it was being
            thrown away in favour of two letters. Radix only swaps in the
            fallback when the image fails or is absent, so the initials still
            cover an email signup — and a dead avatar URL.
          */}
          {image && <AvatarImage src={image} alt="" />}
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

        {/*
          The two screens this menu is the only route to. Everything else in
          here is a setting or a way out; these are places. "Account" is you —
          your name, your address, your password, your sessions — and
          "Workspace" is the one you are signed into, including the way to
          leave it. Neither has a nav slot, which is exactly why they belong
          in the menu that opens off your own avatar.
        */}
        <DropdownMenuItem asChild>
          <Link href="/account">
            <UserRound className="size-3.5" strokeWidth={1.75} />
            Account
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/organization">
            <Building2 className="size-3.5" strokeWidth={1.75} />
            Workspace
          </Link>
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <current.icon className="size-3.5" strokeWidth={1.75} />
            Theme
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-36">
            {THEMES.map((opt) => (
              <DropdownMenuItem key={opt.value} onSelect={() => setTheme(opt.value)}>
                <opt.icon className="size-3.5" strokeWidth={1.75} />
                <span className="flex-1">{opt.label}</span>
                {mounted && theme === opt.value && <Check className="size-3.5" />}
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        {/* New tab, not a navigation: reading the reference should not cost you
            the screen you were reading it for. */}
        <DropdownMenuItem asChild>
          <a href="/docs" target="_blank" rel="noreferrer">
            <BookOpen className="size-3.5" />
            Documentation
          </a>
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
