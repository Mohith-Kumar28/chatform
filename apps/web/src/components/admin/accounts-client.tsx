"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { useGetApiAdminAccounts } from "@/lib/api/admin/admin";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { apiData } from "@/lib/api/payload";
import { DirectoryTabs, useDirectoryTab } from "./directory-tabs";
import { PeopleTable } from "./people-table";
import { FormsTable } from "./forms-table";
import { compact, money, relativeDay, usd } from "./format";
import { cn } from "@/lib/utils";

/**
 * Every account, sortable by the thing you came here to find.
 *
 * A bespoke table rather than `@tanstack/react-table`, matching
 * `submissions-table.tsx`: the column set is fixed, the sorting happens in SQL
 * because the numbers are computed there, and a headless table library that adds
 * neither would only add a dependency.
 *
 * Filters live in the URL. That is what lets the Overview's funnel link straight
 * into "the accounts that built a form and never published it" — the chart and
 * the list are the same question asked twice, and a filter held in component
 * state could not be linked to.
 */

const COHORTS = [
  { value: "", label: "Everyone" },
  { value: "no_form", label: "Never built" },
  { value: "stalled", label: "Built, no responses" },
  { value: "created_form", label: "Built something" },
  { value: "published", label: "Published" },
  { value: "first_response", label: "Collecting" },
  { value: "ten_responses", label: "10+ responses" },
  { value: "paid", label: "Paying" },
] as const;

const SORTS = [
  { value: "created", label: "Newest" },
  { value: "active", label: "Last active" },
  { value: "responses", label: "Responses" },
  { value: "forms", label: "Forms" },
  { value: "mrr", label: "Revenue" },
  { value: "ai", label: "AI usage" },
] as const;

const PLAN_TONE: Record<string, string> = {
  free: "bg-muted text-muted-foreground",
  pro: "bg-primary-soft text-primary",
  business: "bg-[var(--success-soft)] text-[var(--success)]",
};

const PAGE = 50;

/** The row shape `/api/admin/accounts` returns. Mirrors the route's zod schema. */
interface Account {
  id: string;
  name: string;
  slug: string;
  created_at: number;
  owner_email: string | null;
  plan: string;
  seats: number;
  forms: number;
  responses_30d: number;
  ai_tokens_30d: number;
  ai_cost_micro_30d: number;
  last_active_at: number | null;
  mrr_cents: number;
}

