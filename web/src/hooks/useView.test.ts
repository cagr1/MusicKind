import { describe, expect, it } from 'vitest'
import { parseHash, viewToHash } from './useView'

describe('parseHash', () => {
  it('maps a valid hash to its view', () => {
    expect(parseHash('#/converter')).toBe('converter')
    expect(parseHash('#/stems')).toBe('stems')
  })

  it('defaults to classifier for an empty hash', () => {
    expect(parseHash('')).toBe('classifier')
    expect(parseHash('#/')).toBe('classifier')
    expect(parseHash('#')).toBe('classifier')
  })

  it('defaults to classifier for an unknown view', () => {
    expect(parseHash('#/does-not-exist')).toBe('classifier')
  })
})

describe('viewToHash', () => {
  it('formats a view key as a hash route', () => {
    expect(viewToHash('bpm')).toBe('#/bpm')
  })
})
