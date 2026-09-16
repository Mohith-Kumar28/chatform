import { displayAnswer, paymentCells, paymentColumnTitles, type Block } from "@repo/form-schema";

/** A column in the results table: enough of a block to label and render a cell. */
export type ResultColumn = Pick<Block, "ref" | "title" | "type"> & { retired?: boolean };

/**
 * One cell, as text. Empty string when there is nothing to show.
 *
 * The empty string is load bearing: it is what "no answer" means everywhere
 * that reads a response, and `splitAnswers` is built on it.
 */
export function displayCell(block: ResultColumn, value: unknown): string {
  if (value === undefined || value === null || value === "") return "";
  return displayAnswer(block as Block, value);
}

/** The payment block's own currency, when the column is one — the fallback for an answer that carries none. */
function blockCurrency(column: ResultColumn): string | undefined {
  return column.type === "payment" ? (column as Partial<Extract<Block, { type: "payment" }>>).currency : undefined;
}

/**
 * The headers one column contributes to a downloaded CSV.
 *
 * A payment question is followed by its status, amount, currency and gateway
 * id, the same four the server's exports add (`paymentCells` in
 * `@repo/form-schema`). The results screen's "download these rows" and the
 * export endpoint must produce the same file for the same rows, or someone
 * reconciling from one and checking against the other finds columns missing.
 */
export function csvHeadersFor(column: ResultColumn): string[] {
  const title = column.retired ? `${column.title} (removed)` : column.title;
  return column.type === "payment" ? [title, ...paymentColumnTitles(title)] : [title];
}

/** The cells one column contributes to a row, in `csvHeadersFor` order. */
export function csvCellsFor(column: ResultColumn, value: unknown): string[] {
  const cell = displayCell(column, value);
  return column.type === "payment" ? [cell, ...paymentCells(value, blockCurrency(column))] : [cell];
}

/** One `respondent_payments` row, as `GET /api/forms/:id/payments` returns it. */
export interface PaymentAttempt {
  id: string;
  blockRef: string;
  provider: string;
  environment: "test" | "live";
  status: string;
  duplicate: boolean;
  failureReason: string | null;
  amount: number;
  currency: string;
  providerPaymentId: string | null;
  dashboardUrl: string | null;
}

/**
 * Money that reached the gateway for this question and that the response's answer does not
 * count — a second payment from another tab, or one taken at a price the respondent then
 * changed. The admin owes it back, and only they can give it.
 *
 * Every one of these is `paid` and carries a `failure_reason`: that flag is exactly what the
 * server writes when a real payment cannot become the answer. A refunded record is left out —
 * that money has already gone back.
 *
 * Deliberately independent of whether the question has an answer at all. The case that has to
 * work is the one with no answer: the respondent paid, changed the amount, and never paid the
 * new one, so the question reads "Not answered" while their money sits in the admin's gateway.
 */
export function uncountedPayments(
  attempts: PaymentAttempt[],
  blockRef: string,
  countedRecordId?: string,
): PaymentAttempt[] {
  return attempts.filter(
    (p) => p.blockRef === blockRef && p.id !== countedRecordId && p.status === "paid" && p.failureReason !== null,
  );
}

/**
 * A response's columns, split into what was said and what was not.
 *
 * Pulled out of the detail panel so it can be tested without a DOM, and
 * because the distinction is the panel's whole argument: on a branching form
 * most blank columns are not questions the respondent declined, they are
 * questions the respondent was never asked. The open mic registration showed
 * fourteen rows to somebody who saw nine.
 *
 * Nothing here knows which of the two a blank is — the response row does not
 * record the path taken — which is exactly why the panel leads with the
 * answers and puts the blanks behind a disclosure rather than trying to label
 * them.
 */
export function splitAnswers(
  columns: ResultColumn[],
  byRef: Map<string, unknown>,
): { answered: ResultColumn[]; blank: ResultColumn[] } {
  const answered: ResultColumn[] = [];
  const blank: ResultColumn[] = [];
  for (const column of columns) {
    (displayCell(column, byRef.get(column.ref)) === "" ? blank : answered).push(column);
  }
  return { answered, blank };
}
