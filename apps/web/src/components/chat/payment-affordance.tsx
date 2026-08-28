"use client";

import { useMemo, useState } from "react";
import { buildUpiUri, formatAmount, paymentReference, type PublicBlock } from "@repo/form-schema";
import { Chip } from "./composers/primitives";
import { qrSvg } from "@/lib/qr";

/**
 * Paying happens somewhere we cannot see — the builder's own checkout page, or
 * the respondent's UPI app. So this control does two things and no more: get
 * them to the right place, and record that they say they paid.
 *
 * It deliberately does not claim the payment succeeded. The answer carries
 * `verified: false` and a reference code the builder can match against their
 * own statement, which is the honest shape of an out-of-band payment.
 */
export function PaymentAffordance({
  block,
  disabled,
  onStructured,
  onSkip,
}: {
  block: PublicBlock;
  disabled?: boolean;
  onStructured: (value: unknown, display: string) => void;
  onSkip: () => void;
}) {
  // Generated once per mount, not per render: the code shown in the QR must be
  // the same one recorded on the answer, or reconciliation matches nothing.
  const [reference] = useState(paymentReference);
  const [opened, setOpened] = useState(false);

  const currency = block.currency ?? "INR";
  const amount = typeof block.amount === "number" && block.amount > 0 ? block.amount : undefined;
  const priceLabel = amount !== undefined ? formatAmount(amount, currency) : null;

  // Rebuilt here rather than using the publicized `upiUri` so the note carries
  // this respondent's reference.
  const upiUri = useMemo(() => {
    if (block.paymentMethod !== "upi" || !block.upiId) return null;
    return buildUpiUri({
      upiId: block.upiId,
      payeeName: block.payeeName,
      amount,
      note: reference,
    });
  }, [block.paymentMethod, block.upiId, block.payeeName, amount, reference]);

  const qrDataUrl = useMemo(() => {
    if (!upiUri) return null;
    return `data:image/svg+xml;utf8,${encodeURIComponent(qrSvg(upiUri))}`;
  }, [upiUri]);

  function confirm() {
    onStructured(
      {
        status: "paid",
        method: block.paymentMethod ?? "link",
        verified: false,
        reference,
        amount,
      },
      priceLabel ? `Paid ${priceLabel}` : "Paid",
    );
  }

  const target = block.paymentMethod === "upi" ? upiUri : block.url;

  // A block published without a destination is caught by lint, but a draft
  // being previewed can still reach here.
  if (!target) {
    return (
      <div className="rounded-2xl border border-dashed border-[var(--cf-chip-border)] px-4 py-4 text-center text-sm">
        <p>This payment step isn&apos;t set up yet.</p>
        <button type="button" onClick={onSkip} className="mt-1.5 text-xs underline opacity-60">
          Continue without paying
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {block.paymentMethod === "upi" && qrDataUrl ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-[var(--cf-chip-border)] p-4">
          {priceLabel ? <p className="text-lg font-semibold">{priceLabel}</p> : null}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={qrDataUrl}
            alt={`UPI QR code to pay ${block.upiId}`}
            className="size-44 rounded-lg bg-white p-2"
          />
          <p className="text-center text-xs opacity-70">
            Scan with any UPI app, or tap below on your phone.
          </p>
          <p className="font-mono text-xs opacity-70">{block.upiId}</p>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <a
          href={target}
          // A `upi://` URI has to open the payer's app on the same device;
          // forcing a new tab there just leaves a blank one behind.
          {...(block.paymentMethod === "upi" ? {} : { target: "_blank", rel: "noreferrer" })}
          onClick={() => setOpened(true)}
          aria-disabled={disabled}
          className="flex h-10 items-center rounded-full bg-[var(--cf-accent)] px-5 text-sm font-medium text-[var(--cf-accent-text)]"
        >
          {block.paymentMethod === "upi"
            ? "Pay with a UPI app"
            : priceLabel
              ? `Pay ${priceLabel}`
              : "Open the payment page"}
        </a>

        <Chip disabled={disabled} onClick={confirm}>
          {opened ? "I’ve paid" : "I’ve already paid"}
        </Chip>

        {block.required ? null : (
          <button type="button" onClick={onSkip} className="text-xs underline opacity-60">
            Skip
          </button>
        )}
      </div>

      <p className="text-xs opacity-60">
        Use reference <span className="font-mono font-medium">{reference}</span> in the payment note
        so it can be matched to your response.
      </p>
    </div>
  );
}
