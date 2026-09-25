import { describe, expect, it } from 'vitest'
import { defaultSetPlaylistSections } from './set-playlists'

describe('defaultSetPlaylistSections', () => {
  it('selects only available defaults for each set section', () => {
    expect(defaultSetPlaylistSections(['Deep House', 'Tech House', 'House', 'Minimal'])).toEqual({
      warmup: ['Deep House'],
      peak: ['Tech House'],
      closing: ['House'],
    })
  })
})
