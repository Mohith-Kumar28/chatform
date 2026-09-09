"use client";

import { useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { useGetApiAdminForms } from "@/lib/api/admin/admin";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { apiData } from "@/lib/api/payload";
import { DataTable } from "./data-table";
import { relativeDay } from "./format";

/**
 * Every form on the platform, by title and by how it is performing.
 *
 * The sort worth having is **drop-off**: forms with plenty of starts and few
 * finishes are where the product itself is failing, and for a conversational
 * form builder that is the closest thing there is to a list of what the
 * interviewer gets wrong. It is suppressed below ten starts, because two starts
 * and one finish is not a 50% drop-off, it is noise.
 *
 * Titles and counts only. There is no route from here into a response.
 */

type Row = Record<string, unknown>;
const str = (r: Row, k: string) => (r[k] == null ? "" : String(r[k]));
const num = (r: Row, k: string) => Number(r[k] ?? 0);

const SORTS = [
  { value: "recent", label: "Recent" },
  { value: "responses", label: "Most responses" },
  { value: "starts", label: "Most starts" },
  { value: "drop_off", label: "Worst drop-off" },
  { value: "size", label: "Longest" },
] as const;

const STATUSES = [
  { value: "", label: "All" },
  { value: "published", label: "Published" },
  { value: "draft", label: "Draft" },
  { value: "closed", label: "Closed" },
] as const;

const PAGE = 50;

export function FormsTable() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const q = params.get("q") ?? "";
  const status = params.get("status") ?? "";
  const sort = params.get("sort") ?? "recent";
  const offset = Number(params.get("offset") ?? 0);
  const [draft, setDraft] = useState(q);

  const setParam = (patch: Record<string, string>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    if (!("offset" in patch)) next.delete("offset");
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  };

  const { data, isPending } = useGetApiAdminForms({
    limit: PAGE,
    offset,
    sort: sort as "recent",
    ...(q ? { q } : {}),
    ...(status ? { status: status as "published" } : {}),
  });
  const body = apiData<{ forms?: Row[]; total?: number }>(data);
  const forms = body?.forms ?? [];
  const total = body?.total ?? 0;

  return (
    <div className="space-y-4">
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
            placeholder="Form title, slug or account…"
            className="pl-8"
            aria-label="Search forms"
          />
        </form>

        <div className="flex flex-wrap items-center gap-1">
          <span className="text-muted-foreground text-caption mr-1">Show</span>
          {STATUSES.map((s) => (
            <Button
              key={s.value || "all"}
              size="sm"
              variant={status === s.value ? "secondary" : "ghost"}
              onClick={() => setParam({ status: s.value })}
            >
              {s.label}
            </Button>
          ))}
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-1">
          <span className="text-muted-foreground text-caption mr-1">Sort</span>
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
      ) : (
        <div className="bg-card shadow-xs rounded-xl">
          <DataTable
            rows={forms}
            hrefFor={(f) => `/admin/accounts/${str(f, "org_id")}`}
            empty="No forms match."
            columns={[
              {
                key: "title",
                header: "Form",
                render: (f) => (
                  <span className="block min-w-0">
                    <span className="block truncate font-medium">{str(f, "title")}</span>
                    <span className="text-muted-foreground block truncate text-xs">{str(f, "org_name")}</span>
                  </span>
                ),
              },
              {
                key: "status",
                header: "Status",
                render: (f) => <Badge className="bg-muted text-muted-foreground">{str(f, "status")}</Badge>,
              },
              { key: "plan", header: "Plan", render: (f) => str(f, "plan") },
              { key: "blocks", header: "Questions", numeric: true, render: (f) => num(f, "blocks") },
              { key: "started", header: "Started", numeric: true, render: (f) => num(f, "started") },
              { key: "completed", header: "Completed", numeric: true, render: (f) => num(f, "completed") },
              {
                key: "drop",
                header: "Drop-off",
                numeric: true,
                render: (f) =>
                  f.drop_off == null ? (
                    // Below ten starts the percentage is arithmetic, not evidence.
                    <span className="text-muted-foreground" title="Too few starts to be meaningful">
                      —
                    </span>
                  ) : (
                    <span className={num(f, "drop_off") >= 70 ? "text-[var(--warning-soft-foreground)]" : undefined}>
                      {Math.round(num(f, "drop_off"))}%
                    </span>
                  ),
              },
              { key: "updated", header: "Updated", muted: true, render: (f) => relativeDay(num(f, "updated_at")) },
            ]}
          />
        </div>
      )}

      {total > PAGE && (
        <div className="flex items-center justify-between gap-3">
          <p className="text-muted-foreground text-caption tabular">
            {offset + 1}&ndash;{Math.min(offset + PAGE, total)} of {total.toLocaleString()}
          </p>
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" disabled={offset === 0} onClick={() => setParam({ offset: String(Math.max(0, offset - PAGE)) })}>
              Previous
            </Button>
            <Button size="sm" variant="secondary" disabled={offset + PAGE >= total} onClick={() => setParam({ offset: String(offset + PAGE) })}>
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
