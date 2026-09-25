import * as React from 'react'
import { normalizeCamelot } from './camelot'

export type SortDirection = 'asc' | 'desc'
export type SortState = { key: string; direction: SortDirection } | null
export type SortAccessors<T> = Record<string, (row: T) => unknown>

export function compareBy(key: string) {
  return (left: unknown, right: unknown): number => {
    const a = left == null || left === '' ? null : left
    const b = right == null || right === '' ? null : right
    if (a === null || b === null) return a === b ? 0 : a === null ? 1 : -1
    if (key === 'key' || key === 'camelot') {
      const ca = normalizeCamelot(String(a))
      const cb = normalizeCamelot(String(b))
      if (ca && cb)
        return Number(ca.slice(0, -1)) - Number(cb.slice(0, -1)) || (ca.endsWith('A') ? -1 : 1)
      if (ca) return -1
      if (cb) return 1
    }
    if (typeof a === 'number' && typeof b === 'number') return a - b
    return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' })
  }
}

export function sortRows<T>(rows: T[], sort: SortState, accessors: SortAccessors<T>): T[] {
  if (!sort) return rows
  const accessor = accessors[sort.key]
  if (!accessor) return rows
  const compare = compareBy(sort.key)
  return rows
    .map((row, index) => ({ row, index }))
    .sort((a, b) => {
      const av = accessor(a.row)
      const bv = accessor(b.row)
      const emptyA = av == null || av === ''
      const emptyB = bv == null || bv === ''
      if (emptyA || emptyB) return emptyA === emptyB ? a.index - b.index : emptyA ? 1 : -1
      const result = compare(av, bv) * (sort.direction === 'asc' ? 1 : -1)
      return result || a.index - b.index
    })
    .map(({ row }) => row)
}

export function sortGroups<G extends { tracks: T[] }, T>(
  groups: G[],
  sort: SortState,
  accessors: SortAccessors<T>,
): G[] {
  return groups.map((group) => ({ ...group, tracks: sortRows(group.tracks, sort, accessors) }))
}

export function useSort() {
  const [sort, setSort] = React.useState<SortState>(null)
  const toggleSort = React.useCallback(
    (key: string) =>
      setSort((current) =>
        current?.key !== key
          ? { key, direction: 'asc' }
          : current.direction === 'asc'
            ? { key, direction: 'desc' }
            : null,
      ),
    [],
  )
  return { sort, toggleSort }
}
