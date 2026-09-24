import { describe, expect, it } from 'vitest'
import {
  buildClassifyMoves,
  changeTagGenre,
  filterTagResults,
  tagResultCounts,
  type TagResult,
} from './tag-classifier'

const rows: TagResult[] = [
  {
    path: '/music/a.mp3',
    tagGenre: 'Tech House',
    genre: 'Tech House',
    status: 'ok',
    destination: '/out/Tech House/a.mp3',
  },
  { path: '/music/b.mp3', tagGenre: null, genre: null, status: 'review', destination: null },
  {
    path: '/music/c.mp3',
    tagGenre: 'House',
    genre: 'House',
    status: 'duplicate',
    destination: '/out/House/c.mp3',
  },
  {
    path: '/music/d.mp3',
    tagGenre: 'Dance',
    genre: 'Dance Pop',
    status: 'ok',
    possibleDuplicate: true,
    destination: '/out/Dance Pop/d.mp3',
  },
]

describe('tag classifier view logic', () => {
  it('builds moves only from proposed rows and respects corrected genres', () => {
    const corrected = changeTagGenre(rows, ['/music/a.mp3'], 'House', '/out')
    expect(buildClassifyMoves(corrected)).toEqual([
      { from: '/music/a.mp3', to: '/out/House/a.mp3' },
    ])
  })

  it('filters rows and returns status counts', () => {
    expect(filterTagResults(rows, 'possibleDuplicate', 'all')).toEqual([rows[2], rows[3]])
    expect(filterTagResults(rows, 'all', 'House')).toEqual([rows[2]])
    expect(tagResultCounts(rows)).toEqual({
      all: 4,
      ok: 2,
      review: 1,
      duplicate: 1,
      possibleDuplicate: 1,
    })
  })

  it('changes genres in a batch and preserves duplicate protection', () => {
    const changed = changeTagGenre(rows, ['/music/b.mp3', '/music/c.mp3'], 'House', '/out')
    expect(changed[1]).toMatchObject({
      genre: 'House',
      status: 'ok',
      destination: '/out/House/b.mp3',
    })
    expect(changed[2]).toMatchObject({
      genre: 'House',
      status: 'duplicate',
      destination: '/out/House/c.mp3',
    })
    expect(buildClassifyMoves(changed)).toHaveLength(2)
  })
})
