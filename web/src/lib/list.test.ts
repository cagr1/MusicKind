import { describe, expect, it } from 'vitest'
import { appendResults, mergeUnique, pendingItems } from './list'

const key = (item: { path: string }) => item.path

describe('list helpers', () => {
  it('merges items without duplicating their keys', () => {
    expect(
      mergeUnique(
        [{ path: '/a.mp3' }, { path: '/b.mp3' }],
        [{ path: '/b.mp3' }, { path: '/c.mp3' }],
        key,
      ),
    ).toEqual([{ path: '/a.mp3' }, { path: '/b.mp3' }, { path: '/c.mp3' }])
  })

  it('returns only items that do not have a result yet', () => {
    expect(
      pendingItems([{ path: '/a.mp3' }, { path: '/b.mp3' }], [{ path: '/a.mp3' }], key),
    ).toEqual([{ path: '/b.mp3' }])
  })

  it('appends new results and updates an existing result in place', () => {
    expect(
      appendResults(
        [{ path: '/a.mp3', value: 1 }],
        [
          { path: '/a.mp3', value: 2 },
          { path: '/b.mp3', value: 3 },
        ],
        key,
      ),
    ).toEqual([
      { path: '/a.mp3', value: 2 },
      { path: '/b.mp3', value: 3 },
    ])
  })
})
