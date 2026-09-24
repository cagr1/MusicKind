import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '@/i18n/I18nProvider'
import { PlayerProvider, usePlayer } from '@/lib/player'
import { LargeWaveform } from './LargeWaveform'

vi.mock('@/lib/api', () => ({
  getJson: vi.fn(async () => ({ peaks: [0.2, 0.6, 0.4], duration: 60 })),
}))

class FakeAudio {
  paused = true
  currentTime = 0
  duration = 60
  src = ''
  pause = vi.fn(() => {
    this.paused = true
  })
  load = vi.fn()
  play = vi.fn(async () => {
    this.paused = false
  })
  addEventListener = vi.fn()
  removeEventListener = vi.fn()
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('LargeWaveform', () => {
  it('does not pause shared playback when the Inspector changes tracks', async () => {
    const audio = new FakeAudio()
    vi.stubGlobal(
      'Audio',
      class {
        constructor() {
          return audio
        }
      },
    )
    let toggle: ReturnType<typeof usePlayer>['toggle'] | undefined
    function Harness({ path }: { path: string }) {
      toggle = usePlayer().toggle
      return createElement(LargeWaveform, { path })
    }
    const host = document.createElement('div')
    const root = createRoot(host)
    const render = (path: string) =>
      createElement(
        I18nProvider,
        null,
        createElement(PlayerProvider, null, createElement(Harness, { path })),
      )

    await act(async () => root.render(render('/music/a.mp3')))
    await act(async () => {
      toggle?.('/music/a.mp3')
      await Promise.resolve()
    })
    expect(audio.play).toHaveBeenCalledOnce()
    audio.pause.mockClear()

    await act(async () => root.render(render('/music/b.mp3')))
    await act(async () => await Promise.resolve())

    expect(audio.pause).not.toHaveBeenCalled()
    expect(host.querySelector('svg rect')).not.toBeNull()
    await act(async () => root.unmount())
  })
})
