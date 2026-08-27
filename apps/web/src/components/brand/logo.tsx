import { cn } from "@/lib/utils";

/**
 * The mark: a speech bubble whose tail is also the baseline of a form field.
 *
 * The old header rendered a literal letter `c` in an orange box with
 * `text-white` hardcoded — which disappears in dark mode, where
 * `--primary-foreground` is dark ink, not white. This uses `currentColor` for
 * the ink so it inherits correctly in both themes.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
      className={cn("size-7", className)}
    >
      <rect width="32" height="32" rx="9" className="fill-primary" />
      <path
        d="M8.5 12.25A2.75 2.75 0 0 1 11.25 9.5h9.5a2.75 2.75 0 0 1 2.75 2.75v5.5a2.75 2.75 0 0 1-2.75 2.75h-6.19l-3.31 2.9a.6.6 0 0 1-1-.45v-2.45h-.75Z"
        className="fill-primary-foreground"
      />
      <path
        d="M12.25 13.75h7.5M12.25 16.75h4.5"
        className="stroke-primary"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("flex items-center gap-2", className)}>
      <LogoMark />
      <span className="font-display text-h3 tracking-tight">chatform</span>
    </span>
  );
}
