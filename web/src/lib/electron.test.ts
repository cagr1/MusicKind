import { describe, expect, it, vi } from 'vitest'
import { electron, getDroppedFilePath, resolveDroppedFiles } from './electron'

describe('getDroppedFilePath', () => {
  it('uses the Electron bridge when File.path is absent', async () => {
    vi.spyOn(electron, 'getPathForFile').mockResolvedValue('/Music/song.mp3')
    await expect(getDroppedFilePath(new File(['audio'], 'song.mp3'))).resolves.toBe(
      '/Music/song.mp3',
    )
  })

  it('rejects a basename instead of sending it to the backend', async () => {
    vi.spyOn(electron, 'getPathForFile').mockResolvedValue('')
    await expect(getDroppedFilePath(new File(['audio'], 'song.mp3'))).rejects.toThrow('absolute')
  })

  it('resolves every dropped file to an absolute path', async () => {
    vi.spyOn(electron, 'getPathForFile').mockImplementation(async (file) => `/Music/${file.name}`)
    const files = [new File(['a'], 'one.mp3'), new File(['b'], 'two.wav')]
    await expect(resolveDroppedFiles(files)).resolves.toEqual(['/Music/one.mp3', '/Music/two.wav'])
  })
})
