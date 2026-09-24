import { afterEach, describe, expect, it, vi } from 'vitest'
import { createStemAudioController, createStemSeparationRequest } from './Stems'

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
  it('applies per-lane volume, mute, exclusive listening and additive listening', () => {
    const audio = [new FakeAudio(), new FakeAudio(), new FakeAudio()]
    const controller = createStemAudioController(audio as unknown as HTMLAudioElement[])

    expect(audio.map((element) => element.volume)).toEqual([0, 1, 0])
    controller.setMute('original', true)
    expect(audio[0].volume).toBe(0)
    controller.setAudible('vocals', true)
    expect(audio.map((element) => element.volume)).toEqual([0, 1, 0])
    controller.setMute('original', false)
    controller.setAudible('original', true, true)
    expect(audio.map((element) => element.volume)).toEqual([0.85, 1, 0])
    controller.setAudible('original', true)
    expect(audio.map((element) => element.volume)).toEqual([0.85, 0, 0])
    controller.setVolume('instrumental', 40)
    controller.setAudible('instrumental', true, true)
    expect(audio[2].volume).toBe(0.4)
  })

  it('re-synchronizes every lane when seeking', () => {
    const audio = [new FakeAudio(), new FakeAudio(), new FakeAudio()]
    const controller = createStemAudioController(audio as unknown as HTMLAudioElement[])

    controller.seek(42.5)

    expect(audio.map((element) => element.currentTime)).toEqual([42.5, 42.5, 42.5])
  })

  it('starts with one audible lane and applies additive listening and lane volumes', () => {
    const audio = [new FakeAudio(), new FakeAudio(), new FakeAudio()]
    const controller = createStemAudioController(audio as unknown as HTMLAudioElement[])
    expect(audio.map((element) => element.volume)).toEqual([0, 1, 0])
    controller.setAudible('instrumental', true, true)
    controller.setVolume('instrumental', 40)
    expect(audio.map((element) => element.volume)).toEqual([0, 1, 0.4])
  })

  it('sends the selected separation option to the API', () => {
    expect(createStemSeparationRequest('/music/a.mp3', '/out', 'instrumental', 'mp3')).toEqual({
      files: ['/music/a.mp3'],
      outputDir: '/out',
      stems: 'instrumental',
      format: 'mp3',
    })
  })
})
