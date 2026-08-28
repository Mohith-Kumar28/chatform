"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "motion/react";
import { FileStack, Gauge, KeyRound, LayoutGrid, Users } from "lucide-react";
import { TooltipHint } from "@/components/ui/kbd";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/**
 * The app's top-level destinations, in one place.
 *
 * Exported because the keyboard layer numbers them by position — the digit that
 * reaches a page and the order it appears in cannot drift apart if they are the
 * same array.
 */
export const APP_NAV = [
  { href: "/dashboard", label: "Forms", icon: LayoutGrid },
  { href: "/templates", label: "Templates", icon: FileStack },
  { href: "/api-keys", label: "API keys", icon: KeyRound },
  { href: "/billing", label: "Plan", icon: Gauge },
  { href: "/team", label: "Team", icon: Users },
] as const;

export function AppNav({ className }: { className?: string }) {
  const pathname = usePathname();
  return (
    <TooltipProvider delayDuration={400}>
      <nav className={cn("flex items-center gap-0.5", className)} aria-label="Main">
        {APP_NAV.map((item, i) => {
          const active = pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Tooltip key={item.href}>
              <TooltipTrigger asChild>
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "relative isolate flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm",
                    "transition-colors duration-[var(--duration-micro)] ease-[var(--ease-out)]",
                    active ? "text-primary font-medium" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {active && (
                    <motion.span
                      layoutId="app-nav-pill"
                      className="bg-primary-soft absolute inset-0 -z-10 rounded-full"
                      transition={{ type: "spring", stiffness: 500, damping: 40 }}
                    />
                  )}
                  <item.icon className="size-3.5" strokeWidth={1.75} />
                  <span className="hidden sm:inline">{item.label}</span>
                </Link>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                <TooltipHint label={item.label} keys={String(i + 1)} />
              </TooltipContent>
            </Tooltip>
          );
        })}
      </nav>
    </TooltipProvider>
  );
}
