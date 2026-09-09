"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowUpRight } from "lucide-react";
import { getGetApiAdminMeQueryKey, useGetApiAdminMe } from "@/lib/api/admin/admin";
import { apiData } from "@/lib/api/payload";
import { ApiError } from "@/lib/api/mutator";
import { ADMIN_NAV } from "./admin-nav";
import { Spinner } from "@/components/ui/spinner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * The console's frame, and its front door.
 *
 * The API is the real boundary — every `/api/admin` route runs
 * `requirePlatformAdmin` and answers 404 to anyone else, so nothing here is what
 * keeps a customer out. What this does is make the failure *look* like the API's
 * answer: an unauthorised visitor sees the same "not found" they would get for
 * any URL that does not exist, rather than a sign-in prompt or a locked panel
 * that confirms there is something here worth finding.
 *
 * Not wrapped in `DashboardShell`. Sharing the app header would put the
 * organization switcher, the plan badge and the usage pill above a page that is
 * about every organization at once — three controls that mean nothing here and
 * one (the switcher) that would actively mislead.
 */
/**
 * The API said "there is nothing here", as opposed to the request not arriving.
 *
 * Widened through `unknown` because the generated client types this route's
 * error as `void` — the 404 declares no response body — so the runtime value
 * (an `ApiError`) and the compile-time type do not meet.
 */
function isNotFound(err: unknown): boolean {
  return err instanceof ApiError && err.status === 404;
}

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { data, isPending, isError, error, refetch } = useGetApiAdminMe({
    query: {
      queryKey: getGetApiAdminMeQueryKey(),
      /**
       * Retry everything except the answer that means "you are not an admin".
       *
       * `retry: false` was wrong here in a way that only shows up in practice: a
       * single blip — a deploy, a cold start, a dropped connection — put the
       * query into a permanent error state, and `staleTime` then served that
       * failure for five minutes. The console locked its own admin out with a
       * "page not found" and no way to retry but a hard reload.
       *
       * A 404 is a real answer and must not be retried. Anything else is a
       * transport problem and should be.
       */
      retry: (count, err) => !isNotFound(err) && count < 2,
      staleTime: 5 * 60 * 1000,
    },
  });

  if (isPending) {
    return (
      <div className="grid min-h-dvh place-items-center">
        <Spinner />
      </div>
    );
  }

  if (isError || !data) {
    /**
     * Two different failures, told apart.
     *
     * A 404 is the API saying "there is nothing here for you", and it must look
     * exactly like any missing page — no hint that a console exists. Anything
     * else is our side failing, and showing an admin a "not found" for a dropped
     * connection sends them to check their access when they should press retry.
     */
    const unreachable = !isNotFound(error);
    return (
      <div className="grid min-h-dvh place-items-center px-6">
        <div className="text-center">
          <h1 className="text-h1">{unreachable ? "Can’t reach the API" : "404"}</h1>
          <p className="text-muted-foreground mt-2 text-sm">
            {unreachable ? "The request did not get through." : "This page could not be found."}
          </p>
          {unreachable && (
            <Button className="mt-4" variant="secondary" onClick={() => void refetch()}>
              Try again
            </Button>
          )}
        </div>
      </div>
    );
  }

  // `customFetch` returns the bare body while orval types it as `{ data, status }`;
  // `apiData` is the one place that discrepancy is laundered. See lib/api/payload.ts.
  const email = apiData<{ email?: string }>(data)?.email;

  return (
    <div className="min-h-dvh">
      <header className="bg-card sticky top-0 z-20 border-b">
        <div className="mx-auto flex h-14 w-full max-w-[110rem] items-center gap-4 px-4 sm:px-6">
          <span className="flex shrink-0 items-center gap-2">
            <span className="bg-foreground text-background grid size-6 place-items-center rounded-md text-[0.625rem] font-semibold">
              cf
            </span>
            <span className="text-sm font-semibold">Platform</span>
          </span>

          <nav className="flex min-w-0 items-center gap-0.5" aria-label="Platform console">
            {ADMIN_NAV.map((item) => {
              // `/admin` must not light up while you are on `/admin/accounts`,
              // so the root is matched exactly and the rest by prefix.
              const active = item.href === "/admin" ? pathname === "/admin" : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "rounded-lg px-2.5 py-1.5 text-sm transition-colors duration-[var(--duration-micro)]",
                    active ? "bg-muted text-foreground font-medium" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="text-muted-foreground text-caption ml-auto flex shrink-0 items-center gap-3">
            <span className="hidden truncate sm:inline">{email}</span>
            <Link
              href="/dashboard"
              className="hover:text-foreground inline-flex items-center gap-1 transition-colors duration-[var(--duration-micro)]"
            >
              App
              <ArrowUpRight className="size-3.5" strokeWidth={2} aria-hidden />
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[110rem] px-4 py-6 sm:px-6">{children}</main>
    </div>
  );
}
