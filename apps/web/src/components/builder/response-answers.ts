import { displayAnswer, type Block } from "@repo/form-schema";

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
