"use client";

import { useEffect, useRef } from "react";
import type { Block } from "@repo/form-schema";
import { usePaymentAccounts } from "@/components/integrations/payment-accounts";
import { useBuilderStore } from "@/stores/builder-store";
import { currencyFor, defaultAccount } from "./inspector/type-fields";

/**
 * Puts a form's payment questions on the organization's gateway account without the author
 * having to know there is a step for it.
 *
 * Two moments:
 *
 *   - A verified-checkout question with no account gets the default one as soon as there is
 *     one. The inspector does the same for the question it has open; this covers every other
 *     question, and an account connected from the Integrate tab while no inspector is mounted.
 *   - When an account is connected during this visit, a payment question still sitting on a
 *     link nobody filled in moves to verified checkout. That is the author who added the
 *     question first and connected Stripe second, and who has no reason to come back and
 *     switch the method by hand. Only at that moment, and only where no link was typed: an
 *     author who chose the manual method keeps it.
 *
 * Mounted once in the builder shell, and asks for the accounts only when the form has a
 * payment question at all.
 */
export function useDefaultPaymentAccount({ enabled }: { enabled: boolean }): void {
  const doc = useBuilderStore((s) => s.doc);
  const updateBlock = useBuilderStore((s) => s.updateBlock);
  const payments = (doc?.blocks ?? []).filter((b): b is Extract<Block, { type: "payment" }> => b.type === "payment");
  const { data, isPending } = usePaymentAccounts({ enabled: enabled && payments.length > 0 });

  const known = !isPending && data !== undefined && data.unavailable !== true && data.enabled;
  const account = known ? defaultAccount(data.accounts) : undefined;
  const activeCount = known ? data.accounts.filter((a) => a.status === "active").length : null;
  /** How many accounts there were when last looked at; null until the list has been read once. */
  const seenCount = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled || activeCount === null) return;
    const justConnected = seenCount.current !== null && activeCount > seenCount.current;
    seenCount.current = activeCount;
    if (!account) return;

    for (const block of payments) {
      const unfilledLink = block.method === "link" && !block.url?.trim();
      const adopt = justConnected && unfilledLink;
      if (!adopt && !(block.method === "gateway" && !block.paymentAccountId)) continue;
      const currency = currencyFor(account, block.currency);
      updateBlock(block.ref, {
        ...(adopt ? { method: "gateway" } : {}),
        paymentAccountId: account.id,
        ...(currency ? { currency } : {}),
      } as Partial<Block>);
    }
    // The blocks are read fresh each run; what decides a run is the account and what needs one.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, account?.id, activeCount, payments.map((b) => `${b.ref}:${b.method}:${b.paymentAccountId ?? ""}`).join("|")]);
}
