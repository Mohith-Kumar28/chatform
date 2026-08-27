"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { useEntitlements } from "@/hooks/use-entitlements";
import { useUpgrade } from "@/components/billing/gate";

/**
 * The first time a form has both a response and an unfinished one, say so — once.
 *
 * This is the earliest honest moment the gate exists at all: they have data, and there is
 * genuinely something they cannot see. Before that there is nothing to sell, which is the
 * rule the whole choreography rests on.
 *
 * Fires at most once per form, ever. A recurring nag would train people to dismiss the one
 * notification in the product that is actually informative.
 */
export function FirstPartialToast({
  formId,
  completed,
  partials,
}: {
  formId: string;
  completed: number;
  partials: number;
}) {
  const ent = useEntitlements();
  const upgrade = useUpgrade();
  const fired = useRef(false);

  const entitled = ent.can("partial_responses");
  const ready = !ent.isLoading && !entitled && completed > 0 && partials > 0;
  const key = `cf.seen.first-partial.${formId}`;

  useEffect(() => {
    if (!ready || fired.current) return;

    // Per-form and per-browser. localStorage throws in some privacy modes, so a failure to
    // read means "show it" and a failure to write means it may show once more — both are
    // better than the toast never appearing or appearing on every visit.
    try {
      if (localStorage.getItem(key)) return;
    } catch {
      /* storage unavailable — fall through and show it */
    }
    fired.current = true;
    try {
      localStorage.setItem(key, "1");
    } catch {
      /* nothing to do; at worst it shows again next visit */
    }

    toast(
      partials === 1
        ? "1 more person started and didn't finish"
        : `${partials} more people started and didn't finish`,
      {
        description: "You can see what they told you before they left.",
        duration: 12_000,
        action: {
          label: "Take a look",
          onClick: () => upgrade("partial_responses", { count: partials, surface: "first-partial-toast" }),
        },
      },
    );
  }, [ready, key, partials, upgrade]);

  return null;
}
