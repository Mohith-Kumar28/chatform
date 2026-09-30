import { cn } from "@/lib/utils";
import type { ImportSource } from "./import-client";

/**
 * Small marks for the builders we import from, drawn here rather than
 * fetched: they sit beside a label that names the product, the way a
 * "sign in with" button does, and a remote logo is one more request on the
 * page that has to be fastest.
 */
export function SourceLogo({ source, className }: { source: ImportSource; className?: string }) {
  const common = { "aria-hidden": true, className: cn("size-8 shrink-0", className) } as const;
  switch (source) {
    case "typeform":
      return (
        <svg viewBox="0 0 32 32" {...common}>
          <rect x="3" y="9" width="9" height="14" rx="3.5" fill="currentColor" />
          <rect x="13.5" y="9" width="15.5" height="14" rx="7" fill="currentColor" />
        </svg>
      );
    case "google_forms":
      return (
        <svg viewBox="0 0 32 32" {...common}>
          <path d="M8 3h11l7 7v17a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" fill="#7248B9" />
          <path d="M19 3v5a2 2 0 0 0 2 2h5Z" fill="#B39DDB" />
          {[14, 18.5, 23].map((y) => (
            <g key={y} fill="#fff">
              <circle cx="11" cy={y} r="1.3" />
              <rect x="14" y={y - 1} width="8" height="2" rx="1" />
            </g>
          ))}
        </svg>
      );
    case "tally":
      return (
        <svg viewBox="0 0 32 32" {...common}>
          <rect x="3" y="3" width="26" height="26" rx="7" fill="currentColor" />
          <g stroke="var(--background, #fff)" strokeWidth="2.4" strokeLinecap="round">
            <path d="M11 10v12M15 10v12M19 10v12" />
            <path d="M8.5 19.5 22.5 12.5" />
          </g>
        </svg>
      );
    case "youform":
      return (
        <svg viewBox="0 0 32 32" {...common}>
          <rect x="3" y="3" width="26" height="26" rx="8" fill="#F4C94E" />
          <circle cx="12.5" cy="14" r="1.8" fill="#1F1F1F" />
          <circle cx="19.5" cy="14" r="1.8" fill="#1F1F1F" />
          <path d="M11.5 19c2.6 2.4 6.4 2.4 9 0" stroke="#1F1F1F" strokeWidth="2" strokeLinecap="round" fill="none" />
        </svg>
      );
    case "jotform":
      return (
        <svg viewBox="0 0 32 32" {...common}>
          <g strokeWidth="4.2" strokeLinecap="round" fill="none">
            <path d="M9 18 18 9" stroke="#0099FF" />
            <path d="M13 23 25 11" stroke="#FF6100" />
            <path d="M19 25 25 19" stroke="#FFB629" />
          </g>
          <path d="M5 21v6h6Z" fill="#0A1551" />
        </svg>
      );
  }
}
