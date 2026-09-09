"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { VenetianMask } from "lucide-react";
import { postApiAdminImpersonate } from "@/lib/api/admin/admin";
import { beginImpersonation } from "@/lib/impersonation";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

/**
 * The door the second tab comes through.
 *
 * The console opens this in a new tab and this page asks for the token itself,
 * so the console's own tab never holds one — see `openImpersonationTab`. The
 * admin's session cookie is shared across tabs, which is what makes that
 * possible; the API still re-checks that the caller is an allowlisted admin
 * before it signs anything.
 *
 * Everything it needs is in the query string because none of it is secret: a
 * user id, an organization id, and the reason the admin typed, which is on its
 * way to the customer's audit log anyway.
 */
export function ActClient() {
  const params = useSearchParams();
  const userId = params.get("user") ?? "";
  const orgId = params.get("org") ?? undefined;
  const reason = params.get("reason") ?? "";

  /**
   * A link with no user in it is wrong at render time, not at effect time, so it
   * is derived rather than pushed into state — setting state from an effect body
   * is a cascading render, and the lint rule that says so is right.
   */
  const [failure, setFailure] = useState<string | null>(null);
  const error = userId ? failure : "This link is missing the person to act as.";

  /**
   * One token, not two.
   *
   * Effects run twice in development, and each run here is a signed token and a
   * row in the customer's audit log. The guard is a ref rather than state
   * because it must be set before the second run reads it, and state is not.
   */
  const started = useRef(false);

  useEffect(() => {
    if (!userId || started.current) return;
    started.current = true;
    void (async () => {
      try {
        const res = (await postApiAdminImpersonate({ userId, orgId, reason })) as unknown as {
          token: string;
          expiresAt: number;
          user: { id: string; name: string; email: string };
        };
        beginImpersonation(res);
      } catch (err) {
        setFailure(err instanceof Error ? err.message : "Could not start the session.");
      }
    })();
  }, [userId, orgId, reason]);

  return (
    <div className="grid min-h-[60vh] place-items-center px-6">
      <div className="max-w-sm text-center">
        {error ? (
          <>
            <h1 className="text-h2">Could not open their account</h1>
            <p className="text-muted-foreground mt-2 text-sm">{error}</p>
            <Button className="mt-4" variant="secondary" onClick={() => window.close()}>
              Close this tab
            </Button>
          </>
        ) : (
          <>
            <VenetianMask className="text-muted-foreground mx-auto size-6" strokeWidth={1.75} aria-hidden />
            <p className="mt-3 text-sm font-medium">Opening their account…</p>
            <p className="text-muted-foreground mt-1 text-xs">
              This tab becomes the customer. Your console stays open behind it.
            </p>
            <Spinner className="mx-auto mt-4" />
          </>
        )}
      </div>
    </div>
  );
}
