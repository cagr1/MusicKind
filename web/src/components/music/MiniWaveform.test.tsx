import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '@/i18n/I18nProvider'
import { MiniWaveform } from './MiniWaveform'

afterEach(() => vi.unstubAllGlobals())

describe('MiniWaveform', () => {
  it('renders a flat line and caches the failure when waveform loading fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    const container = document.createElement('div')
    const root = createRoot(container)

    await act(async () => {
      root.render(
        createElement(I18nProvider, null, createElement(MiniWaveform, { path: '/music/song.mp3' })),
      )
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(container.querySelector('line')).not.toBeNull()
    expect(container.querySelector('[data-slot="skeleton"]')).toBeNull()

    await act(async () => {
      root.render(
        createElement(I18nProvider, null, createElement(MiniWaveform, { path: '/music/song.mp3' })),
      )
    })

    expect(fetch).toHaveBeenCalledTimes(1)
    root.unmount()
  })
})
