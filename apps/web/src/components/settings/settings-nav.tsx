"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useActiveOrg } from "@/hooks/use-active-org";
import { SETTINGS_GROUPS } from "@/components/settings/sections";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * The settings map, as a rail on desktop and a strip on mobile.
 *
 * One component and one array for both, so the order and the labels cannot
 * disagree between viewports.
 *
 * ## Why the rail never changes shape
 *
 * Every section renders for every role. A rail whose items appear and disappear
 * depending on what you may do teaches nobody anything — it just makes the
 * product look different to different people with no explanation. Sections you
 * cannot act in render read-only, which is the rule `gate.tsx` already sets:
 * "a capability nobody can see is one nobody knows to ask their admin for."
 *
 * ## Why the active item is `bg-accent` and does not slide
 *
 * Violet is the app's "where am I" colour and the travelling pill is its
 * signature, both spent on the header nav a few inches above this. A sub-nav
 * repeating either would compete with the thing it is subordinate to — and
 * DESIGN.md §4.5 rules out animating settings anyway.
 */
export function SettingsNav() {
  const pathname = usePathname();
  const { org, isPending } = useActiveOrg();

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");

  return (
    <>
      {/* ── desktop rail ── */}
      <nav aria-label="Settings" className="hidden w-56 shrink-0 space-y-4 p-3 md:block">
        {SETTINGS_GROUPS.map((group) => (
          <div key={group.id}>
            <div className="px-3 pb-1.5">
              {/* The first group is named after the organization itself, which
                  is what makes "General" and "People" unambiguously *this*
                  organization's — and "Workspaces" under it the folders it
                  holds, not the accounts you belong to. */}
              {group.label === null ? (
                isPending ? (
                  <Skeleton className="h-4 w-24" />
                ) : (
                  <>
                    <p className="text-caption truncate font-medium" title={org?.name ?? undefined}>
                      {org?.name ?? "No organization"}
                    </p>
                    <p className="text-muted-foreground text-micro">Organization</p>
                  </>
                )
              ) : (
                <p className="text-muted-foreground text-micro font-semibold tracking-[0.08em] uppercase">
                  {group.label}
                </p>
              )}
            </div>

            <div className="space-y-0.5">
              {group.sections.map((s) => (
                <Link
                  key={s.id}
                  href={s.href}
                  aria-current={isActive(s.href) ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-2 rounded-lg px-3 py-2 text-sm",
                    "transition-colors duration-[var(--duration-micro)] ease-[var(--ease-out)]",
                    isActive(s.href)
                      ? "bg-accent font-medium"
                      : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                  )}
                >
                  <s.icon className="size-3.5 shrink-0" strokeWidth={1.75} aria-hidden />
                  {s.label}
                </Link>
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* ── mobile strip ──
          Not a Select: hiding the map behind a control defeats half the point of
          gathering these screens in one place, which is that you can now see API
          keys exists. Not a Sheet either — the shell already spends its left
          drawer on the main nav, and two drawers is a maze. */}
      <nav
        aria-label="Settings"
        className="-mx-4 flex snap-x gap-1 overflow-x-auto px-4 pb-3 md:hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {SETTINGS_GROUPS.flatMap((g) => g.sections).map((s) => (
          <Link
            key={s.id}
            href={s.href}
            aria-current={isActive(s.href) ? "page" : undefined}
            className={cn(
              "shrink-0 snap-start rounded-full px-3 py-1.5 text-sm whitespace-nowrap",
              "transition-colors duration-[var(--duration-micro)] ease-[var(--ease-out)]",
              isActive(s.href) ? "bg-accent font-medium" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {s.label}
          </Link>
        ))}
      </nav>
    </>
  );
}
