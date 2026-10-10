'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import type { ReactNode } from 'react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { TooltipProvider } from '@/components/ui/tooltip'
import { getGetApiAdminCampaignsQueryKey, useGetApiAdminCampaigns } from '@/lib/api/admin/admin'
import type { GetApiAdminCampaigns200 } from '@/lib/api/generated.schemas'
import { apiData } from '@/lib/api/payload'
import { Segmented } from './kit/ui'

// What the analytics pages share above the fold: the frame that turns on their dense styles, and
// the controls that live in the address so a view can be reloaded or sent to someone.

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
    // A different audience, period or campaign is a different list: start from its first page.
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

/** The campaign (`utm_campaign`) the address narrows the page to, or none for everybody. */
export function useCampaign(): string | undefined {
  return useSearchParams().get('campaign')?.trim().toLowerCase() || undefined
}

const ALL_CAMPAIGNS = '__all'

/**
 * Narrows Traffic and Visitors to what one campaign brought. Saved campaigns by their name, then
 * any other campaign name seen on a link in the last ninety days. One list for every page and
 * period, so switching the range never drops the campaign that is selected.
 */
export function CampaignSelect() {
  const campaign = useCampaign()
  const set = useSetParam()
  const params = { range: '90d' } as const
  const { data } = useGetApiAdminCampaigns(params, { query: { queryKey: getGetApiAdminCampaignsQueryKey(params), staleTime: 300_000 } })
  const list = apiData<GetApiAdminCampaigns200 | undefined>(data)
  const options = [
    ...(list?.campaigns ?? []).filter((c) => c.status !== 'archived' || c.key === campaign).map((c) => ({ key: c.key, name: c.name })),
    ...(list?.untracked ?? []).map((u) => ({ key: u.key, name: u.key })),
  ]
  // A campaign named in the address is always offered, even one nothing has been heard from.
  if (campaign && !options.some((o) => o.key === campaign)) options.unshift({ key: campaign, name: campaign })
  return (
    <Select value={campaign ?? ALL_CAMPAIGNS} onValueChange={(v) => set('campaign', v === ALL_CAMPAIGNS ? null : v)}>
      <SelectTrigger size="sm" aria-label="Campaign" className="h-[30px] max-w-56 bg-background px-2.5 text-xs">
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="end">
        <SelectItem value={ALL_CAMPAIGNS}>All campaigns</SelectItem>
        {options.map((o) => (
          <SelectItem key={o.key} value={o.key}>
            {o.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

export function AnalyticsFrame({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <TooltipProvider delayDuration={150}>
      <div className={`analytics ${className ?? ''}`}>{children}</div>
    </TooltipProvider>
  )
}
