import { describe, expect, it } from 'vitest'
import {
  buildClassifyMoves,
  changeTagGenre,
  filterTagResults,
  tagResultCounts,
  canonicalTagDistribution,
  mergeTrackMetadata,
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
    tagGenre: 'Dance',
    genre: 'Dance Pop',
    status: 'ok',
    destination: '/out/Dance Pop/d.mp3',
  },
]

describe('tag classifier view logic', () => {
  it('builds moves only from proposed rows and respects corrected genres', () => {
    const corrected = changeTagGenre(rows, ['/music/a.mp3'], 'House', '/out')
    expect(buildClassifyMoves(corrected)).toEqual([
      { from: '/music/a.mp3', to: '/out/House/a.mp3' },
      { from: '/music/c.mp3', to: '/out/Dance Pop/d.mp3' },
    ])
  })

  it('filters rows and returns status counts', () => {
    expect(filterTagResults(rows, 'review', 'all')).toEqual([rows[1]])
    expect(filterTagResults(rows, 'all', 'House')).toEqual([])
    expect(tagResultCounts(rows)).toEqual({
      all: 3,
      ok: 2,
      review: 1,
      online: 0,
    })
  })

  it('keeps the back canonical genre when metadata fills track fields', () => {
    const row = { ...rows[1], genre: 'Tech House', status: 'ok' as const, destination: '/out/Tech House/b.mp3' }
    expect(mergeTrackMetadata(row, { title: 'Title', artist: 'Artist', bpm: 124, key: 'Amin' })).toMatchObject({
      title: 'Title', artist: 'Artist', bpm: 124, key: 'Amin', genre: 'Tech House', status: 'ok', destination: '/out/Tech House/b.mp3',
    })
  })

  it('shows only canonical genres and the translated review bucket in the distribution', () => {
    const distribution = canonicalTagDistribution([
      { ...rows[0], genre: 'Tech House' },
      { ...rows[1], genre: 'electronicfresh.com' },
      { ...rows[0], genre: 'House' },
    ], ['Tech House', 'House'], 'Por revisar')
    expect(distribution.map((item) => item.genre)).toEqual(['Tech House', 'Por revisar', 'House'])
  })

  it('filters online proposals independently while still including them in moves', () => {
    const online = { ...rows[0], genreSource: 'discogs' as const, onlineTag: 'deep house' }
    expect(filterTagResults([online], 'online', 'all')).toEqual([online])
    expect(buildClassifyMoves([online])).toEqual([{ from: online.path, to: online.destination }])
    expect(tagResultCounts([online]).online).toBe(1)
  })

  it('changes genres in a batch', () => {
    const changed = changeTagGenre(rows, ['/music/b.mp3'], 'House', '/out')
    expect(changed[1]).toMatchObject({
      genre: 'House',
      status: 'ok',
      destination: '/out/House/b.mp3',
    })
    expect(buildClassifyMoves(changed)).toHaveLength(3)
  })
})
