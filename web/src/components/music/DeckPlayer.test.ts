import { describe, expect, it } from 'vitest'
import { deckBpmLabel, waveformSeekTime } from './DeckPlayer'

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
})
