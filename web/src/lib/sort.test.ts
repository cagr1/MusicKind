import { describe, expect, it } from 'vitest'
import { compareBy, sortGroups, sortRows, type SortState } from './sort'

describe('sortRows', () => {
  const rows = [{ value: '9' }, { value: '10' }, { value: '2' }, { value: '' }, { value: null }]
  it('cycles asc/desc/none semantics and keeps empty values last', () => {
    const accessors = { value: (row: (typeof rows)[number]) => row.value }
    expect(
      sortRows(rows, { key: 'value', direction: 'asc' }, accessors).map((r) => r.value),
    ).toEqual(['2', '9', '10', '', null])
    expect(
      sortRows(rows, { key: 'value', direction: 'desc' }, accessors).map((r) => r.value),
    ).toEqual(['10', '9', '2', '', null])
    expect(sortRows(rows, null, accessors)).toBe(rows)
  })
  it('compares Camelot number then A before B', () => {
    expect(['2B', '1B', '1A', '10A'].sort(compareBy('key'))).toEqual(['1A', '1B', '2B', '10A'])
  })
  it('keeps equal values in original order', () => {
    const equal = [
      { n: 1, id: 'first' },
      { n: 1, id: 'second' },
    ]
    expect(sortRows(equal, { key: 'n', direction: 'desc' }, { n: (r) => r.n })).toEqual(equal)
  })
  it('uses numeric-aware text comparison', () => {
    expect(compareBy('text')('10', '9')).toBeGreaterThan(0)
  })
  it('sorts rows without changing section order or membership', () => {
    const groups = [
      { section: 'warmup', tracks: [{ score: 2 }, { score: 1 }] },
      { section: 'peak', tracks: [{ score: 4 }, { score: 3 }] },
    ]
    const sorted = sortGroups<(typeof groups)[number], (typeof groups)[number]['tracks'][number]>(
      groups,
      { key: 'score', direction: 'asc' } satisfies SortState,
      { score: (row) => row.score },
    )
    expect(sorted.map((group) => group.section)).toEqual(['warmup', 'peak'])
    expect(sorted.map((group) => group.tracks.map((track) => track.score))).toEqual([
      [1, 2],
      [3, 4],
    ])
  })
})