export function AccountsClient() {
  const tab = useDirectoryTab();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const cohort = params.get("cohort") ?? "";
  const plan = params.get("plan") ?? "";
  const sort = params.get("sort") ?? "created";
  const q = params.get("q") ?? "";
  const offset = Number(params.get("offset") ?? 0);

  // The box is local so typing does not refetch on every keystroke; the URL only
  // moves on submit, which is also what makes a filtered view linkable.
  const [draft, setDraft] = useState(q);

  const setParam = (patch: Record<string, string>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    // Any change to the filters invalidates the page you were on.
    if (!("offset" in patch)) next.delete("offset");
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  };

  const { data, isPending } = useGetApiAdminAccounts({
    limit: PAGE,
    offset,
    sort: sort as "created",
    ...(q ? { q } : {}),
    ...(plan ? { plan: plan as "free" } : {}),
    ...(cohort ? { cohort: cohort as "paid" } : {}),
  });

  const body = apiData<{ accounts?: Account[]; total?: number }>(data);
  const accounts = body?.accounts ?? [];
  const total = body?.total ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-h1">Directory</h1>
          <p className="text-muted-foreground text-caption mt-0.5">
            {tab === "accounts"
              ? `${total.toLocaleString()} organizations. Search by name or by anyone's email.`
              : tab === "people"
                ? "Everyone with an account, and which organizations they can see."
                : "Every form on the platform, by title and by how it is performing."}
          </p>
        </div>
        <DirectoryTabs />
      </div>

      {tab === "people" && <PeopleTable />}
      {tab === "forms" && <FormsTable />}
      {tab !== "accounts" ? null : (
      <>
      <div className="flex flex-wrap items-center gap-2">
        <form
          className="relative min-w-56 flex-1 sm:max-w-xs"
          onSubmit={(e) => {
            e.preventDefault();
            setParam({ q: draft.trim() });
          }}
        >
          <Search
            className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2"
            strokeWidth={2}
            aria-hidden
          />
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Name, slug or email…"
            className="pl-8"
            aria-label="Search accounts"
          />
        </form>

        <div className="flex flex-wrap gap-1">
          {COHORTS.map((c) => (
            <Button
              key={c.value || "all"}
              size="sm"
              variant={cohort === c.value ? "secondary" : "ghost"}
              onClick={() => setParam({ cohort: c.value })}
            >
              {c.label}
            </Button>
          ))}
        </div>

        <div className="ml-auto flex flex-wrap gap-1">
          {SORTS.map((s) => (
            <Button
              key={s.value}
              size="sm"
              variant={sort === s.value ? "secondary" : "ghost"}
              onClick={() => setParam({ sort: s.value })}
            >
              {s.label}
            </Button>
          ))}
        </div>
      </div>

      {isPending ? (
        <Skeleton className="h-96 rounded-xl" />
      ) : accounts.length === 0 ? (
        <EmptyState
          title="No accounts match"
          description="Try a different cohort, or clear the search."
          action={
            <Button variant="secondary" onClick={() => setParam({ q: "", cohort: "", plan: "" })}>
              Clear filters
            </Button>
          }
        />
      ) : (
        <div className="bg-card shadow-xs overflow-x-auto rounded-xl">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Account</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead className="text-right">MRR</TableHead>
                <TableHead className="text-right">Forms</TableHead>
                <TableHead className="text-right">Responses 30d</TableHead>
                <TableHead className="text-right">AI 30d</TableHead>
                <TableHead className="text-right">Last active</TableHead>
                <TableHead className="text-right">Joined</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {accounts.map((a) => (
                <TableRow key={a.id} className="group">
                  <TableCell className="max-w-72">
                    <Link href={`/admin/accounts/${a.id}`} className="block min-w-0">
                      <span className="group-hover:text-primary block truncate font-medium transition-colors duration-[var(--duration-micro)]">
                        {a.name}
                      </span>
                      <span className="text-muted-foreground block truncate text-xs">
                        {a.owner_email ?? "no owner on record"}
                      </span>
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Badge className={cn("font-medium", PLAN_TONE[a.plan] ?? PLAN_TONE.free)}>
                      {a.plan}
                    </Badge>
                  </TableCell>
                  <TableCell className="tabular text-right">
                    {a.mrr_cents > 0 ? money(a.mrr_cents) : <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell className="tabular text-right">{a.forms}</TableCell>
                  <TableCell className="tabular text-right">{compact(a.responses_30d)}</TableCell>
                  <TableCell className="tabular text-right">
                    {a.ai_tokens_30d > 0 ? (
                      <span title={`${a.ai_tokens_30d.toLocaleString()} tokens`}>{usd(a.ai_cost_micro_30d)}</span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-right text-xs whitespace-nowrap">
                    {relativeDay(a.last_active_at)}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-right text-xs whitespace-nowrap">
                    {relativeDay(a.created_at)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {total > PAGE && (
        <div className="flex items-center justify-between gap-3">
          <p className="text-muted-foreground text-caption tabular">
            {offset + 1}&ndash;{Math.min(offset + PAGE, total)} of {total.toLocaleString()}
          </p>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="secondary"
              disabled={offset === 0}
              onClick={() => setParam({ offset: String(Math.max(0, offset - PAGE)) })}
            >
              Previous
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={offset + PAGE >= total}
              onClick={() => setParam({ offset: String(offset + PAGE) })}
            >
              Next
            </Button>
          </div>
        </div>
      )}
      </>
      )}
    </div>
  );
}
