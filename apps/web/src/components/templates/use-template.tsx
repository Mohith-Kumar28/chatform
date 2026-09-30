"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { usePostApiTemplatesBySlugUse } from "@/lib/api/dashboard/dashboard";
import { apiData } from "@/lib/api/payload";
import { invalidateForms } from "@/lib/query-keys";
import { Button } from "@/components/ui/button";

/**
 * Copies a template into the current workspace and opens the copy in the
 * builder. Runs once, on arrival: a strict-mode double mount or a refresh of
 * the builder must not leave two copies behind.
 */
export function UseTemplate({ slug }: { slug: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const started = useRef(false);

  const use = usePostApiTemplatesBySlugUse<Error>({
    mutation: {
      onSuccess: async (created) => {
        await invalidateForms(queryClient);
        router.replace(`/forms/${apiData<{ id: string }>(created).id}/build`);
      },
    },
  });

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    use.mutate({ slug });
  }, [slug, use]);

  if (use.isError) {
    return (
      <div className="mx-auto flex min-h-[60svh] max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="font-display text-foreground text-xl font-semibold">We couldn&apos;t start from this template</p>
        <p className="text-foreground/75">{use.error.message}</p>
        <div className="flex gap-2">
          <Button onClick={() => use.mutate({ slug })}>Try again</Button>
          <Button asChild variant="outline">
            <Link href="/templates">Browse templates</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-[60svh] flex-col items-center justify-center gap-3 px-6 text-center" aria-live="polite">
      <Loader2 className="text-primary size-6 animate-spin" />
      <p className="text-foreground font-medium">Setting up your copy of this template…</p>
    </div>
  );
}
