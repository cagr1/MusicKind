import * as React from 'react'
import { NAV_ITEMS, type NavKey } from '@/lib/nav'

const VIEW_KEYS = NAV_ITEMS.map((item) => item.key)
const DEFAULT_VIEW: NavKey = 'classifier'

function isNavKey(value: string): value is NavKey {
  return (VIEW_KEYS as string[]).includes(value)
}

export function parseHash(hash: string): NavKey {
  const raw = hash.replace(/^#\/?/, '').trim()
  return isNavKey(raw) ? raw : DEFAULT_VIEW
}

export function viewToHash(view: NavKey): string {
  return `#/${view}`
}

export function useView(): { view: NavKey; setView: (view: NavKey) => void } {
  const [view, setViewState] = React.useState<NavKey>(() =>
    typeof window === 'undefined' ? DEFAULT_VIEW : parseHash(window.location.hash)
  )

  React.useEffect(() => {
    const onHashChange = () => setViewState(parseHash(window.location.hash))
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  const setView = React.useCallback((next: NavKey) => {
    if (typeof window !== 'undefined') {
      window.location.hash = viewToHash(next)
    }
    setViewState(next)
  }, [])

  return { view, setView }
}
