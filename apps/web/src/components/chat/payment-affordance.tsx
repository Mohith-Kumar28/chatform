"use client";

import { safeHref } from "@repo/guard";
import { useMemo, useState } from "react";
import { CircleAlert, Loader2, Lock } from "lucide-react";
import {
  buildUpiUri,
  formatAmount,
  PAYMENT_PROVIDER_LABELS,
  paymentReference,
  type PublicBlock,
} from "@repo/form-schema";
import { PhoneInput } from "./composers/phone";
import { Chip } from "./composers/primitives";
import type { PaymentState } from "./use-chat";
import { qrSvg } from "@/lib/qr";

/**
 * What the gateway card can ask the session to do. Absent where there is no
 * session: the builder's question preview draws the idle card and nothing more.
 */
export interface GatewayPaymentActions {
  /** `phone` only in answer to a `phone` phase: the number the gateway's receipt goes to. */
  start: (ref: string, opts?: { phone?: string }) => void;
  reopen: () => void;
  confirm: () => Promise<string | null>;
  cancel: () => void;
  simulate: () => void;
}

/**
 * The payment question, in whichever of its two very different shapes the
 * author chose.
 *
 * One entry point, so `QuestionAffordance`, the live chat and the builder's
 * preview all branch in the same place and cannot disagree about which card a
 * block gets.
 */
export function PaymentAffordance({
  block,
  disabled,
  payment,
  paymentActions,
  onStructured,
  onSkip,
}: {
  block: PublicBlock;
  disabled?: boolean;
  payment?: PaymentState | null;
  paymentActions?: GatewayPaymentActions;
  onStructured: (value: unknown, display: string) => void;
  onSkip: () => void;
}) {
  if (block.paymentMethod === "gateway") {
    return (
      <GatewayPaymentAffordance
        block={block}
        disabled={disabled}
        payment={payment?.ref === block.ref ? payment : null}
        actions={paymentActions}
        onSkip={onSkip}
      />
    );
  }
  return <ManualPaymentAffordance block={block} disabled={disabled} onStructured={onStructured} onSkip={onSkip} />;
}

/**
 * Checkout on the form owner's own gateway account, verified by the server.
 *
 * Unlike the manual card below, nothing here can answer the question. There is
 * no "I've paid". The button asks the server for a checkout, the gateway takes
 * the money, and the answer arrives on the stream once the server has asked
 * the gateway itself (`payment_settled`). So the card's whole job is to show
 * which of four places the respondent is in:
 *
 *   idle      Pay, and who is taking the money.
 *   starting  the checkout is being created.
 *   awaiting  checkout exists and we are waiting on the gateway's word, with
 *             a way to reopen it and a way to ask again.
 *   failed    what went wrong, and Try again.
 *   phone     the gateway needs a number for the receipt that neither the
 *             sign-in nor an earlier answer gave (Cashfree after Google).
 *
 * A sign-in the payment needs first is not a state here. The server raises the
 * sign-in card, which already replaces this row.
 */
