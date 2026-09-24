/**
 * Cells that a spreadsheet would execute rather than display.
 *
 * These rows are typed by strangers and then opened in a program that treats a
 * leading `=` as a program. Prefixing with an apostrophe is the conventional
 * neutralisation: Excel and Sheets both render the rest verbatim and drop the
 * quote.
 *
 * A leading `-` is left alone when the cell is an ordinary negative number,
 * because mangling `-40` to protect against `-1+cmd|…` would corrupt far more
 * data than it saves.
 *
 * Promoted here from `apps/api/src/lib/response-table.ts`, which was the only
 * one of three export paths that had it.
 */
export function csvCell(value: string): string {
  if (!value) return value;
  const head = value[0]!;
  if (head === "=" || head === "+" || head === "@" || head === "\t" || head === "\r") {
    return `'${value}`;
  }
  if (head === "-" && !Number.isFinite(Number(value))) return `'${value}`;
  return value;
}

/** RFC 4180: quote every field, double the quotes inside it. */
export function csvField(value: string): string {
  return `"${csvCell(value).replace(/"/g, '""')}"`;
}

/** One CSV line, de-fanged and quoted, without a trailing newline. */
export function csvRow(cells: readonly string[]): string {
  return cells.map(csvField).join(",");
}
