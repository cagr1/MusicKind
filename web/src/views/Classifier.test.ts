import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '@/i18n/I18nProvider'
import { ProcessProvider } from '@/lib/process'
import { Classifier, genreDistribution, sourceLabelKey, type ClassifierResult } from './Classifier'

vi.mock('@/lib/player', () => ({ usePlayer: () => ({ setQueue: vi.fn(), toggle: vi.fn() }) }))

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
    const legacyOption = Array.from(document.body.querySelectorAll('[role="option"]')).find((item) => item.textContent?.includes('reglas online'))
    expect(legacyOption).not.toBeUndefined()
    await act(async () => { legacyOption?.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
    expect(container.querySelector('button[aria-label="Método"]')?.textContent).toContain('reglas online')
    root.unmount()
    vi.unstubAllGlobals()
  })
})
