import { afterEach, describe, expect, it, vi } from 'vitest'
import { createStemAudioController } from './Stems'

class FakeAudio {
  currentTime = 0
  volume = 1
  src = ''
  paused = true
  load = vi.fn()
  pause = vi.fn(() => {
    this.paused = true
  })
  play = vi.fn(async () => {
    this.paused = false
  })
}

afterEach(() => vi.restoreAllMocks())

describe('createStemAudioController', () => {
  it('applies per-lane volume and mute/solo state to all audio elements', () => {
    const audio = [new FakeAudio(), new FakeAudio(), new FakeAudio()]
    const controller = createStemAudioController(audio as unknown as HTMLAudioElement[])

    expect(audio.map((element) => element.volume)).toEqual([0.85, 1, 0.9])
    controller.setMute('original', true)
    expect(audio[0].volume).toBe(0)
    controller.setSolo('vocals', true)
    expect(audio.map((element) => element.volume)).toEqual([0, 1, 0])
    controller.setSolo('vocals', false)
    controller.setVolume('instrumental', 40)
    expect(audio[2].volume).toBe(0.4)
  })

  it('re-synchronizes every lane when seeking', () => {
    const audio = [new FakeAudio(), new FakeAudio(), new FakeAudio()]
    const controller = createStemAudioController(audio as unknown as HTMLAudioElement[])

    controller.seek(42.5)

    expect(audio.map((element) => element.currentTime)).toEqual([42.5, 42.5, 42.5])
  })
})
