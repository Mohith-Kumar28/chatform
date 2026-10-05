'use client'

import { useId } from 'react'
import { Area, AreaChart, YAxis } from 'recharts'
import { ChartContainer } from '@/components/ui/chart'
import { useMounted } from '../kit/format'

/** A tile's trend line: no axes, the last point marked (the current period). */
export function Spark({ values, color = 'var(--chart-1)', height = 30 }: { values: number[]; color?: string; height?: number }) {
  const mounted = useMounted()
  const id = useId().replace(/:/g, '')
  if (!mounted) return <div style={{ height }} />
  const data = values.map((v, i) => ({ i, v }))
  return (
    <ChartContainer config={{ v: { label: 'Value', color } }} className="aspect-auto w-full" style={{ height }} initialDimension={{ width: 200, height }}>
      <AreaChart data={data} margin={{ top: 3, right: 3, bottom: 1, left: 0 }}>
        <defs>
          <linearGradient id={`spark-${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-v)" stopOpacity={0.22} />
            <stop offset="100%" stopColor="var(--color-v)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <YAxis hide domain={[0, 'dataMax']} />
        <Area
          dataKey="v"
          type="monotone"
          stroke="var(--color-v)"
          strokeWidth={1.5}
          fill={`url(#spark-${id})`}
          isAnimationActive={false}
          dot={(p: { index?: number; cx?: number; cy?: number }) =>
            p.index === data.length - 1 && p.cx != null && p.cy != null ? (
              <circle key="last" cx={p.cx} cy={p.cy} r={2.5} fill="var(--color-v)" stroke="var(--card)" strokeWidth={1.5} />
            ) : (
              <g key={p.index} />
            )
          }
          activeDot={false}
        />
      </AreaChart>
    </ChartContainer>
  )
}
