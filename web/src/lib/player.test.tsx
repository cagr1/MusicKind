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

  it('starts playback on row double click and exposes the playing state', async () => {
    const instance = new FakeAudio()
    vi.stubGlobal(
      'Audio',
      class {
        constructor() {
          return instance
        }
      },
    )
    let api: ReturnType<typeof usePlayer> | undefined
    function Harness() {
      api = usePlayer()
      return createElement('div', { role: 'row', onDoubleClick: () => api?.toggle('/a') })
    }
    const host = document.createElement('div')
    const root = createRoot(host)
    await act(async () => {
      root.render(createElement(PlayerProvider, null, createElement(Harness)))
    })
    await act(async () => {
      host
        .querySelector('[role="row"]')
        ?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))
      await Promise.resolve()
    })
    expect(instance.play).toHaveBeenCalledOnce()
    expect(api?.playing).toBe(true)
    root.unmount()
  })

  it('keeps playback active when advancing to the next track', async () => {
    const instance = new FakeAudio()
    vi.stubGlobal(
      'Audio',
      class {
        constructor() {
          return instance
        }
      },
    )
    let api: ReturnType<typeof usePlayer> | undefined
    function Harness() {
      api = usePlayer()
      return null
    }
    const root = createRoot(document.createElement('div'))
    await act(async () => {
      root.render(createElement(PlayerProvider, null, createElement(Harness)))
    })
    await act(async () => {
      api?.setQueue([
        { path: '/a', title: 'A', artist: 'Artist', bpm: 120, key: '8A' },
        { path: '/b', title: 'B', artist: 'Artist', bpm: 121, key: '9A' },
      ])
      api?.toggle('/a')
      await Promise.resolve()
    })
    await act(async () => {
      api?.next()
      await Promise.resolve()
    })
    expect(api?.path).toBe('/b')
    expect(api?.playing).toBe(true)
    expect(instance.play).toHaveBeenCalledTimes(2)
    root.unmount()
  })

  it('keeps previous and next inside the current queue bounds', async () => {
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
    let api: ReturnType<typeof usePlayer> | undefined
    function Harness() {
      api = usePlayer()
      return null
    }
    const root = createRoot(document.createElement('div'))
    await act(async () => {
      root.render(createElement(PlayerProvider, null, createElement(Harness)))
    })
    await act(async () => {
      api?.setQueue([
        { path: '/a', title: 'A', artist: 'Artist', bpm: 120, key: '8A' },
        { path: '/b', title: 'B', artist: 'Artist', bpm: 121, key: '9A' },
      ])
      api?.toggle('/a')
    })
    await act(async () => {
      api?.previous()
    })
    expect(api?.path).toBe('/a')
    await act(async () => {
      api?.next()
    })
    expect(api?.path).toBe('/b')
    await act(async () => {
      api?.next()
    })
    expect(api?.path).toBe('/b')
    expect(instances).toHaveLength(1)
    root.unmount()
  })

  it('ignores playback shortcuts while an input has focus', async () => {
    const instance = new FakeAudio()
    vi.stubGlobal(
      'Audio',
      class {
        constructor() {
          return instance
        }
      },
    )
    let toggle: ((path?: string) => void) | undefined
    function Harness() {
      toggle = usePlayer().toggle
      return null
    }
    const host = document.createElement('div')
    const input = document.createElement('input')
    host.append(input)
    const root = createRoot(host)
    await act(async () => {
      root.render(createElement(PlayerProvider, null, createElement(Harness)))
    })
    await act(async () => {
      toggle?.('/a')
    })
    instance.play.mockClear()
    await act(async () => {
      input.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', bubbles: true }))
    })
    expect(instance.play).not.toHaveBeenCalled()
    root.unmount()
  })
})
