import { describe, expect, it } from 'vitest'
import { energyPath, groupSetResults, type SetResult } from './Sets'

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
  it('groups only tracks with a best section and calculates BPM bounds', () => {
    expect(
      groupSetResults([result('warmup', 121), result('warmup', 124), result(null, null)]),
    ).toEqual([{ key: 'warmup', tracks: expect.any(Array), minBpm: 121, maxBpm: 124 }])
  })

  it('builds an energy path without inventing a score for null sections', () => {
    expect(energyPath([result('warmup', 120), result(null, null)])).toBe('M 24 20 L 616 52')
    expect(energyPath([])).toBe('')
  })
})
