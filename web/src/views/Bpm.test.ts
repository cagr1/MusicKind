import { act, createElement, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '@/i18n/I18nProvider'
import { Bpm, isPendingSave, isValidBpmInput, originalFromResult } from './Bpm'

const {
  toastMock,
  setActiveMock,
  setResultMock,
  getJsonMock,
  openFilesMock,
  openDirectoryMock,
  processResult,
} = vi.hoisted(() => ({
  toastMock: vi.fn(),
  setActiveMock: vi.fn(),
  setResultMock: vi.fn(),
  getJsonMock: vi.fn(async (_url: string): Promise<{ metadata?: object; files?: string[] }> => ({
    metadata: {},
  })),
  openFilesMock: vi.fn(async (): Promise<string[]> => []),
  openDirectoryMock: vi.fn(async (): Promise<string | null> => null),
  processResult: [
    { file: '/music/one.mp3', ok: true, bpm: 120, key: 'Am', camelot: '8A' },
    { file: '/music/two.mp3', ok: true, bpm: 121, key: 'Am', camelot: '8A' },
    { file: '/music/three.mp3', ok: true, bpm: 122, key: 'Am', camelot: '8A' },
    { file: '/music/four.mp3', ok: true, bpm: 123, key: 'Am', camelot: '8A' },
  ],
}))

vi.mock('sonner', () => ({ toast: toastMock }))
vi.mock('@/lib/player', () => ({ usePlayer: () => ({ setQueue: vi.fn(), toggle: vi.fn() }) }))
vi.mock('@/lib/api', () => ({
  getJson: getJsonMock,
  postJson: vi.fn(async () => ({})),
  useProcessStream: () => ({
    state: {
      status: 'done',
      processId: null,
      progress: null,
      logs: [],
      result: processResult,
      error: null,
    },
    run: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    cancel: vi.fn(),
  }),
}))
vi.mock('@/lib/electron', () => ({
  electron: { openFiles: openFilesMock, openDirectory: openDirectoryMock },
  resolveDroppedFiles: vi.fn(async () => []),
}))
vi.mock('@/hooks/useView', () => ({ useView: () => ({ view: 'bpm' }) }))
vi.mock('@/lib/process', () => ({
  useProcess: () => ({ results: {}, setActive: setActiveMock, setResult: setResultMock }),
}))
vi.mock('@/components/music/MiniWaveform', () => ({ MiniWaveform: () => null }))
vi.mock('@/components/music/TrackInspector', () => ({
  InspectorToggle: () => null,
  TrackInspector: ({ children }: { children: ReactNode }) => children,
}))

beforeEach(() => {
  toastMock.mockClear()
  processResult.splice(0, processResult.length)
  getJsonMock.mockReset().mockImplementation(async (_url: string) => ({ metadata: {} }))
  openFilesMock.mockReset().mockResolvedValue([])
  openDirectoryMock.mockReset().mockResolvedValue(null)
  ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })[
    'IS_REACT_ACT_ENVIRONMENT'
  ] = true
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
})

describe('BPM input validation', () => {
  it.each(['19', '301', '12.5', 'abc'])('rejects %s', (value) => {
    expect(isValidBpmInput(value)).toBe(false)
  })

  it('accepts 128', () => {
    expect(isValidBpmInput('128')).toBe(true)
  })
})

describe('BPM save state', () => {
  const result = (values: Record<string, unknown> = {}) =>
    ({
      id: '/music/one.mp3',
      file: '/music/one.mp3',
      path: '/music/one.mp3',
      bpm: 120,
      key: '8A',
      camelot: '8A',
      ok: true,
      title: 'One',
      artist: 'Artist',
      ...values,
    }) as Parameters<typeof originalFromResult>[0]

  it('marks analyzed BPM and key as absent from the file', () => {
    const track = result({ bpmSource: 'analysis', keySource: 'analysis' })
    const original = originalFromResult(track)
    expect(original).toEqual({ bpm: null, key: null })
    expect(isPendingSave(track, { [track.id]: original })).toBe(true)
  })

  it('does not mark unchanged tags as pending', () => {
    const track = result({ bpmSource: 'tag', keySource: 'tag' })
    expect(isPendingSave(track, { [track.id]: originalFromResult(track) })).toBe(false)
  })

  it('marks a manual edit as pending', () => {
    const track = result({ bpmSource: 'tag', keySource: 'tag' })
    expect(isPendingSave({ ...track, bpm: 124 }, { [track.id]: originalFromResult(track) })).toBe(
      true,
    )
  })

  it('clears pending state after saved values become tags', () => {
    const saved = result({ bpmSource: 'tag', keySource: 'tag' })
    expect(isPendingSave(saved, { [saved.id]: originalFromResult(saved) })).toBe(false)
  })
})

