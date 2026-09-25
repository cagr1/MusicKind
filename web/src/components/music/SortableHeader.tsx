import type { ReactNode } from 'react'
import { ArrowDown, ArrowUp } from 'lucide-react'
import type { SortState } from '@/lib/sort'

export function SortableHeader({
  sort,
  sortKey,
  onSort,
  children,
  className = '',
}: {
  sort: SortState
  sortKey: string
  onSort: (key: string) => void
  children: ReactNode
  className?: string
}) {
  const active = sort?.key === sortKey
  return (
    <th
      aria-sort={active ? (sort.direction === 'asc' ? 'ascending' : 'descending') : 'none'}
      className={className}
    >
      <button
        type="button"
        className="inline-flex items-center gap-1 text-inherit hover:text-zinc-200"
        onClick={() => onSort(sortKey)}
      >
        {children}
        {active &&
          (sort.direction === 'asc' ? (
            <ArrowUp aria-hidden="true" className="size-3" />
          ) : (
            <ArrowDown aria-hidden="true" className="size-3" />
          ))}
      </button>
    </th>
  )
}
