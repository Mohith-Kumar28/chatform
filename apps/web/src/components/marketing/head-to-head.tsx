import { cn } from "@/lib/utils";
import { CellView } from "./comparison-table";
import { ROWS, VERIFIED_ON, type Cell } from "./comparison-data";

export interface HeadToHeadRow {
  label: string;
  hint?: string;
  us: Cell;
  them: Cell;
}

/**
 * The seven-column table, narrowed to the two columns a comparison page is
 * about.
 *
 * The rows are not re-typed here. They are read out of `comparison-data.ts` by
 * column index — the same array that renders the wide table on `/pricing` —
 * so a competitor fact can only be wrong in one place, and correcting it there
 * corrects it everywhere. `extra` is appended for rows that only matter to one
 * matchup: video questions belong on the Typeform page and nowhere else, and
 * putting them in the shared array would add a column of dashes to six other
 * comparisons.
 */
export function HeadToHead({
  competitor,
  vendorIndex,
  extra = [],
}: {
  competitor: string;
  vendorIndex: number;
  extra?: readonly HeadToHeadRow[];
}) {
  const rows: HeadToHeadRow[] = [
    ...ROWS.map((row) => ({
      label: row.label,
      hint: row.hint,
      us: row.cells[0]!,
      them: row.cells[vendorIndex]!,
    })),
    ...extra,
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="border-border/70 overflow-x-auto rounded-2xl border">
        <table className="w-full min-w-[34rem] border-collapse text-left">
          <caption className="sr-only">chatform compared with {competitor}, feature by feature</caption>
          <thead>
            <tr className="bg-muted/50">
              <th scope="col" className="text-caption w-[44%] px-5 py-3 font-semibold">
                &nbsp;
              </th>
              <th scope="col" className="text-caption text-primary bg-primary-soft/60 px-4 py-3 font-semibold">
                chatform
              </th>
              <th scope="col" className="text-caption px-4 py-3 font-semibold">
                {competitor}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label} className="border-border/50 border-t align-top">
                <th scope="row" className="px-5 py-3.5 font-normal">
                  <span className="text-body block font-medium">{row.label}</span>
                  {row.hint && (
                    <span className="text-micro text-muted-foreground block leading-snug">{row.hint}</span>
                  )}
                </th>
                {([row.us, row.them] as const).map((cell, i) => (
                  <td key={i} className={cn("px-4 py-3.5", i === 0 && "bg-primary-soft/40")}>
                    <span className="flex min-h-5 items-start">
                      <CellView cell={cell} emphasis={i === 0} />
                    </span>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-micro text-muted-foreground">
        Competitor facts were read from {competitor}&rsquo;s own public pages in {VERIFIED_ON} unless a
        later date is given under Updates below. &ldquo;Partly&rdquo; and the grey notes mean exactly
        what they say — see the sources at the foot of this page.
      </p>
    </div>
  );
}
