import { act, createElement, useEffect, useState, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '@/i18n/I18nProvider'
import { ProcessProvider } from '@/lib/process'
import { useProcess } from '@/lib/process'
import { Classifier, genreDistribution, sourceLabelKey, type ClassifierResult } from './Classifier'

vi.mock('@/lib/player', () => ({ usePlayer: () => ({ setQueue: vi.fn(), toggle: vi.fn() }) }))
vi.mock('@/components/music/TrackInspector', () => ({
  TrackInspector: ({
    track,
    children,
  }: {
    track: { title?: string } | null
    children?: ReactNode
  }) => createElement('aside', null, track?.title ?? 'Ninguna pista seleccionada', children),
}))

const result = (genre: string, path: string): ClassifierResult => ({
  id: path,
  path,
  title: path,
  artist: '—',
  bpm: null,
  key: null,
  genre,
  source: null,
  destination: null,
})

function RemountHarness() {
  const { setResult } = useProcess()
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    setResult('classifier-tags', {
      inputRoot: '/music/in',
      destRoot: '/music/out',
      results: [
        {
          path: '/music/in/track.mp3',
          tagGenre: 'House',
          genre: 'House',
          status: 'ok',
          destination: '/music/out/House/track.mp3',
          title: 'Preserved track',
          artist: 'Artist',
        },
        {
          path: '/music/in/selected.mp3',
          tagGenre: 'Techno',
          genre: 'Techno',
          status: 'ok',
          destination: '/music/out/Techno/selected.mp3',
          title: 'Selected track',
          artist: 'DJ',
        },
      ],
      selectedPath: '/music/in/selected.mp3',
      selectedPaths: ['/music/in/track.mp3'],
      statusFilter: 'ok',
      genreFilter: 'House',
    })
    setMounted(true)
  }, [setResult])
  return createElement(
    'div',
    null,
    createElement('button', { onClick: () => setMounted((value) => !value) }, 'remount'),
    mounted ? createElement(Classifier) : null,
  )
}

describe('classifier distribution', () => {
  it('marks the largest genre and returns percentages', () => {
    const distribution = genreDistribution([
      result('House', 'a'),
      result('House', 'b'),
      result('Techno', 'c'),
    ])
    expect(distribution).toMatchObject([
      { genre: 'House', count: 2, majority: true },
      { genre: 'Techno', count: 1, majority: false },
    ])
    expect(distribution[0].percentage).toBeCloseTo(66.67, 2)
  })

  it('returns no invented category for an empty result set', () => {
    expect(genreDistribution([])).toEqual([])
  })
})

describe('classifier source labels', () => {
  it('maps classifier source values to translated keys', () => {
    expect(sourceLabelKey('embedded')).toBe('classifier.sourceLabels.embedded')
    expect(sourceLabelKey('online')).toBe('classifier.sourceLabels.online')
    expect(sourceLabelKey('unmatched')).toBe('classifier.sourceLabels.unmatched')
  })

  it('does not expose unknown source values as raw UI text', () => {
    expect(sourceLabelKey('unexpected')).toBe('classifier.sourceLabels.unmatched')
  })
})

describe('classifier simulation switch', () => {
  it("renders the thumb with data-state='checked'", async () => {
    HTMLElement.prototype.scrollIntoView = vi.fn()
    const fetchMock = vi.fn((path: string) =>
      Promise.resolve({
        ok: true,
        json: async () => {
          if (path === '/api/genres') return { genres: [] }
          if (path === '/api/genre-aliases') return { canonical: ['Tech House'] }
          return { settings: {} }
        },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const container = document.createElement('div')
    const root = createRoot(container)

    await act(async () => {
      root.render(
        createElement(
          I18nProvider,
          null,
          createElement(ProcessProvider, null, createElement(Classifier)),
        ),
      )
    })

    const method = container.querySelector<HTMLButtonElement>('button[aria-label="Método"]')
    expect(method?.textContent).toContain('etiquetas')
    await act(async () => {
      method?.click()
    })
    const legacyOption = Array.from(document.body.querySelectorAll('[role="option"]')).find(
      (item) => item.textContent?.includes('reglas online'),
    )
    expect(legacyOption).not.toBeUndefined()
    await act(async () => {
      legacyOption?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(container.querySelector('button[aria-label="Método"]')?.textContent).toContain(
      'reglas online',
    )
    root.unmount()
    vi.unstubAllGlobals()
  })
})

describe('tag classifier in-memory state', () => {
  it('restores results, filters, and selection after unmounting', async () => {
    HTMLElement.prototype.scrollIntoView = vi.fn()
    vi.stubGlobal(
      'fetch',
      vi.fn((path: string) =>
        path === '/api/classify-by-tags'
          ? Promise.resolve(
              new Response(
                'data: {"type":"result","results":[]}\n\ndata: {"type":"complete","success":true}\n\n',
              ),
            )
          : Promise.resolve({
              ok: true,
              json: async () => (path === '/api/genre-aliases' ? { canonical: ['House'] } : {}),
            }),
      ),
    )
    const container = document.createElement('div')
    const root = createRoot(container)
    await act(async () =>
      root.render(
        createElement(
          I18nProvider,
          null,
          createElement(ProcessProvider, null, createElement(RemountHarness)),
        ),
      ),
    )
    await act(async () => Promise.resolve())
    expect(container.textContent).toContain('2 pistas')
    await act(async () => container.querySelector('button')?.click())
    await act(async () => container.querySelector('button')?.click())
    expect(container.textContent).toContain('2 pistas')
    expect(container.querySelector('[aria-label="Filtrar por estado"]')?.textContent).toContain(
      'Propuesto',
    )
    expect(container.querySelector('[aria-label="Filtrar por género"]')?.textContent).toContain(
      'House',
    )
    expect(container.querySelector('aside')?.textContent).toContain('Selected track')
    await act(async () => {
      const analyze = Array.from(container.querySelectorAll('button')).find((button) =>
        button.textContent?.includes('Analizar'),
      )
      analyze?.click()
    })
    await act(async () => Promise.resolve())
    expect(container.textContent).toContain('0 pistas')
    await act(async () => root.unmount())
    vi.unstubAllGlobals()
  })
})
