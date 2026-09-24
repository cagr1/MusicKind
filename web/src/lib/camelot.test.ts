import { describe, expect, it } from 'vitest'
import { getHarmonicMatches, normalizeCamelot } from './camelot'

describe('camelot utilities', () => {
  it('normalizes valid Camelot and musical keys', () => {
    expect(normalizeCamelot(' 8a ')).toBe('8A')
    expect(normalizeCamelot('Am')).toBe('8A')
    expect(normalizeCamelot('Amin')).toBe('8A')
    expect(normalizeCamelot('A minor')).toBe('8A')
    expect(normalizeCamelot('A Minor')).toBe('8A')
    expect(normalizeCamelot('Amaj')).toBe('11B')
    expect(normalizeCamelot('A major')).toBe('11B')
    expect(normalizeCamelot('A')).toBe('11B')
    expect(normalizeCamelot('F#m')).toBe('11A')
    expect(normalizeCamelot('Gbm')).toBe('11A')
    expect(normalizeCamelot('Dbm')).toBe('12A')
    expect(normalizeCamelot('C#maj')).toBe('3B')
    expect(normalizeCamelot('C#')).toBe('3B')
    expect(normalizeCamelot('Bb')).toBe('6B')
    expect(normalizeCamelot('08A')).toBe('8A')
    expect(normalizeCamelot('12B')).toBe('12B')
  })

  it('returns null for missing or invalid keys', () => {
    expect(normalizeCamelot(null)).toBeNull()
    expect(normalizeCamelot('unknown')).toBeNull()
    expect(normalizeCamelot('')).toBeNull()
    expect(normalizeCamelot('13A')).toBeNull()
    expect(normalizeCamelot('xyz')).toBeNull()
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
