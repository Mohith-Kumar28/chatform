"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "motion/react";
import { FileStack, Gauge, KeyRound, LayoutGrid, Users } from "lucide-react";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/dashboard", label: "Forms", icon: LayoutGrid },
  { href: "/templates", label: "Templates", icon: FileStack },
  { href: "/api-keys", label: "API keys", icon: KeyRound },
  { href: "/billing", label: "Plan", icon: Gauge },
  { href: "/team", label: "Team", icon: Users },
] as const;

export function AppNav({ className }: { className?: string }) {
  const pathname = usePathname();
  return (
    <nav className={cn("flex items-center gap-0.5", className)} aria-label="Main">
      {NAV.map((item) => {
        const active = pathname === item.href || pathname.startsWith(item.href + "/");
        return (
          <Link
            key={item.href}
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
        );
      })}
    </nav>
  );
}
