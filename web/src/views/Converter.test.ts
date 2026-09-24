import { describe, expect, it } from 'vitest'
import {
  formatBytes,
  shouldContinueAfterResult,
  summarizeConversionResults,
  type ConverterResult,
} from './Converter'

const result = (sizeIn: number, sizeOut: number | null): ConverterResult => ({
  ok: sizeOut !== null,
  input: '/music/input.mp3',
  output: '/music/output.wav',
  format: 'wav',
  bitrate: null,
  sizeIn,
  sizeOut,
})

describe('converter summaries', () => {
  it('sums input and successful output sizes', () => {
    expect(summarizeConversionResults([result(1024, 2048), result(4096, null)])).toEqual({
      count: 2,
      sizeIn: 5120,
      sizeOut: 2048,
    })
  })

  it('formats sizes using readable units', () => {
    expect(formatBytes(1024 * 1024)).toBe('1.0 MB')
    expect(formatBytes(1024 * 1024 * 1024 * 1.2)).toBe('1.2 GB')
    expect(formatBytes(null)).toBe('—')
  })

  it('stops after a missing or failed terminal result', () => {
    expect(shouldContinueAfterResult([])).toBe(false)
    expect(shouldContinueAfterResult([{ ok: false }])).toBe(false)
    expect(shouldContinueAfterResult([{ ok: true }])).toBe(true)
    expect(shouldContinueAfterResult(null)).toBe(false)
  })
})
