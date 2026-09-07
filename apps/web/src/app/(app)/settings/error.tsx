"use client";

import { TriangleAlert } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";

/**
 * One section failing does not take the area down.
 *
 * Next renders this inside `layout.tsx`, so the rail survives — you can still
 * reach the other five sections, which is most of what someone wants when one
 * of them breaks.
 */
export default function SettingsError({ reset }: { error: Error; reset: () => void }) {
  return (
    <EmptyState
      icon={TriangleAlert}
      title="This section didn't load"
      description="Something went wrong fetching it. The rest of your settings are still available."
      action={
        <Button variant="outline" onClick={reset}>
          Try again
        </Button>
      }
    />
  );
}
