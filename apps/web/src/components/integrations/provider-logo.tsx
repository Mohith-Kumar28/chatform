import { Landmark } from "lucide-react";
import type { PaymentProviderName } from "@repo/form-schema";
import { cn } from "@/lib/utils";

/**
 * The gateway's own mark, on a white tile so it reads the same in both themes.
 *
 * Paths from Simple Icons (CC0). Cashfree has no mark there, so it keeps the
 * generic bank icon rather than an approximation of someone else's logo.
 */
const MARKS: Partial<Record<PaymentProviderName, { color: string; path: string }>> = {
  razorpay: {
    color: "#3395FF",
    path: "M22.436 0l-11.91 7.773-1.174 4.276 6.625-4.297L11.65 24h4.391l6.395-24zM14.26 10.098L3.389 17.166 1.564 24h9.008l3.688-13.902Z",
  },
  stripe: {
    color: "#635BFF",
    path: "M13.976 9.15c-2.172-.806-3.356-1.426-3.356-2.409 0-.831.683-1.305 1.901-1.305 2.227 0 4.515.858 6.09 1.631l.89-5.494C18.252.975 15.697 0 12.165 0 9.667 0 7.589.654 6.104 1.872 4.56 3.147 3.757 4.992 3.757 7.218c0 4.039 2.467 5.76 6.476 7.219 2.585.92 3.445 1.574 3.445 2.583 0 .98-.84 1.545-2.354 1.545-1.875 0-4.965-.921-6.99-2.109l-.9 5.555C5.175 22.99 8.385 24 11.714 24c2.641 0 4.843-.624 6.328-1.813 1.664-1.305 2.525-3.236 2.525-5.732 0-4.128-2.524-5.851-6.594-7.305h.003z",
  },
};

/** The bare mark in the gateway's colour, for a trust line. Null where there is none. */
export function ProviderMark({ provider, className }: { provider: PaymentProviderName; className?: string }) {
  const mark = MARKS[provider];
  if (!mark) return null;
  return (
    <svg viewBox="0 0 24 24" className={cn("size-3 shrink-0", className)} fill={mark.color} aria-hidden>
      <path d={mark.path} />
    </svg>
  );
}

export function ProviderLogo({ provider, className }: { provider: PaymentProviderName; className?: string }) {
  const mark = MARKS[provider];
  return (
    <span
      className={cn(
        "grid size-8 shrink-0 place-items-center rounded-lg border",
        mark ? "border-black/5 bg-white" : "bg-muted text-muted-foreground",
        className,
      )}
      aria-hidden
    >
      {mark ? (
        <svg viewBox="0 0 24 24" className="size-[55%]" fill={mark.color}>
          <path d={mark.path} />
        </svg>
      ) : (
        <Landmark className="size-[45%]" />
      )}
    </span>
  );
}

/** The Model Context Protocol mark (Simple Icons, CC0), drawn in the text colour so it follows the theme. */
export function McpMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={cn("size-4 shrink-0", className)} fill="currentColor" aria-hidden>
      <path d="M13.85 0a4.16 4.16 0 0 0-2.95 1.217L1.456 10.66a.835.835 0 0 0 0 1.18.835.835 0 0 0 1.18 0l9.442-9.442a2.49 2.49 0 0 1 3.541 0 2.49 2.49 0 0 1 0 3.541L8.59 12.97l-.1.1a.835.835 0 0 0 0 1.18.835.835 0 0 0 1.18 0l.1-.098 7.03-7.034a2.49 2.49 0 0 1 3.542 0l.049.05a2.49 2.49 0 0 1 0 3.54l-8.54 8.54a1.96 1.96 0 0 0 0 2.755l1.753 1.753a.835.835 0 0 0 1.18 0 .835.835 0 0 0 0-1.18l-1.753-1.753a.266.266 0 0 1 0-.394l8.54-8.54a4.185 4.185 0 0 0 0-5.9l-.05-.05a4.16 4.16 0 0 0-2.95-1.218c-.2 0-.401.02-.6.048a4.17 4.17 0 0 0-1.17-3.552A4.16 4.16 0 0 0 13.85 0m0 3.333a.84.84 0 0 0-.59.245L6.275 10.56a4.186 4.186 0 0 0 0 5.902 4.186 4.186 0 0 0 5.902 0L19.16 9.48a.835.835 0 0 0 0-1.18.835.835 0 0 0-1.18 0l-6.985 6.984a2.49 2.49 0 0 1-3.54 0 2.49 2.49 0 0 1 0-3.54l6.983-6.985a.835.835 0 0 0 0-1.18.84.84 0 0 0-.59-.245" />
    </svg>
  );
}
