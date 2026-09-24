"use client";

import { useEffect, useState } from "react";
import { PAYMENT_PROVIDER_LABELS } from "@repo/form-schema";
import { Confetti } from "./confetti";
import type { PaymentReceipt } from "./use-chat";

const paidAtFormat = new Intl.DateTimeFormat(undefined, {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

/** How long the burst gets before its canvas is taken down. */
const CELEBRATION_MS = 2600;

/**
 * The receipt a verified payment leaves in the transcript.
 *
 * Paying is the one moment in a form where somebody wants proof on screen, so
 * this stays: what was paid, when, and the gateway's own payment id to quote
 * if they ever need to. The first time it appears on the device that paid, it
 * celebrates (see `.cf-paid-card` in globals.css); after that, and on a reload
 * or a replayed report, it is just the receipt.
 */
export function PaymentReceiptCard({ receipt }: { receipt: PaymentReceipt }) {
  const [celebrating, setCelebrating] = useState(receipt.fresh);

  useEffect(() => {
    if (!celebrating) return;
    const t = setTimeout(() => setCelebrating(false), CELEBRATION_MS);
    return () => clearTimeout(t);
  }, [celebrating]);

  const via = receipt.provider ? PAYMENT_PROVIDER_LABELS[receipt.provider] : null;
  const note = receipt.simulated ? "Simulated" : receipt.testMode ? "Test payment" : null;

  return (
    <div className="relative mt-2 flex w-full justify-start">
      {celebrating && (
        <Confetti
          colors={["#22c55e", "#16a34a", "#86efac", "#facc15", "#ffffff"]}
          className="pointer-events-none absolute -inset-x-8 -top-24 z-10 h-72 w-[calc(100%+4rem)]"
        />
      )}
      <div
        data-fresh={receipt.fresh ? "true" : "false"}
        role="status"
        className="cf-paid-card w-full max-w-md rounded-2xl border border-[color-mix(in_oklab,var(--success)_45%,transparent)] bg-[var(--success-soft)] p-4 text-[var(--success-soft-foreground)]"
      >
        <div className="flex items-center gap-3">
          <div className="cf-paid-badge relative grid size-11 shrink-0 place-items-center">
            <span className="cf-paid-ring absolute inset-0 rounded-full bg-[var(--success)] opacity-0" aria-hidden />
            <svg viewBox="0 0 26 26" className="relative size-11" aria-hidden>
              <circle
                className="cf-paid-circle"
                cx="13"
                cy="13"
                r="12"
                fill="var(--success)"
                stroke="var(--success)"
                strokeWidth="2"
              />
              <path
                className="cf-paid-tick"
                d="M7.5 13.5l3.6 3.6 7.4-7.6"
                fill="none"
                stroke="var(--success-foreground)"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <div className="cf-paid-rise min-w-0 flex-1">
            <p className="text-sm font-semibold">Payment successful</p>
            {receipt.display && (
              <p className="text-2xl font-semibold tracking-tight tabular-nums">
                {receipt.display}
              </p>
            )}
          </div>
          {note && (
            <span className="shrink-0 rounded-full bg-[color-mix(in_oklab,var(--success)_18%,transparent)] px-2 py-0.5 text-[11px] font-medium">
              {note}
            </span>
          )}
        </div>

        <dl className="cf-paid-rise mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 border-t border-[color-mix(in_oklab,var(--success)_25%,transparent)] pt-3 text-xs">
          <dt className="opacity-70">Paid on</dt>
          <dd>{paidAtFormat.format(receipt.paidAt)}</dd>
          {via && (
            <>
              <dt className="opacity-70">Paid via</dt>
              <dd>{via}</dd>
            </>
          )}
          {receipt.paymentId && (
            <>
              <dt className="opacity-70">Payment ID</dt>
              <dd className="truncate font-mono select-all">{receipt.paymentId}</dd>
            </>
          )}
        </dl>
      </div>
    </div>
  );
}