async function renderBpm() {
  const container = document.createElement('div')
  const root = createRoot(container)
  await act(async () => {
    root.render(createElement(I18nProvider, null, createElement(Bpm)))
  })
  return { container, root }
}

describe('BPM input queue', () => {
  it('shows multiple selected files as pending before analysis and deduplicates additions', async () => {
    openFilesMock.mockResolvedValue(['/music/one.mp3', '/music/two.mp3'])
    const { container, root } = await renderBpm()

    await act(async () => {
      container.querySelector<HTMLButtonElement>('[aria-label="Agregar archivos"]')?.click()
    })
    expect(container.querySelectorAll('tbody tr')).toHaveLength(2)
    expect(container.textContent).toContain('Pendiente')
    expect(
      Array.from(container.querySelectorAll('button')).some((button) =>
        button.textContent?.includes('Analizar 2'),
      ),
    ).toBe(true)

    await act(async () => {
      container.querySelector<HTMLButtonElement>('[aria-label="Agregar archivos"]')?.click()
    })
    expect(container.querySelectorAll('tbody tr')).toHaveLength(2)
    await act(async () => root.unmount())
  })

  it('expands a chosen folder recursively into pending rows', async () => {
    openDirectoryMock.mockResolvedValue('/music/album')
    getJsonMock.mockImplementation(async (url: string) =>
      url.includes('/api/metadata/list')
        ? { files: ['/music/album/a.mp3', '/music/album/sub/b.mp3'] }
        : { metadata: {} },
    )
    const { container, root } = await renderBpm()

    await act(async () => {
      container.querySelector<HTMLElement>('[role="button"]')?.click()
    })
    expect(container.querySelectorAll('tbody tr')).toHaveLength(2)
    expect(container.textContent).toContain('Pendiente')
    expect(
      Array.from(container.querySelectorAll('button')).some((button) =>
        button.textContent?.includes('Analizar 2'),
      ),
    ).toBe(true)
    expect(getJsonMock).toHaveBeenCalledWith(expect.stringContaining('recursive=true'))
    await act(async () => root.unmount())
  })
})

describe('BPM row selection', () => {
  it('removes two selected rows and shows an undo toast', async () => {
    processResult.push(
      { file: '/music/one.mp3', ok: true, bpm: 120, key: 'Am', camelot: '8A' },
      { file: '/music/two.mp3', ok: true, bpm: 121, key: 'Am', camelot: '8A' },
      { file: '/music/three.mp3', ok: true, bpm: 122, key: 'Am', camelot: '8A' },
      { file: '/music/four.mp3', ok: true, bpm: 123, key: 'Am', camelot: '8A' },
    )
    const container = document.createElement('div')
    const root = createRoot(container)

    await act(async () => {
      root.render(createElement(I18nProvider, null, createElement(Bpm)))
    })

    const rowCheckboxes = container.querySelectorAll('tbody [role="checkbox"]')
    expect(rowCheckboxes).toHaveLength(4)
    await act(async () => {
      rowCheckboxes[0].dispatchEvent(new MouseEvent('click', { bubbles: true }))
      rowCheckboxes[1].dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    const removeButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('2 seleccionadas'),
    )
    expect(removeButton).toBeDefined()
    await act(async () => {
      removeButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(container.querySelectorAll('tbody tr')).toHaveLength(2)
    expect(toastMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ action: expect.objectContaining({ label: 'Deshacer' }) }),
    )
    await act(async () => root.unmount())
  })
})
