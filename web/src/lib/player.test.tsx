import { act, createElement, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PlayerProvider, usePlayer } from './player'

class FakeAudio {
  paused = true
  currentTime = 0
  duration = 0
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

afterEach(() => vi.restoreAllMocks())

describe('PlayerProvider', () => {
  it('uses one audio element and pauses track A before playing track B', async () => {
    const instances: FakeAudio[] = []
    vi.stubGlobal(
      'Audio',
      class extends FakeAudio {
        constructor() {
          super()
          instances.push(this)
        }
      },
    )
    let toggle: ((path: string) => void) | undefined

    function Harness() {
      toggle = usePlayer().toggle
      useEffect(() => undefined, [])
      return null
    }

    const root = createRoot(document.createElement('div'))
    await act(async () => {
      root.render(createElement(PlayerProvider, null, createElement(Harness)))
    })
    await act(async () => {
      toggle?.('/music/a.mp3')
      await Promise.resolve()
    })
    await act(async () => {
      toggle?.('/music/b.mp3')
      await Promise.resolve()
    })

    expect(instances).toHaveLength(1)
    expect(instances[0].pause).toHaveBeenCalled()
    expect(instances[0].src).toContain(encodeURIComponent('/music/b.mp3'))
    root.unmount()
  })
})
