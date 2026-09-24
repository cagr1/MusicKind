export type ListKey<T> = (item: T) => string

export function mergeUnique<T>(current: T[], incoming: T[], getKey: ListKey<T>): T[] {
  const seen = new Set(current.map(getKey))
  const merged = [...current]
  for (const item of incoming) {
    const key = getKey(item)
    if (seen.has(key)) continue
    seen.add(key)
    merged.push(item)
  }
  return merged
}

export function pendingItems<T, U>(
  items: T[],
  completed: U[],
  getItemKey: ListKey<T>,
  getCompletedKey?: ListKey<U>,
): T[] {
  const completedKeys = new Set(
    completed.map(getCompletedKey ?? (getItemKey as unknown as ListKey<U>)),
  )
  return items.filter((item) => !completedKeys.has(getItemKey(item)))
}

export function appendResults<T>(current: T[], results: T[], getKey: ListKey<T>): T[] {
  const next = [...current]
  const indexes = new Map(current.map((item, index) => [getKey(item), index]))
  for (const result of results) {
    const key = getKey(result)
    const index = indexes.get(key)
    if (index === undefined) {
      indexes.set(key, next.length)
      next.push(result)
    } else {
      next[index] = result
    }
  }
  return next
}
