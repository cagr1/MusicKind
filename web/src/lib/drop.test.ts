import { describe, expect, it } from 'vitest'
import { itemsFromPaths, mergeUnique } from './drop'

describe('drop path expansion', () => {
  it('keeps every audio found in a nested folder and tags it with its source root', async () => {
    await expect(
      itemsFromPaths(['/music/album'], async () => [
        '/music/album/one.mp3',
        '/music/album/sub/two.flac',
      ]),
    ).resolves.toEqual([
      { path: '/music/album/one.mp3', root: '/music/album' },
      { path: '/music/album/sub/two.flac', root: '/music/album' },
    ])
  })

  it('treats files as rootless and removes repeated paths when inputs overlap', async () => {
    await expect(
      itemsFromPaths(['/music/one.mp3', '/music/album'], async (path) => {
        if (path === '/music/one.mp3') return [path]
        return ['/music/one.mp3', '/music/two.mp3']
      }),
    ).resolves.toEqual([
      { path: '/music/one.mp3', root: null },
      { path: '/music/two.mp3', root: '/music/album' },
    ])
  })

  it('merges incoming rows without duplicating keys', () => {
    expect(
      mergeUnique(
        [{ path: '/music/one.mp3' }],
        [{ path: '/music/one.mp3' }, { path: '/music/two.mp3' }],
        (item) => item.path,
      ),
    ).toEqual([{ path: '/music/one.mp3' }, { path: '/music/two.mp3' }])
  })
})
