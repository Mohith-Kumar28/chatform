'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import type { ReactNode } from 'react'
import { TooltipProvider } from '@/components/ui/tooltip'
import { RANGES, useRange, type Range } from '../range-picker'
import { Segmented } from './kit/ui'

// What the analytics pages share above the fold: the frame that turns on their dense styles, and
// the two controls that live in the address so a view can be reloaded or sent to someone.

export type Audience = 'site' | 'respondents'

/** Site unless the address says otherwise: people looking at chatform, not people filling in a form. */
export function useAudience(): Audience {
  return useSearchParams().get('audience') === 'respondents' ? 'respondents' : 'site'
}

function useSetParam() {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  return (key: string, value: string | null) => {
    const q = new URLSearchParams(params.toString())
    if (value) q.set(key, value)
    else q.delete(key)
    // A different audience or period is a different list: start from its first page.
    q.delete('offset')
    router.replace(`${pathname}?${q.toString()}`, { scroll: false })
  }
}

export function AudiencePills() {
  const audience = useAudience()
  const set = useSetParam()
  return (
    <Segmented<Audience>
      label="Audience"
      value={audience}
      onChange={(v) => set('audience', v === 'site' ? null : v)}
      options={[
        ['site', 'Site'],
        ['respondents', 'Respondents'],
      ]}
    />
  )
}

const RANGE_LABEL: Record<Range, string> = { '1d': '24h', '7d': '7d', '30d': '30d', '90d': '90d', '365d': '12mo' }

export function RangePills({ ranges = RANGES, fallback = '7d' }: { ranges?: readonly Range[]; fallback?: Range }) {
  const range = useRange(ranges, fallback)
  const set = useSetParam()
  return <Segmented<Range> label="Date range" value={range} onChange={(v) => set('range', v)} options={ranges.map((r) => [r, RANGE_LABEL[r]] as const)} />
}

export function AnalyticsFrame({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <TooltipProvider delayDuration={150}>
      <div className={`analytics ${className ?? ''}`}>{children}</div>
    </TooltipProvider>
  )
}
