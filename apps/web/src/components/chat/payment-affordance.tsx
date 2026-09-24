"use client";

import { safeHref } from "@repo/guard";
import { useMemo, useState } from "react";
import { Loader2, Lock } from "lucide-react";
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
    <button type="button" onClick={onSkip} disabled={disabled} className="text-xs underline opacity-60">
      Skip
    </button>
  );

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
      <form
        className="animate-message-in space-y-3 rounded-2xl bg-[var(--cf-chip-bg)] p-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (phone && canAct) actions?.start(block.ref, { phone });
        }}
      >
        <p className="text-sm">{payment?.message ?? "What number should the payment receipt go to?"}</p>
        <PhoneInput value={phone} onChange={setPhone} variant="field" autoFocus name="payment-phone" />
        <div className="flex flex-wrap items-center gap-2">
          <PayButton type="submit" disabled={!canAct || !phone}>
            {price ? `Pay ${price}` : "Pay"}
          </PayButton>
          {payment?.preview ? (
            <button type="button" onClick={() => actions?.simulate()} disabled={!canAct} className="text-xs underline opacity-60">
              Simulate instead
            </button>
          ) : (
            skip
          )}
        </div>
        <p className="flex items-center gap-1.5 text-xs opacity-60">
          <Lock className="size-3" aria-hidden />
          {secureLine}
        </p>
      </form>
    );
  }

  if (phase === "awaiting" && payment?.preview) {
    return (
      <div className="animate-message-in space-y-3 rounded-2xl bg-[var(--cf-chip-bg)] p-4">
        <p className="text-xs font-medium opacity-60">Preview · no real payment is taken</p>
        <div className="flex flex-wrap items-center gap-2">
          <PayButton disabled={!canAct} onClick={() => actions?.simulate()}>
            {price ? `Simulate paying ${price}` : "Simulate payment"}
          </PayButton>
          <button type="button" onClick={() => actions?.cancel()} disabled={!canAct} className="text-xs underline opacity-60">
            Cancel
          </button>
        </div>
      </div>
    );
  }

  if (phase === "awaiting") {
    const blocked = payment?.blocked === true;
    return (
      <div className="animate-message-in space-y-3 rounded-2xl bg-[var(--cf-chip-bg)] p-4">
        <p className="flex items-center gap-2 text-sm">
          {blocked ? null : <Loader2 className="size-4 shrink-0 animate-spin opacity-70" aria-hidden />}
          {blocked ? "Your browser didn't open the checkout tab." : "Waiting for payment confirmation…"}
        </p>
        <p className="text-xs opacity-60">
          {price ? `Amount ${price} · ` : ""}
          {secureLine}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {blocked ? (
            <PayButton disabled={!canAct} onClick={() => actions?.reopen()}>
              Open checkout
            </PayButton>
          ) : (
            <Chip disabled={!canAct} onClick={() => actions?.reopen()}>
              Open checkout again
            </Chip>
          )}
          <Chip disabled={!canAct || checking} onClick={() => void check()}>
            {checking ? "Checking…" : "Check payment"}
          </Chip>
          <button type="button" onClick={() => actions?.cancel()} disabled={!canAct} className="text-xs underline opacity-60">
            Cancel
          </button>
        </div>
        {checked && <p className="text-xs opacity-70">{checked}</p>}
      </div>
    );
  }

  if (phase === "failed") {
    /*
     * In the preview the refusal is not a failure, it is the reason simulating
     * is on offer — "payments aren't available on this form" in alarm red, with
     * no word that this is a preview, reads to the author as something they
     * broke. Same copy, told as the note it is.
     */
    const previewRefusal = payment?.preview === true;
    return (
      <div className="animate-message-in space-y-3 rounded-2xl bg-[var(--cf-chip-bg)] p-4">
        {previewRefusal && <p className="text-xs font-medium opacity-60">Preview · no real payment is taken</p>}
        <p role="alert" className={previewRefusal ? "text-sm opacity-70" : "text-destructive text-sm"}>
          {payment?.message ?? "That payment didn't go through."}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {payment?.preview ? (
            <PayButton disabled={!canAct} onClick={() => actions?.simulate()}>
              {price ? `Simulate paying ${price}` : "Simulate payment"}
            </PayButton>
          ) : (
            <PayButton disabled={!canAct} onClick={() => actions?.start(block.ref)}>
              Try again
            </PayButton>
          )}
          {skip}
        </div>
      </div>
    );
  }

  // idle and starting share a layout, so tapping Pay changes the label and
  // nothing else moves.
  const starting = phase === "starting";
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <PayButton disabled={!canAct || starting} onClick={() => actions?.start(block.ref)}>
          {starting ? (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden />
              Opening checkout…
            </>
          ) : price ? (
            `Pay ${price}`
          ) : (
            "Pay"
          )}
        </PayButton>
        {starting ? null : skip}
      </div>
      <p className="flex items-center gap-1.5 text-xs opacity-60">
        <Lock className="size-3" aria-hidden />
        {secureLine}
      </p>
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
      className="inline-flex h-10 items-center gap-2 rounded-full bg-[var(--cf-accent)] px-5 text-sm font-medium text-[var(--cf-accent-text)] transition-transform active:scale-[0.98] motion-reduce:active:scale-100 disabled:pointer-events-none disabled:opacity-60"
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
