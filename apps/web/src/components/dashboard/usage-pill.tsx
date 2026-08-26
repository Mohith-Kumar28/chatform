"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { customFetch } from "@/lib/api/mutator";
import { cn } from "@/lib/utils";

interface UsageResponse {
  plan?: { id: string; name: string };
  limits?: Record<string, number>;
  usage?: Record<string, number>;
}

/**
 * Responses-this-month pill. `/api/billing/usage` existed and was never called
 * from anywhere, so a user had no idea they were approaching their plan cap
 * until responses started being rejected.
 */
export function UsagePill() {
  const { data } = useQuery({
    queryKey: ["billing", "usage"],
    queryFn: () => customFetch<UsageResponse>("/api/billing/usage"),
    staleTime: 5 * 60_000,
  });

  const limit = data?.limits?.responses_per_month;
  const used = data?.usage?.responses ?? 0;
  if (!limit) return null;

  const ratio = used / limit;
  return (
    <Link
      href="/usage"
      className={cn(
        "hidden items-center gap-1.5 rounded-full px-2.5 py-1 text-xs transition-colors md:inline-flex",
        ratio >= 1
          ? "bg-[var(--destructive-soft)] text-destructive"
          : ratio > 0.8
            ? "bg-[var(--warning-soft)] text-[var(--warning-foreground)]"
            : "text-muted-foreground hover:bg-muted",
      )}
      title={`${used} of ${limit} responses used this month`}
    >
      <span className="tabular">
        {used}/{limit}
      </span>
      <span className="opacity-60">responses</span>
    </Link>
  );
}
