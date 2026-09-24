import * as React from 'react'
import { toast } from 'sonner'
import { rangeKeys, selectionState } from './list'

export function useRowSelection<T>({
  items,
  getKey,
  isProtected = () => false,
  onRemove,
  onClear,
  onRestore,
  removeLabel,
  clearLabel,
  undoLabel,
}: {
  items: T[]
  getKey: (item: T) => string
  isProtected?: (item: T) => boolean
  onRemove: (keys: string[]) => void
  onClear: () => void
  onRestore: () => void
  removeLabel: string
  clearLabel: string
  undoLabel: string
}) {
  const [selected, setSelected] = React.useState<string[]>([])
  const [anchor, setAnchor] = React.useState<string | null>(null)
  const keys = React.useMemo(() => items.map(getKey), [items, getKey])
  const available = React.useMemo(
    () => items.filter((item) => !isProtected(item)).map(getKey),
    [items, isProtected, getKey],
  )
  React.useEffect(
    () =>
      setSelected((current) => {
        const next = current.filter((key) => keys.includes(key))
        return next.length === current.length ? current : next
      }),
    [keys],
  )

  const toggle = React.useCallback(
    (key: string, shiftKey = false) => {
      setSelected((current) => {
        if (shiftKey && anchor) {
          return Array.from(new Set([...current, ...rangeKeys(items, anchor, key, getKey)]))
        }
        return current.includes(key) ? current.filter((item) => item !== key) : [...current, key]
      })
      setAnchor(key)
    },
    [anchor, getKey, items],
  )

  const toggleAll = React.useCallback(() => {
    setSelected((current) => (current.length === available.length ? [] : available))
  }, [available])

  const remove = React.useCallback(
    (keysToRemove = selected) => {
      if (!keysToRemove.length) return
      onRemove(keysToRemove)
      setSelected([])
      toast(removeLabel, { action: { label: undoLabel, onClick: onRestore } })
    },
    [onRemove, onRestore, removeLabel, selected, undoLabel],
  )

  const clear = React.useCallback(() => {
    if (!items.length) return
    onClear()
    setSelected([])
    toast(clearLabel, { action: { label: undoLabel, onClick: onRestore } })
  }, [clearLabel, items.length, onClear, onRestore, undoLabel])

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
        return
      if ((event.key === 'Delete' || event.key === 'Backspace') && selected.length) {
        event.preventDefault()
        remove()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [remove, selected.length])

  return {
    selected,
    setSelected,
    toggle,
    toggleAll,
    remove,
    clear,
    ...selectionState(selected, available),
    available,
  }
}
