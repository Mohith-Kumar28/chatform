'use client'

import { useState } from 'react'
import { TrendChart } from './charts/trend'
import { rangeLabel } from './kit/format'
import { Panel, Segmented } from './kit/ui'
import { TRAFFIC_SERIES, bucketRows, last24 } from './traffic'
import type { Analytics } from './types'

// Traffic, new and returning, over the last 24 hours or per day. One chart, one toggle: the
// Dashboard and Traffic pages both lead with it. In the 24h range there are no days to show, so
// the toggle goes away.
export function TrafficPanel({ a, days, className, height = 260 }: { a: Analytics; days: number; className?: string; height?: number }) {
  const [by, setBy] = useState<'hour' | 'day'>('hour')
  const hourly = a.granularity === 'hour'
  const perHour = hourly || by === 'hour'
  return (
    <Panel
      className={className}
      title="Traffic"
      description={perHour ? 'Last 24 hours' : `Per day · ${rangeLabel(days)}`}
      info="Page views. New = views by people on their first day here; returning = views by people who had been before."
      actions={
        !hourly && (
          <Segmented
            label="Traffic period"
            value={by}
            onChange={setBy}
            options={[
              ['hour', '24 hours'],
              ['day', 'Per day'],
            ]}
          />
        )
      }
    >
      <TrendChart data={perHour ? last24(a) : bucketRows(a)} series={TRAFFIC_SERIES} range={perHour ? 1 : days} height={height} />
    </Panel>
  )
}
