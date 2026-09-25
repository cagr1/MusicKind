import { describe, expect, it } from 'vitest'
import { groupSetResults, mergeTrackMetadata, type SetResult } from './Sets'

const result = (best: SetResult['best'], bpm: number | null): SetResult => ({
  file: `/music/${best ?? 'unknown'}.wav`,
  warmup: best === 'warmup' ? 80 : null,
  peak: best === 'peak' ? 70 : null,
  closing: best === 'closing' ? 60 : null,
  best,
  bpm,
  camelot: null,
})

describe('set analysis helpers', () => {
  it('keeps analyzed BPM and does not replace track metadata with empty values', () => {
    const track = {
      ...result('warmup', 129.2),
      camelot: '8A',
      title: 'Analyzed title',
      artist: 'Analyzed artist',
    }

    expect(mergeTrackMetadata(track, { title: '', artist: '   ', bpm: null, key: null })).toEqual(
      track,
    )
  })

  it('groups assigned sections and keeps unmatched, ties, and errors for review', () => {
    const unmatched = { ...result(null, null), review: 'all-zero' as const }
    const tied = { ...result(null, 128), review: 'tie' as const }
    const failed = { ...result(null, null), error: 'decode failed' }
    expect(
      groupSetResults([result('warmup', 121), result('warmup', 124), unmatched, tied, failed]),
    ).toEqual([
      { key: 'warmup', tracks: expect.any(Array), minBpm: 121, maxBpm: 124 },
      { key: 'review', tracks: [unmatched, tied, failed], minBpm: null, maxBpm: null },
    ])
  })
})
