"use client";

import Link from "next/link";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

/**
 * The console's table, declared as columns rather than written out as markup.
 *
 * Seven screens here show a list of rows joined out of D1 and each was about to
 * re-hand-roll a `<Table>` with the same header, the same alignment rules and
 * the same empty state. The column list is the interesting part of any of them;
 * everything else is identical, and identical code copied seven times is seven
 * chances for the numeric columns to stop being right-aligned.
 *
 * Two rules the columns encode, because getting them wrong makes a table hard to
 * read in a way nobody can name:
 *
 *   - **Numbers right, text left.** Digits only line up for comparison against a
 *     right edge, which is the entire reason to put a column of them next to
 *     each other.
 *   - **Tabular figures on anything numeric**, so a row does not reflow when 9
 *     becomes 10.
 */

export interface Column<T> {
  key: string;
  header: string;
  /** Right-aligns and applies tabular figures. */
  numeric?: boolean;
  /** Kept narrow and quiet — timestamps, ids. */
  muted?: boolean;
  width?: string;
  render: (row: T) => React.ReactNode;
}

export function DataTable<T>({
  rows,
  columns,
  hrefFor,
  empty = "Nothing here yet.",
  caption,
}: {
  rows: T[];
  columns: Column<T>[];
  /** When set, the first cell becomes a link and the row highlights on hover. */
  hrefFor?: (row: T) => string;
  empty?: React.ReactNode;
  caption?: React.ReactNode;
}) {
  /**
   * An empty table is one quiet line, not a void.
   *
   * This used to be `py-6 text-center`, which turned every card with nothing in
   * it into a ~170px band of empty surface with a sentence floating in the
   * middle — and because the bar lists next to them said "nothing here" in a
   * single left-aligned line, two cards reporting the same absence came out
   * wildly different heights. Same treatment, same height, and a page with
   * nothing wrong on it stays short.
   */
  if (rows.length === 0) {
    return <p className="text-muted-foreground text-sm">{empty}</p>;
  }

  return (
    <div className="overflow-x-auto">
      {caption && <p className="text-muted-foreground text-caption mb-2">{caption}</p>}
      <Table>
        <TableHeader>
          <TableRow>
            {columns.map((col) => (
              <TableHead key={col.key} className={cn(col.numeric && "text-right")} style={{ width: col.width }}>
                {col.header}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row, i) => {
            const href = hrefFor?.(row);
            return (
              <TableRow key={i} className={cn(href && "group")}>
                {columns.map((col, ci) => {
                  const content = col.render(row);
                  return (
                    <TableCell
                      key={col.key}
                      className={cn(
                        col.numeric && "tabular text-right",
                        col.muted && "text-muted-foreground text-xs whitespace-nowrap",
                        ci === 0 && "max-w-80",
                      )}
                    >
                      {href && ci === 0 ? (
                        <Link
                          href={href}
                          className="group-hover:text-primary block truncate transition-colors duration-[var(--duration-micro)]"
                        >
                          {content}
                        </Link>
                      ) : (
                        content
                      )}
                    </TableCell>
                  );
                })}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
