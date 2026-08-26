"use client";

import { useQuery } from "@tanstack/react-query";
import { customFetch } from "@/lib/api/mutator";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

interface UsageResponse {
  plan: string;
  planId: string;
  status: string;
  periodEnd: number | null;
  limits: Record<string, number>;
  usage: Record<string, number>;
}

const METERS = [
  { key: "responses", label: "Responses this month", limitKey: "responses_per_month" },
  { key: "ai_generations", label: "AI generations", limitKey: "ai_generations_per_month" },
  { key: "sessions", label: "Chat sessions", limitKey: "responses_per_month" },
];

export default function UsagePage() {
  const { data, isLoading } = useQuery({
    queryKey: ["usage"],
    queryFn: () => customFetch<UsageResponse>("/api/billing/usage"),
  });

  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-10">
      {isLoading && (
        <div className="space-y-3">
          <Skeleton className="h-8 w-40" />
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-28 w-full" />)}
        </div>
      )}
      {!isLoading && !data && (
        <Card>
          <CardContent className="text-muted-foreground py-10 text-center text-sm">
            Could not load usage. Make sure you&apos;re signed in and have an organization.
          </CardContent>
        </Card>
      )}
      {data && (
      <>
      <header className="mb-8">
        <h1 className="font-display text-3xl font-semibold tracking-tight">Usage</h1>
        <p className="text-muted-foreground mt-1 flex items-center gap-2 text-sm">
          <Badge variant="secondary">{data?.plan ?? "Free"} plan</Badge>
          {data?.periodEnd && <>renews {new Date(data.periodEnd).toLocaleDateString()}</>}
        </p>
      </header>

      <div className="space-y-3">
        {METERS.map((m) => {
          const used = data?.usage?.[m.key] ?? 0;
          const limit = data?.limits?.[m.limitKey] ?? 100;
          const pct = Math.min(100, Math.round((used / limit) * 100));
          const over = used >= limit;
          return (
            <Card key={m.key}>
              <CardHeader className="pb-1">
                <CardTitle className="text-sm font-medium">{m.label}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="bg-muted mb-1.5 h-2.5 overflow-hidden rounded-full">
                  <div
                    className={`h-full rounded-full ${over ? "bg-destructive" : "bg-[var(--primary)]"}`}
                    style={{ width: `${Math.max(pct, 2)}%` }}
                  />
                </div>
                <p className="text-muted-foreground text-xs">
                  <span className={over ? "text-destructive font-medium" : "font-medium"}>{used}</span> / {limit}
                  {over && " — limit reached, upgrade to continue"}
                </p>
              </CardContent>
            </Card>
          );
        })}
      </div>
      </>
      )}
    </div>
  );
}
