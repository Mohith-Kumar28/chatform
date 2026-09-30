"use client";

import { useTheme } from "next-themes";
import { Check, Monitor, Moon, Sun } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { useHydrated } from "@/hooks/use-client-value";
import { cn } from "@/lib/utils";

const OPTIONS = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
] as const;

/**
 * One button showing the current theme, opening a menu to change it.
 *
 * The three-segment switch spent three slots in the header to express a
 * setting people touch once. A single pill says what is active and gets out of
 * the way — and "System" stays reachable, which a plain light/dark toggle
 * loses.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();
  // The server cannot know a stored choice, so show the default's icon until
  // hydration.
  const mounted = useHydrated();

  const current = OPTIONS.find((o) => o.value === theme) ?? OPTIONS[0];
  const Icon = mounted ? current.icon : Sun;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Theme: ${mounted ? current.label : "light"}`}
          className={cn("rounded-full", className)}
        >
          <Icon className="size-4" strokeWidth={1.75} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-36">
        {OPTIONS.map((opt) => (
          <DropdownMenuItem key={opt.value} onSelect={() => setTheme(opt.value)}>
            <opt.icon className="size-3.5" strokeWidth={1.75} />
            <span className="flex-1">{opt.label}</span>
            {mounted && theme === opt.value && <Check className="size-3.5" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
