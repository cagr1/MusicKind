import { describe, expect, it } from 'vitest'
import { rangeKeys, selectionState } from './list'

describe('row selection helpers', () => {
  const rows = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
  const key = (row: { id: string }) => row.id

  it('selects a shift-click range in either direction', () => {
    expect(rangeKeys(rows, 'a', 'c', key)).toEqual(['a', 'b', 'c'])
    expect(rangeKeys(rows, 'c', 'a', key)).toEqual(['a', 'b', 'c'])
  })

  it('reports checked and indeterminate header states', () => {
    expect(selectionState([], ['a', 'b'])).toEqual({
      count: 0,
      checked: false,
      indeterminate: false,
    })
    expect(selectionState(['a'], ['a', 'b'])).toEqual({
      count: 1,
      checked: false,
      indeterminate: true,
    })
    expect(selectionState(['a', 'b'], ['a', 'b'])).toEqual({
      count: 2,
      checked: true,
      indeterminate: false,
    })
  })
})
