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
