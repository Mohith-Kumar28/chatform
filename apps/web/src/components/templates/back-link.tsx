"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";

/**
 * Back to wherever the visitor came from: the hub or search they were in, if
 * they arrived from this site; the gallery otherwise (a search result, a
 * shared link), rather than out of the site.
 */
export function BackLink() {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => {
        const fromHere = document.referrer && new URL(document.referrer).origin === window.location.origin;
        if (fromHere && window.history.length > 1) router.back();
        else router.push("/form-templates");
      }}
      className="text-foreground/75 hover:text-foreground border-border/80 hover:border-foreground/30 bg-card inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium shadow-xs transition-colors duration-[var(--duration-micro)]"
    >
      <ArrowLeft className="size-4" />
      Back
    </button>
  );
}
