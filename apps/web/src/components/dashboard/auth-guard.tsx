"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useSession } from "@/lib/auth/auth-client";
import { Button } from "@/components/ui/button";

/**
 * The single session gate. The dashboard shell and the builder shell both use
 * this — they previously duplicated the same effect.
 *
 * Redirects carry a `next` param so a signed-out user landing on a deep link
 * returns to it after signing in instead of being dumped on the dashboard.
 */
export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { data: session, isPending, error, refetch } = useSession();
  const router = useRouter();
  const pathname = usePathname();

  /**
   * "No session" and "could not ask" are not the same answer, and this used to
   * treat them as one. `useSession` reports a failed `/get-session` as
   * `data: null` plus an `error`, so one dropped request — a flaky network, a
   * cold API, a CORS hiccup — bounced a perfectly valid session to `/signin`
   * and looked exactly like being logged out. Only a 401 is the server actually
   * saying the session is gone; anything else is a transport failure and gets a
   * retry instead of a redirect.
   */
  const transportFailure =
    !session && error != null && (error as { status?: number }).status !== 401;

  useEffect(() => {
    if (isPending || session || transportFailure) return;
    const next = encodeURIComponent(pathname);
    router.replace(`/signin?next=${next}`);
  }, [isPending, session, transportFailure, router, pathname]);

  if (isPending) {
    return (
      <div className="flex min-h-svh flex-col">
        <div className="bg-card flex h-14 items-center gap-3 px-6">
          <div className="shimmer size-7 rounded-lg" />
          <div className="shimmer h-4 w-24 rounded" />
          <div className="mx-auto flex gap-2">
            <div className="shimmer h-7 w-20 rounded-full" />
            <div className="shimmer h-7 w-24 rounded-full" />
          </div>
          <div className="shimmer size-8 rounded-full" />
        </div>
        <div className="mx-auto w-full max-w-7xl px-6 py-8">
          <div className="shimmer mb-6 h-8 w-48 rounded" />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="shimmer h-44 rounded-xl" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (transportFailure) {
    return (
      <div className="flex min-h-svh flex-col items-center justify-center gap-4 px-6 text-center">
        <div>
          <p className="text-body-lg font-medium">Could not reach chatform</p>
          <p className="text-muted-foreground text-body mt-1">
            You are still signed in — we just could not load your session.
          </p>
        </div>
        <Button shape="pill" onClick={() => void refetch()}>
          Try again
        </Button>
      </div>
    );
  }

  if (!session) return null;
  return <>{children}</>;
}
