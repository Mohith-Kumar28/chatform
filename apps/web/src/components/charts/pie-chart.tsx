"use client";
import { Cell, Pie, PieChart as RePieChart, ResponsiveContainer, Tooltip as ReTooltip } from "recharts";
import { Empty, seriesColor, type BarItem } from "./chart-kit";

/**
 * Part-to-whole, with the parts named on themselves.
 *
 * The distinction from `Donut`, which stays: a donut keeps a number in its
 * middle and its names in a list beside it, which is right when the total is the
 * headline and the split is secondary. This is for the reverse — creation
 * source, response source, revenue by plan — where the split *is* the question
 * and the total is a footnote. Labels ride on the slices, so the card reads in
 * one pass instead of two.
 *
 * Same `BarItem` as the bar list and the donut, so a card can change its mind
 * about which shape suits without its data changing.
 *
 * Small slices are the failure mode of every pie: a 2% label overlaps its
 * neighbour and points at the wrong wedge. Anything under `LABEL_FLOOR` of the
 * whole goes unlabelled and is left to the tooltip and the legend beneath.
 */

/** Under this share, a slice has no room for its own name. */
const LABEL_FLOOR = 0.07;

export function PieChart({
  items,
  total,
  height = 220,
  emptyLabel = "Nothing to show yet.",
}: {
  items: BarItem[];
  total: number;
  height?: number;
  emptyLabel?: string;
}) {
  if (total <= 0 || items.length === 0) {
    return <Empty>{emptyLabel}</Empty>;
  }

  /*
    One category is not a split, and a pie of it is a filled circle — a shape
    that says "100%" using the whole card to do it. The sentence is the honest
    drawing, and it is also the one a reader can act on.
  */
  if (items.length === 1) {
    const only = items[0]!;
    return (
      <Empty>
        Everything came through <span className="text-foreground font-medium">{only.label}</span> —{" "}
        {only.display ?? only.value.toLocaleString()}.
      </Empty>
    );
  }

  const rows = items.map((item, i) => ({ ...item, fill: item.color ?? seriesColor(i) }));

  return (
    /*
      Grows into whatever height the card ends up at, rather than sitting at a
      fixed size with dead surface underneath. `height` is the floor, not the
      size: paired with a tall neighbour the wheel gets bigger instead of the
      card getting emptier.
    */
    <div className="flex h-full flex-col">
      {/*
        Capped as well as floored. Beside a 25-row table the card stretches to
        800px, and an unbounded wheel grew with it until the slices ran off the
        edges — filling a card is not the same as being the size of one.
      */}
      <div className="min-h-0 flex-1" style={{ minHeight: height, maxHeight: height * 1.6 }}>
        <ResponsiveContainer width="100%" height="100%">
          <RePieChart margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
            <Pie
              data={rows}
              dataKey="value"
              nameKey="label"
              outerRadius="82%"
              // A hairline of surface between wedges, so two adjacent fills read
              // as two marks rather than one band that changed colour.
              paddingAngle={1.5}
              stroke="var(--card)"
              strokeWidth={2}
              isAnimationActive={false}
              labelLine={false}
              label={({ percent, name }) =>
                (percent ?? 0) < LABEL_FLOOR ? "" : `${name} ${Math.round((percent ?? 0) * 100)}%`
              }
            >
              {rows.map((r) => (
                <Cell key={r.label} fill={r.fill} />
              ))}
            </Pie>
            <ReTooltip
              contentStyle={{
                background: "var(--popover)",
                border: "1px solid var(--border)",
                borderRadius: "0.5rem",
                fontSize: "0.8125rem",
              }}
              formatter={(value, name, entry) => [
                // `display` for the same reason the bar list has it: a slice can
                // be a count, but it can equally be money, and printing the raw
                // number then reports 8500 where the answer is $85.
                (entry?.payload as BarItem | undefined)?.display ?? (value as number),
                name as string,
              ]}
            />
          </RePieChart>
        </ResponsiveContainer>
      </div>
      {/* The wedges under the labelling floor still need a name somewhere. */}
      <ul className="text-caption mt-2 flex flex-wrap gap-x-4 gap-y-1">
        {rows.map((r) => (
          <li key={r.label} className="text-muted-foreground flex min-w-0 items-center gap-1.5">
            <span className="size-2.5 shrink-0 rounded-[3px]" style={{ background: r.fill }} aria-hidden />
            <span className="truncate">{r.label}</span>
            <span className="tabular shrink-0 opacity-70">{r.display ?? r.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
