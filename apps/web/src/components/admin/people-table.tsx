"use client";

import { useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { useGetApiAdminUsers } from "@/lib/api/admin/admin";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { apiData } from "@/lib/api/payload";
import { DataTable } from "./data-table";
import { relativeDay } from "./format";

/**
 * People, as opposed to accounts.
 *
 * The accounts list is the right unit nearly always. This one exists for the
 * case it cannot serve: a support request arrives from an email address, and the
 * question is simply who is this, when did they last sign in, and which
 * organizations can they see. Searching for that in a list of organizations
 * means knowing the answer first.
 */

type Row = Record<string, unknown>;
const str = (r: Row, k: string) => (r[k] == null ? "" : String(r[k]));
const num = (r: Row, k: string) => Number(r[k] ?? 0);

const SORTS = [
  { value: "created", label: "Newest" },
  { value: "last_seen", label: "Last seen" },
  { value: "orgs", label: "Most accounts" },
] as const;

const PAGE = 50;

export function PeopleTable() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const q = params.get("q") ?? "";
  const sort = params.get("sort") ?? "created";
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

  const { data, isPending } = useGetApiAdminUsers({
    limit: PAGE,
    offset,
    sort: sort as "created",
    ...(q ? { q } : {}),
  });
  const body = apiData<{ users?: Row[]; total?: number }>(data);
  const users = body?.users ?? [];
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
            placeholder="Email or name…"
            className="pl-8"
            aria-label="Search people"
          />
        </form>
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
      ) : (
        <div className="bg-card shadow-xs rounded-xl">
          <DataTable
            rows={users}
            empty="Nobody matches that search."
            columns={[
              {
                key: "person",
                header: "Person",
                render: (u) => (
                  <span className="block min-w-0">
                    <span className="block truncate font-medium">{str(u, "name") || str(u, "email")}</span>
                    <span className="text-muted-foreground block truncate text-xs">{str(u, "email")}</span>
                  </span>
                ),
              },
              {
                key: "verified",
                header: "Email",
                render: (u) =>
                  num(u, "email_verified") === 1 ? (
                    <Badge className="bg-[var(--success-soft)] text-[var(--success)]">verified</Badge>
                  ) : (
                    <Badge className="bg-[var(--warning-soft)] text-[var(--warning-soft-foreground)]">unverified</Badge>
                  ),
              },
              {
                key: "providers",
                header: "Signs in with",
                render: (u) => (
                  <span className="text-muted-foreground text-xs">
                    {str(u, "providers").replaceAll("credential", "password").replaceAll(",", ", ") || "—"}
                  </span>
                ),
              },
              {
                key: "orgs",
                header: "Accounts",
                numeric: true,
                render: (u) => (
                  <span title={str(u, "org_names")}>{num(u, "orgs")}</span>
                ),
              },
              { key: "seen", header: "Last seen", muted: true, render: (u) => relativeDay(num(u, "last_seen_at")) },
              { key: "joined", header: "Joined", muted: true, render: (u) => relativeDay(num(u, "created_at")) },
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
