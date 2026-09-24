import { describe, expect, it } from 'vitest'
import { isValidBpmInput } from './Bpm'

describe('BPM input validation', () => {
  it.each(['19', '301', '12.5', 'abc'])('rejects %s', (value) => {
    expect(isValidBpmInput(value)).toBe(false)
  })

  it('accepts 128', () => {
    expect(isValidBpmInput('128')).toBe(true)
  })
})
