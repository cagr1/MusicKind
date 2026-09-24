import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import { TrackArtwork } from './TrackArtwork'

afterEach(() => document.body.replaceChildren())

describe('TrackArtwork', () => {
  it('uses the artwork endpoint and falls back to the Camelot placeholder on image error', () => {
    const container = document.createElement('div')
    const root = createRoot(container)
    act(() =>
      root.render(createElement(TrackArtwork, { path: '/music/track.mp3', camelotKey: '8A' })),
    )

    const image = container.querySelector('img')
    expect(image?.getAttribute('src')).toBe('/api/artwork?path=%2Fmusic%2Ftrack.mp3')
    expect(image?.getAttribute('loading')).toBe('lazy')
    act(() => image?.dispatchEvent(new Event('error')))

    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelector('svg')).not.toBeNull()
    root.unmount()
  })
})
