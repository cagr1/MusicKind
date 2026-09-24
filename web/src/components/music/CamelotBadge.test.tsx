import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import { I18nProvider } from '@/i18n/I18nProvider'
import { TooltipProvider } from '@/components/ui/tooltip'
import { CamelotBadge } from './CamelotBadge'

afterEach(() => document.body.replaceChildren())

describe('CamelotBadge', () => {
  it('adds a dashed border for analyzed keys and not tagged keys', () => {
    const container = document.createElement('div')
    const root = createRoot(container)

    act(() => {
      root.render(
        createElement(
          TooltipProvider,
          null,
          createElement(
            I18nProvider,
            null,
            createElement(CamelotBadge, { camelotKey: '8A', keySource: 'analysis' }),
          ),
        ),
      )
    })

    const analysisBadge = container.querySelector('[class*="border-dashed"]')
    expect(analysisBadge).not.toBeNull()
    expect(analysisBadge?.classList.contains('border')).toBe(true)
    expect(analysisBadge?.classList.contains('border-dashed')).toBe(true)
    expect((analysisBadge as HTMLElement)?.style.borderColor).toBe('rgba(239, 68, 68, 0.6)')

    act(() => {
      root.render(
        createElement(
          TooltipProvider,
          null,
          createElement(
            I18nProvider,
            null,
            createElement(CamelotBadge, { camelotKey: '8A', keySource: 'tag' }),
          ),
        ),
      )
    })

    const taggedBadge = container.firstElementChild
    expect(taggedBadge?.classList.contains('border-dashed')).toBe(false)
    expect(taggedBadge?.classList.contains('border')).toBe(false)

    root.unmount()
  })
})
