import { Check, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import { FOOTNOTES, ROWS, VENDORS, type Cell } from "./comparison-data";

/**
 * Deliberately not animated (DESIGN.md 4.5: never animate tables), and
 * deliberately not flattering where the facts don't flatter — see the notes in
 * `comparison-data.ts`.
 */
export function ComparisonTable() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <div className="border-border/70 overflow-x-auto rounded-2xl border">
          <table className="w-full min-w-[52rem] border-collapse text-left">
            <caption className="sr-only">
              chatform compared with Typeform, Youform, Tally, Jotform, Fillout and Google Forms
            </caption>
            <thead>
              <tr className="bg-muted/50">
                <th scope="col" className="text-caption w-[26%] px-5 py-3 font-semibold">
                  &nbsp;
                </th>
                {VENDORS.map((vendor, i) => (
                  <th
                    key={vendor}
                    scope="col"
                    className={cn(
                      "text-caption px-4 py-3 font-semibold",
                      i === 0 && "text-primary bg-primary-soft/60",
                    )}
                  >
                    {vendor}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ROWS.map((row) => (
                <tr key={row.label} className="border-border/50 border-t align-top">
                  <th scope="row" className="px-5 py-3.5 font-normal">
                    <span className="text-body block font-medium">{row.label}</span>
                    {row.hint && (
                      <span className="text-micro text-muted-foreground block leading-snug">
                        {row.hint}
                      </span>
                    )}
                  </th>
                  {row.cells.map((cell, i) => (
                    <td
                      key={i}
                      className={cn("px-4 py-3.5", i === 0 && "bg-primary-soft/40")}
                    >
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
      </div>

      <ol className="text-micro text-muted-foreground flex list-decimal flex-col gap-1.5 pl-4">
        {FOOTNOTES.map((note) => (
          <li key={note} className="max-w-4xl leading-relaxed">
            {note}
          </li>
        ))}
      </ol>
    </div>
  );
}

function CellView({ cell, emphasis }: { cell: Cell; emphasis: boolean }) {
  if (cell === true) {
    return (
      <>
        <Check
          className={cn("mt-0.5 size-4", emphasis ? "text-primary" : "text-foreground")}
          strokeWidth={2.5}
          aria-hidden
        />
        <span className="sr-only">Yes</span>
      </>
    );
  }
  if (cell === false) {
    return (
      <>
        <Minus className="text-muted-foreground/50 mt-0.5 size-4" strokeWidth={2} aria-hidden />
        <span className="sr-only">No</span>
      </>
    );
  }
  if (typeof cell === "string") {
    return (
      <span className={cn("text-body tabular", emphasis && "text-primary font-semibold")}>
        {cell}
      </span>
    );
  }
  if ("partial" in cell) {
    return (
      <span className="text-micro text-muted-foreground leading-snug">
        <span className="text-foreground block font-medium">Partly</span>
        {cell.partial}
      </span>
    );
  }
  return (
    <span className="text-micro text-muted-foreground leading-snug text-balance">
      {cell.unknown}
    </span>
  );
}
