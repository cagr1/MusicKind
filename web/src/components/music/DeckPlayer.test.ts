import { describe, expect, it } from 'vitest'
import { deckBpmLabel, waveformPeakIndex, waveformSeekTime } from './DeckPlayer'

describe('deckBpmLabel', () => {
  it('rounds BPM to an integer and shows a dash when missing', () => {
    expect(deckBpmLabel(127.6)).toBe('128')
    expect(deckBpmLabel(127.4)).toBe('127')
    expect(deckBpmLabel(null)).toBe('—')
  })
})

describe('waveformSeekTime', () => {
  it('maps a click to track time and clamps clicks outside the waveform', () => {
    expect(waveformSeekTime(150, 100, 200, 80)).toBe(20)
    expect(waveformSeekTime(50, 100, 200, 80)).toBe(0)
    expect(waveformSeekTime(400, 100, 200, 80)).toBe(80)
  })

  it('keeps the visible peak and seek position aligned at any container width', () => {
    const peakCount = 400
    const left = 20
    const width = 300
    const x = left + width / 2

    expect(waveformPeakIndex(x, left, width, peakCount)).toBe(200)
    expect(waveformSeekTime(x, left, width, 80)).toBe(40)
  })
})
