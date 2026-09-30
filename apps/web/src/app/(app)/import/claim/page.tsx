"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { FileInput, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { claimImport, handOffReport, importErrorOf } from "@/components/import/import-client";
import { invalidateForms } from "@/lib/query-keys";

/**
 * Where "Use this form" lands after sign-up.
 *
 * Inside the signed-in shell on purpose: its auth guard is what sends a
 * signed-out visitor to sign in with this page as `next`, so the token in the
 * address survives account creation without anything else remembering it.
 * The claim runs once, then the builder replaces this page in history.
 */
function Claim() {
  const params = useSearchParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const token = params.get("t");
  const [failed, setFailed] = useState<string | null>(null);
  const error = token ? failed : "This link is missing its import. Paste your form's link again to convert it.";
  const started = useRef(false);

  useEffect(() => {
    if (started.current || !token) return;
    started.current = true;
    claimImport(token)
      .then(async ({ formId, report }) => {
        handOffReport(formId, report);
        await invalidateForms(queryClient);
        router.replace(`/forms/${formId}/build`);
      })
      .catch((err) => setFailed(importErrorOf(err).message));
  }, [token, router, queryClient]);

  if (error) {
    return (
      <EmptyState
        icon={FileInput}
        title="Couldn't add that form"
        description={error}
        action={
          <Button asChild shape="pill">
            <Link href="/dashboard?new=1">New form</Link>
          </Button>
        }
      />
    );
  }
  return (
    <div className="text-muted-foreground flex items-center justify-center gap-2 py-24 text-sm">
      <Loader2 className="size-4 animate-spin" />
      Adding your form
    </div>
  );
}

export default function ImportClaimPage() {
  return (
    <Suspense>
      <Claim />
    </Suspense>
  );
}
