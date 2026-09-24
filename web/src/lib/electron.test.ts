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

describe('installChromaprint', () => {
  it('returns a safe failure in a plain browser', async () => {
    const original = window.electronAPI
    delete window.electronAPI
    await expect(electron.installChromaprint()).resolves.toEqual({
      success: false,
      error: 'not-electron',
    })
    window.electronAPI = original
  })

  it('calls the Electron install bridge when available', async () => {
    const original = window.electronAPI
    window.electronAPI = {
      ...({} as NonNullable<typeof window.electronAPI>),
      installChromaprint: vi.fn().mockResolvedValue({ success: true }),
    }
    await expect(electron.installChromaprint()).resolves.toEqual({ success: true })
    expect(window.electronAPI.installChromaprint).toHaveBeenCalledOnce()
    window.electronAPI = original
  })
})