export function GatewayPaymentAffordance({
  block,
  disabled,
  payment,
  actions,
  onSkip,
}: {
  block: PublicBlock;
  disabled?: boolean;
  payment: PaymentState | null;
  actions?: GatewayPaymentActions;
  onSkip: () => void;
}) {
  const [checking, setChecking] = useState(false);
  /** E.164 from the phone field, for the `phone` phase. */
  const [phone, setPhone] = useState("");
  /** What the last "Check payment" found, until the stream says otherwise. */
  const [checked, setChecked] = useState<string | null>(null);

  const currency = block.currency ?? "INR";
  const fixed = typeof block.amount === "number" && block.amount > 0 ? block.amount : undefined;
  // The server's figure once there is one: a variable amount is only known
  // after it has been worked out from the respondent's answers.
  const price = payment?.display ?? (fixed !== undefined ? formatAmount(fixed, currency) : null);
  const provider = payment?.provider ?? block.paymentProvider ?? null;
  const secureLine = provider ? `Secure checkout by ${PAYMENT_PROVIDER_LABELS[provider]}` : "Secure checkout";
  const phase = payment?.phase ?? "idle";
  const canAct = Boolean(actions) && !disabled;
  const skip = block.required ? null : (
    <button type="button" onClick={onSkip} disabled={disabled} className="text-xs underline opacity-60 hover:opacity-100">
      Skip
    </button>
  );
  // The amount is the card's headline, so the button does not repeat it.
  const payLabel = "Pay";

  async function check() {
    if (!actions) return;
    setChecking(true);
    setChecked(null);
    const status = await actions.confirm();
    setChecking(false);
    // "paid" needs no line: the card is about to go. Anything else is said
    // plainly, so the button does not look like it did nothing.
    setChecked(status === "paid" ? null : "Not confirmed yet. If you've just paid, give it a moment.");
  }

  if (phase === "phone") {
    return (
      <PaymentCard price={price} breakdown={block.amountBreakdown}>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (phone && canAct) actions?.start(block.ref, { phone });
          }}
        >
          <p className="text-sm">{payment?.message ?? "What number should the payment receipt go to?"}</p>
          <PhoneInput value={phone} onChange={setPhone} variant="field" autoFocus name="payment-phone" />
          <PayButton type="submit" disabled={!canAct || !phone}>
            {payLabel}
          </PayButton>
          {payment?.preview ? (
            <div className="text-center">
              <button
                type="button"
                onClick={() => actions?.simulate()}
                disabled={!canAct}
                className="text-xs underline opacity-60 hover:opacity-100"
              >
                Simulate instead
              </button>
            </div>
          ) : null}
        </form>
        {payment?.preview ? null : <CardFooter secureLine={secureLine} skip={skip} />}
      </PaymentCard>
    );
  }

  if (phase === "awaiting" && payment?.preview) {
    return (
      <PaymentCard price={price} breakdown={block.amountBreakdown} note="Preview · no real payment is taken">
        <PayButton disabled={!canAct} onClick={() => actions?.simulate()}>
          Simulate payment
        </PayButton>
        <div className="text-center">
          <button
            type="button"
            onClick={() => actions?.cancel()}
            disabled={!canAct}
            className="text-xs underline opacity-60 hover:opacity-100"
          >
            Cancel
          </button>
        </div>
      </PaymentCard>
    );
  }

  /*
   * The checkout was closed, gave up, or is not open after a reload. Nothing is
   * pending on our side, so this is the Pay card again with one line saying
   * what happened. A payment that did go through still settles on the stream
   * and takes the card away, whatever it is showing.
   */
  if (phase === "awaiting" && payment?.interrupted && !payment.blocked) {
    return (
      <PaymentCard price={price} breakdown={block.amountBreakdown}>
        <div className="flex gap-2 rounded-xl bg-[var(--cf-bg)] px-3 py-2.5 text-sm">
          <CircleAlert className="mt-0.5 size-4 shrink-0 opacity-60" aria-hidden />
          <div className="min-w-0 space-y-0.5">
            <p className="font-medium">Payment not completed</p>
            <p className="text-xs opacity-70">
              The checkout closed before the payment went through. If you did pay, this updates on its own.
            </p>
          </div>
        </div>
        <PayButton disabled={!canAct} onClick={() => actions?.reopen()}>
          {payLabel}
        </PayButton>
        <div className="flex items-center justify-center gap-4 text-xs">
          <button
            type="button"
            onClick={() => void check()}
            disabled={!canAct || checking}
            className="underline opacity-60 hover:opacity-100"
          >
            {checking ? "Checking…" : "I've paid, check again"}
          </button>
          <button
            type="button"
            onClick={() => actions?.cancel()}
            disabled={!canAct}
            className="underline opacity-60 hover:opacity-100"
          >
            Cancel
          </button>
        </div>
        {checked && <p className="text-center text-xs opacity-70">{checked}</p>}
        <CardFooter secureLine={secureLine} skip={skip} />
      </PaymentCard>
    );
  }

  if (phase === "awaiting") {
    const blocked = payment?.blocked === true;
    return (
      <PaymentCard price={price} breakdown={block.amountBreakdown}>
        {blocked ? (
          <p className="text-sm">Your browser didn&apos;t open the checkout. Tap below to open it.</p>
        ) : (
          <div className="flex items-center gap-2.5 rounded-xl bg-[var(--cf-bg)] px-3 py-2.5 text-sm">
            <Loader2 className="size-4 shrink-0 animate-spin opacity-70" aria-hidden />
            <span>Complete the payment in the checkout window. This updates on its own.</span>
          </div>
        )}
        <PayButton disabled={!canAct} onClick={() => actions?.reopen()}>
          {blocked ? "Open checkout" : "Open checkout again"}
        </PayButton>
        <div className="flex items-center justify-center gap-4 text-xs">
          <button
            type="button"
            onClick={() => void check()}
            disabled={!canAct || checking}
            className="underline opacity-60 hover:opacity-100"
          >
            {checking ? "Checking…" : "I've paid, check now"}
          </button>
          <button
            type="button"
            onClick={() => actions?.cancel()}
            disabled={!canAct}
            className="underline opacity-60 hover:opacity-100"
          >
            Cancel
          </button>
        </div>
        {checked && <p className="text-center text-xs opacity-70">{checked}</p>}
      </PaymentCard>
    );
  }

  if (phase === "failed") {
    /*
     * In the preview the refusal is not a failure, it is the reason simulating
     * is on offer: "payments aren't available on this form" in alarm red, with
     * no word that this is a preview, reads to the author as something they
     * broke. Same copy, told as the note it is.
     */
    const previewRefusal = payment?.preview === true;
    return (
      <PaymentCard
        price={price}
        note={previewRefusal ? "Preview · no real payment is taken" : undefined}
      >
        <p role="alert" className={previewRefusal ? "text-sm opacity-70" : "text-destructive text-sm"}>
          {payment?.message ?? "That payment didn't go through."}
        </p>
        {payment?.preview ? (
          <PayButton disabled={!canAct} onClick={() => actions?.simulate()}>
            Simulate payment
          </PayButton>
        ) : (
          <PayButton disabled={!canAct} onClick={() => actions?.start(block.ref)}>
            Try again
          </PayButton>
        )}
        <CardFooter secureLine={secureLine} skip={skip} />
      </PaymentCard>
    );
  }

  // idle and starting share a layout, so tapping Pay changes the label and
  // nothing else moves.
  const starting = phase === "starting";
  return (
    <PaymentCard price={price} breakdown={block.amountBreakdown}>
      <PayButton disabled={!canAct || starting} onClick={() => actions?.start(block.ref)}>
        {starting ? (
          <>
            <Loader2 className="size-4 animate-spin" aria-hidden />
            Opening checkout…
          </>
        ) : (
          payLabel
        )}
      </PayButton>
      <CardFooter secureLine={secureLine} skip={starting ? null : skip} />
    </PaymentCard>
  );
}

