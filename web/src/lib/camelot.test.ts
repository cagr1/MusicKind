import { describe, expect, it } from 'vitest'
import { getHarmonicMatches, normalizeCamelot } from './camelot'

describe('camelot utilities', () => {
  it('normalizes valid Camelot and musical keys', () => {
    expect(normalizeCamelot(' 8a ')).toBe('8A')
    expect(normalizeCamelot('Am')).toBe('8A')
  })

  it('returns null for missing or invalid keys', () => {
    expect(normalizeCamelot(null)).toBeNull()
    expect(normalizeCamelot('unknown')).toBeNull()
  })

  it('returns exact, relative and energy neighbours', () => {
    const matches = getHarmonicMatches('12b')
    expect(matches.exact).toBe('12B')
    expect(matches.relative).toBe('12A')
    expect(matches.minusOne).toBe('11B')
    expect(matches.plusOne).toBe('1B')
    expect(matches.compatibleSet).toEqual(new Set(['12B', '12A', '11B', '1B']))
  })

  it('returns no matches without a key', () => {
    expect(getHarmonicMatches(null)).toEqual({
      exact: null,
      relative: null,
      minusOne: null,
      plusOne: null,
      compatibleSet: new Set(),
    })
  })
})
