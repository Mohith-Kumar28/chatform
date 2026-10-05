'use client'

import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { EmptyState, InfoTip } from './ui'

// One table for the analytics pages: sticky header, sortable columns, right-aligned tabular
// numbers. Sorting happens here in the browser; a list sorted by the server passes no `sort` on
// its columns and orders its own rows.

export type Column<T> = {
  id: string
  header: ReactNode
  cell: (row: T, index: number) => ReactNode
  /** Makes the column sortable by this value. */
  sort?: (row: T) => number | string
  /** Right-align (numbers). */
  num?: boolean
  /** Column header help text. */
  info?: ReactNode
  className?: string
  headClassName?: string
}

export function DataTable<T>({
  columns,
  data,
  getRowId,
  empty = 'Nothing to show.',
  rowClassName,
  onRowClick,
  className,
  maxHeight,
}: {
  columns: Column<T>[]
  data: T[]
  getRowId: (row: T) => string
  empty?: ReactNode
  rowClassName?: (row: T) => string | undefined
  onRowClick?: (row: T) => void
  className?: string
  maxHeight?: number
}) {
  const [sorting, setSorting] = useState<{ id: string; desc: boolean } | null>(null)
  const rows = useMemo(() => {
    const by = sorting && columns.find((c) => c.id === sorting.id)?.sort
    if (!sorting || !by) return data
    const sign = sorting.desc ? -1 : 1
    return [...data].sort((a, b) => {
      const x = by(a)
      const y = by(b)
      return (x < y ? -1 : x > y ? 1 : 0) * sign
    })
  }, [data, columns, sorting])
  // First click sorts biggest first, the second smallest first, the third puts the order back.
  const toggle = (id: string) => setSorting((s) => (s?.id !== id ? { id, desc: true } : s.desc ? { id, desc: false } : null))
  return (
    <div className={cn('relative w-full overflow-auto', className)} style={maxHeight ? { maxHeight } : undefined}>
      <table className="w-full caption-bottom text-[13px]">
        <thead className="sticky top-0 z-10 bg-card">
          <tr className="border-b">
            {columns.map((c) => {
              const sort = sorting?.id === c.id ? (sorting.desc ? 'desc' : 'asc') : null
              return (
                <th
                  key={c.id}
                  className={cn('h-8 px-3 text-left align-middle text-xs font-medium whitespace-nowrap text-muted-foreground', c.num && 'text-right', c.headClassName)}
                  aria-sort={sort === 'asc' ? 'ascending' : sort === 'desc' ? 'descending' : undefined}
                >
                  <span className={cn('inline-flex items-center gap-1', c.num && 'flex-row-reverse')}>
                    {c.sort ? (
                      <button type="button" onClick={() => toggle(c.id)} className={cn('inline-flex items-center gap-1 hover:text-foreground', sort && 'text-foreground')}>
                        {c.header}
                        {sort === 'asc' ? <ArrowUp className="size-3" /> : sort === 'desc' ? <ArrowDown className="size-3" /> : <ChevronsUpDown className="size-3 opacity-40" />}
                      </button>
                    ) : (
                      c.header
                    )}
                    {c.info && <InfoTip>{c.info}</InfoTip>}
                  </span>
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr
              key={getRowId(r)}
              onClick={onRowClick ? () => onRowClick(r) : undefined}
              className={cn('border-b last:border-0 hover:bg-muted/40', onRowClick && 'cursor-pointer', rowClassName?.(r))}
            >
              {columns.map((c) => (
                <td key={c.id} className={cn('px-3 py-2 align-middle', c.num && 'num text-right', c.className)}>
                  {c.cell(r, i)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {!rows.length && <EmptyState>{empty}</EmptyState>}
    </div>
  )
}
