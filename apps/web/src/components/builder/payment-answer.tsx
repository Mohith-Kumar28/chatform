"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight, ShieldCheck, TriangleAlert } from "lucide-react";
import {
  formatAmount,
  PAYMENT_PROVIDER_LABELS,
  paymentDashboardUrl,
  readPaymentAnswer,
  type Block,
  type PaymentDetails,
} from "@repo/form-schema";
import { CopyButton } from "@/components/ui/copy-button";
import { customFetch } from "@/lib/api/mutator";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { uncountedPayments, type PaymentAttempt, type ResultColumn } from "./response-answers";

/**
 * A payment answer in the results table and in the response dialog.
 *
 * Its own file because the table cell and the dialog must agree on the one
 * distinction that matters — whether the gateway confirmed the money or the
 * respondent pressed a button — and a badge drawn in one place and a sentence
 * in another is how they come to disagree. Both read `readPaymentAnswer`, the
 * same function the exports use.
 */

function currencyOf(column: ResultColumn): string | undefined {
  return column.type === "payment" ? (column as Partial<Extract<Block, { type: "payment" }>>).currency : undefined;
}

const STATUS_COPY: Record<PaymentDetails["status"], string> = {
  "paid · verified": "Paid · verified",
  "paid · test mode": "Paid · test mode",
  "paid · unverified": "Paid · unverified",
  refunded: "Refunded",
  pending: "Pending",
};

/** The table cell: a status badge and the amount beside it. */
export function PaymentCell({ column, value }: { column: ResultColumn; value: unknown }) {
  const details = readPaymentAnswer(value, currencyOf(column));
  if (!details) return <span className="text-muted-foreground/60">—</span>;
  return (
    <span className="flex max-w-[16rem] items-center gap-1.5 whitespace-nowrap">
      <StatusBadge status={details.status} />
      {details.amount !== undefined && (
        <span className="tabular truncate">{formatAmount(details.amount, details.currency ?? "INR")}</span>
      )}
    </span>
  );
}

function StatusBadge({ status }: { status: PaymentDetails["status"] }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-px text-[0.6875rem] font-medium",
        status === "paid · verified" && "bg-[var(--success-soft)] text-[var(--success-soft-foreground)]",
        (status === "paid · unverified" || status === "paid · test mode") &&
          "bg-[var(--warning-soft)] text-[var(--warning-soft-foreground)]",
        (status === "refunded" || status === "pending") && "bg-muted text-muted-foreground",
      )}
    >
      {status === "paid · verified" && <ShieldCheck className="size-3" aria-hidden />}
      {STATUS_COPY[status]}
    </span>
  );
}

/**
 * The payment attempts on one response, for the dialog. One query key per response, so every
 * payment question in it shares a single request.
 */
export function usePaymentAttempts(formId: string, submissionId: string, enabled = true) {
  return useQuery({
    queryKey: ["form-payments", formId, submissionId],
    queryFn: () =>
      customFetch<{ payments: PaymentAttempt[] }>(
        `/api/forms/${formId}/payments?submission=${encodeURIComponent(submissionId)}`,
      ),
    enabled: enabled && Boolean(submissionId),
    retry: false,
  });
}

/**
 * What the dialog shows under a payment question: who confirmed the answer, the ids to find it
 * by, a way into the gateway's own dashboard — and any money that came in for the question
 * which the answer does not count.
 *
 * Rendered whether or not the question has an answer, and the records are read either way. The
 * answer alone cannot say that a second payment exists, and the case that most needs saying has
 * no answer at all: `releaseStalePayments` takes the answer off when the price changes, so a
 * respondent who paid ₹100, changed the quantity and then abandoned leaves "Not answered" on
 * screen and ₹100 in the admin's gateway. That used to be invisible everywhere in the product.
 */
