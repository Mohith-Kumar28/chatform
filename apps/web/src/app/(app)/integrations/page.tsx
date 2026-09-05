"use client";

import { Suspense, useMemo } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Plug, Sparkles } from "lucide-react";
import { useGetApiForms, getGetApiFormsQueryKey } from "@/lib/api/dashboard/dashboard";
import { apiData } from "@/lib/api/payload";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { IntegrationsWorkspace } from "@/components/integrations/integrations-workspace";
import { useClientValue } from "@/hooks/use-client-value";
import type { FormRow } from "@/components/forms/form-card";

/**
 * Integrations, at the top level.
 *
 * There was nowhere to answer "how do I put this on my site" without first
 * remembering which form it was and opening the builder — while the top nav
 * spent a slot on API keys, which almost nobody mints and which belongs with
 * the account, not beside Forms and Templates. They have swapped places.
 *
 * Everything is per-form because an embed snippet and a webhook are per-form,
 * so the form picker is the first control on the page rather than a detail
 * inside each card.
 */
export default function IntegrationsPage() {
  return (
    // `useSearchParams` in a client component needs a boundary, or Next opts the
    // whole route out of prerendering.
    <Suspense fallback={<PageSkeleton />}>
      <IntegrationsContent />
    </Suspense>
  );
}

function IntegrationsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data, isLoading } = useGetApiForms({ query: { queryKey: getGetApiFormsQueryKey() } });
  const forms = useMemo(() => apiData<FormRow[]>(data) ?? [], [data]);

  /**
   * Live forms first: a draft has nothing to embed yet, and the person who
   * lands here almost always wants the one that is already taking responses.
   */
  const ordered = useMemo(
    () =>
      [...forms].sort((a, b) => {
        const live = Number(b.status === "published") - Number(a.status === "published");
        return live !== 0 ? live : b.updatedAt - a.updatedAt;
      }),
    [forms],
  );

  /**
   * The query string is the selection — there is no second copy in state.
   *
   * `?form=…` has to survive a reload and be worth sending to a colleague
   * anyway, so mirroring it into `useState` would only buy an effect that
   * reconciles the two whenever the list loads or the form is deleted.
   */
  const requested = searchParams.get("form");
  const selected = requested && ordered.some((f) => f.id === requested)
    ? requested
    : (ordered[0]?.id ?? null);

  const form = ordered.find((f) => f.id === selected) ?? null;
  const appOrigin = useClientValue(() => window.location.origin, "");

  const choose = (id: string) => router.replace(`/integrations?form=${id}`, { scroll: false });

  if (isLoading) return <PageSkeleton />;

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 px-4 py-8 sm:px-6">
      <PageHeader
        title="Integrations"
        description="Put a form on your site, and decide where the answers go."
        actions={
          ordered.length > 0 ? (
            <Select value={selected ?? undefined} onValueChange={choose}>
              <SelectTrigger className="w-[min(18rem,60vw)]">
                <SelectValue placeholder="Pick a form" />
              </SelectTrigger>
              <SelectContent>
                {ordered.map((f) => (
                  <SelectItem key={f.id} value={f.id}>
                    <span className="flex items-center gap-2">
                      <span
                        className={
                          f.status === "published"
                            ? "size-1.5 rounded-full bg-[var(--success)]"
                            : "bg-muted-foreground/40 size-1.5 rounded-full"
                        }
                      />
                      {f.title}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : undefined
        }
      />

      {form ? (
        <IntegrationsWorkspace
          // Remounts on a form change, so no panel state survives from the
          // last form into this one's sheet.
          key={form.id}
          formId={form.id}
          slug={form.slug}
          formTitle={form.title}
          status={form.status}
          appOrigin={appOrigin}
        />
      ) : (
        <EmptyState
          icon={Plug}
          title="Nothing to connect yet"
          description="Integrations attach to a form — its embed code, its webhooks, its spreadsheet. Make one first."
          action={
            <Button shape="pill" asChild>
              <Link href="/dashboard?new=1">
                <Sparkles className="size-3.5" />
                Create a form
              </Link>
            </Button>
          }
        />
      )}
    </div>
  );
}

function PageSkeleton() {
  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 px-4 py-8 sm:px-6">
      <div className="space-y-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-80" />
      </div>
      <Skeleton className="h-80 w-full rounded-2xl" />
    </div>
  );
}
