"use client";
import { PolarAngleAxis, RadialBar, RadialBarChart, ResponsiveContainer } from "recharts";
import { cn } from "@/lib/utils";

/**
 * One rate, drawn as the arc it fills.
 *
 * The console had four of these — webhook success, completion, paywall
 * conversion, payments taken — and every one was either a bare number in a
 * corner or a one-row bar list, which is a bar chart comparing a thing to
 * nothing. A percentage has a natural whole, and a ring says "78 of a possible
 * 100" in a shape you recognise across the room without reading the digits.
 *
 * The number is printed in the middle regardless. The arc is the glance; the
 * figure is the answer, and nothing here depends on judging an angle.
 *
 * Tone is a judgement the caller makes, not one derived from the number: 78%
 * webhook delivery is bad and 78% of trials converting would be extraordinary,
 * so the same figure cannot pick its own colour.
 */
export function RadialGauge({
  value,
  label,
  caption,
  tone = "default",
  size = 132,
}: {
  /** 0–100. */
  value: number;
  label: string;
  /** The counts behind the rate — "412 of 528". */
  caption?: string;
  tone?: "default" | "success" | "warning" | "danger";
  size?: number;
}) {
  const pct = Math.max(0, Math.min(100, value));
  const color = {
    default: "var(--chart-1)",
    success: "var(--success)",
    warning: "var(--warning)",
    danger: "var(--destructive)",
  }[tone];

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <ResponsiveContainer width="100%" height="100%">
          {/*
            `PolarAngleAxis` with an explicit 0–100 domain is what makes this a
            gauge rather than a pie of one slice: without it recharts scales the
            single bar to fill the whole ring, and every value from 3% to 97%
            draws an identical complete circle.
          */}
          <RadialBarChart
            data={[{ value: pct, fill: color }]}
            innerRadius="72%"
            outerRadius="100%"
            startAngle={90}
            endAngle={-270}
            barSize={12}
          >
            <PolarAngleAxis type="number" domain={[0, 100]} angleAxisId={0} tick={false} />
            <RadialBar
              dataKey="value"
              angleAxisId={0}
              cornerRadius={6}
              background={{ fill: "var(--muted)" }}
              isAnimationActive={false}
            />
          </RadialBarChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <p className={cn("tabular text-h2 leading-none")}>{Math.round(pct)}%</p>
        </div>
      </div>
      <p className="text-caption text-center leading-snug font-medium">{label}</p>
      {caption && <p className="text-muted-foreground text-micro text-center">{caption}</p>}
    </div>
  );
}
