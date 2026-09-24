import { act, createElement, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it } from 'vitest'
import { ProcessProvider, useProcess } from './process'

function View() {
  const { results } = useProcess()
  return createElement(
    'div',
    { 'data-result': JSON.stringify(results.bpm ?? null) },
    'view',
  )
}

function Harness() {
  const { setResult } = useProcess()
  const [mounted, setMounted] = useState(true)

  useEffect(() => {
    setResult('bpm', [{ id: 'track-a' }])
  }, [setResult])

  return createElement(
    'div',
    null,
    createElement('button', { onClick: () => setMounted((value) => !value) }),
    mounted ? createElement(View) : null,
  )
}

describe('ProcessProvider', () => {
  it('keeps view results when the view component is removed and mounted again', async () => {
    const container = document.createElement('div')
    const root = createRoot(container)

    await act(async () => {
      root.render(createElement(ProcessProvider, null, createElement(Harness)))
    })

    const button = container.querySelector('button')
    await act(async () => {
      button?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(container.querySelector('[data-result]')).toBeNull()

    await act(async () => {
      button?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(container.querySelector('[data-result]')?.getAttribute('data-result')).toContain(
      'track-a',
    )
    root.unmount()
  })
})
