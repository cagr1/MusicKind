import { act, createElement, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '@/i18n/I18nProvider'
import { Bpm, getBpmInputLabel, isValidBpmInput } from './Bpm'

const { toastMock, setActiveMock, setResultMock, processResult } = vi.hoisted(() => ({
  toastMock: vi.fn(),
  setActiveMock: vi.fn(),
  setResultMock: vi.fn(),
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
  getJson: vi.fn(async () => ({ metadata: {} })),
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
vi.mock('@/hooks/useView', () => ({ useView: () => ({ view: 'bpm' }) }))
vi.mock('@/lib/process', () => ({
  useProcess: () => ({ results: {}, setActive: setActiveMock, setResult: setResultMock }),
}))
vi.mock('@/components/music/MiniWaveform', () => ({ MiniWaveform: () => null }))
vi.mock('@/components/music/TrackInspector', () => ({
  TrackInspector: ({ children }: { children: ReactNode }) => children,
}))

beforeEach(() => {
  toastMock.mockClear()
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

describe('BPM input source label', () => {
  it('shows the selected folder name', () => {
    expect(getBpmInputLabel('/Music/Sets/House', 12, 'files')).toBe('House')
  })

  it('shows the localized file count for loose files', () => {
    expect(getBpmInputLabel(null, 3, 'archivos')).toBe('3 archivos')
  })
})

describe('BPM row selection', () => {
  it('removes two selected rows and shows an undo toast', async () => {
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