export function PaymentAnswerDetails({
  formId,
  submissionId,
  blockRef,
  value,
}: {
  formId: string;
  submissionId: string;
  blockRef: string;
  value: unknown;
}) {
  const details = readPaymentAnswer(value);

  const { data } = usePaymentAttempts(formId, submissionId);

  const attempts = (data?.payments ?? []).filter((p) => p.blockRef === blockRef);
  const duplicates = uncountedPayments(attempts, blockRef, details?.paymentRecordId);
  if (!details) return duplicates.length > 0 ? <UncountedPayments payments={duplicates} /> : null;

  const provider = details.provider;
  const providerLabel = provider ? PAYMENT_PROVIDER_LABELS[provider] : null;
  const record = attempts.find((p) => p.id === details.paymentRecordId);
  const dashboard = provider
    ? (record?.dashboardUrl ?? paymentDashboardUrl(provider, details.paymentId, record?.environment))
    : null;

  return (
    <div className="mt-2 space-y-2">
      <dl className="text-caption grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
        <dt className="text-muted-foreground">Checked by</dt>
        <dd>
          {details.verified && providerLabel
            ? `${providerLabel}${details.testMode || record?.environment === "test" ? " (test mode)" : ""}`
            : "Nobody — the respondent said they paid"}
        </dd>

        {details.paymentId && (
          <>
            <dt className="text-muted-foreground">Gateway payment ID</dt>
            <dd className="flex min-w-0 items-center gap-1">
              <span className="truncate font-mono text-xs">{details.paymentId}</span>
              <CopyButton value={details.paymentId} size="icon-xs" />
            </dd>
          </>
        )}

        {details.reference && (
          <>
            <dt className="text-muted-foreground">Reference</dt>
            <dd className="font-mono text-xs">{details.reference}</dd>
          </>
        )}

        {details.paidAt !== undefined && (
          <>
            <dt className="text-muted-foreground">Paid at</dt>
            <dd>{formatDateTime(details.paidAt)}</dd>
          </>
        )}
      </dl>

      {dashboard && providerLabel && (
        <a
          href={dashboard}
          target="_blank"
          rel="noreferrer"
          className="text-primary text-caption inline-flex items-center gap-1 font-medium hover:underline"
        >
          Open in {providerLabel}
          <ArrowUpRight className="size-3" />
        </a>
      )}

      {duplicates.length > 0 && <UncountedPayments payments={duplicates} answered />}
    </div>
  );
}

/**
 * Money in for this question that no answer counts, and what to do about it.
 *
 * Its own component because it is the whole of what a payment question with no answer has to
 * show, and half of what an answered one does.
 */
function UncountedPayments({ payments, answered = false }: { payments: PaymentAttempt[]; answered?: boolean }) {
  const one = payments.length === 1;
  return (
    <div
      className={cn(
        "flex gap-2 rounded-lg bg-[var(--warning-soft)] px-3 py-2 text-[var(--warning-soft-foreground)]",
        !answered && "mt-2",
      )}
    >
      <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
      <div className="text-caption space-y-1">
        <p>
          {answered
            ? `${one ? "Another payment" : `${payments.length} more payments`} came in for this question that this answer doesn't count.`
            : `${one ? "A payment" : `${payments.length} payments`} came in for this question, and nothing here counts ${one ? "it" : "them"} — the amount changed, or it arrived twice.`}{" "}
          Chatform doesn&apos;t refund automatically — refund {one ? "it" : "them"} in your gateway.
        </p>
        {payments.map((d) => (
          <p key={d.id} className="flex flex-wrap items-center gap-x-2">
            <span>{formatAmount(d.amount, d.currency)}</span>
            {d.providerPaymentId && <span className="font-mono text-xs">{d.providerPaymentId}</span>}
            {d.dashboardUrl && (
              <a href={d.dashboardUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 underline">
                Open
                <ArrowUpRight className="size-3" />
              </a>
            )}
          </p>
        ))}
      </div>
    </div>
  );
}