/**
 * The frame every state of the gateway card shares: what is owed, large, above
 * whatever the respondent can do about it. The amount leads because it is the
 * one thing a person looks for before they tap anything that takes money.
 */
function PaymentCard({
  price,
  breakdown,
  note,
  children,
}: {
  price: string | null;
  /** "₹1,000 × 3", when the amount is per person or item. */
  breakdown?: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="animate-message-in w-full max-w-md space-y-3 rounded-2xl border border-[var(--cf-chip-border)] bg-[var(--cf-chip-bg)] p-4">
      {note && <p className="text-xs font-medium opacity-60">{note}</p>}
      {price && (
        <div>
          <p className="text-xs opacity-60">Amount to pay</p>
          <p className="text-2xl font-semibold tracking-tight tabular-nums">{price}</p>
          {breakdown && <p className="text-xs tabular-nums opacity-60">{breakdown}</p>}
        </div>
      )}
      {children}
    </div>
  );
}

function CardFooter({ secureLine, skip }: { secureLine: string; skip: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <p className="flex items-center gap-1.5 text-xs opacity-60">
        <Lock className="size-3" aria-hidden />
        {secureLine}
      </p>
      {skip}
    </div>
  );
}

function PayButton({
  children,
  disabled,
  onClick,
  type = "button",
}: {
  children: React.ReactNode;
  disabled?: boolean;
  onClick?: () => void;
  type?: "button" | "submit";
}) {
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-[var(--cf-accent)] px-6 text-base font-semibold text-[var(--cf-accent-text)] shadow-sm transition-[transform,filter] hover:brightness-105 active:scale-[0.98] motion-reduce:active:scale-100 disabled:pointer-events-none disabled:opacity-60"
    >
      {children}
    </button>
  );
}

/**
 * Paying happens somewhere we cannot see — the builder's own checkout page, or
 * the respondent's UPI app. So this control does two things and no more: get
 * them to the right place, and record that they say they paid.
 *
 * It deliberately does not claim the payment succeeded. The answer carries
 * `verified: false` and a reference code the builder can match against their
 * own statement, which is the honest shape of an out-of-band payment.
 */
export function ManualPaymentAffordance({
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

  /**
   * `upi://` is ours, built from the block's own fields; `block.url` is a
   * `z.string().url()`, which accepts `javascript:`. Only the second needs
   * vetting, and `safeHref` would refuse the first for having a scheme no
   * browser navigates.
   */
  const target = block.paymentMethod === "upi" ? upiUri : safeHref(block.url);

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
