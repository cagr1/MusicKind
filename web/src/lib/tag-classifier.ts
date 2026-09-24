export interface TagResult {
  path: string
  tagGenre: string | null
  genre: string | null
  status: 'ok' | 'review' | 'duplicate'
  reason?: string | null
  possibleDuplicate?: boolean
  destination: string | null
  title?: string
  artist?: string
  bpm?: number | null
  key?: string | null
  genreSource?: 'tag' | 'lastfm' | 'spotify' | null
  onlineTag?: string | null
}

export type TagStatusFilter = 'all' | TagResult['status'] | 'possibleDuplicate' | 'online'

export function buildClassifyMoves(results: TagResult[]) {
  return results
    .filter(
      (result) =>
        result.status === 'ok' && !result.possibleDuplicate && result.genre && result.destination,
    )
    .map((result) => ({ from: result.path, to: result.destination as string }))
}

export function filterTagResults(results: TagResult[], status: TagStatusFilter, genre: string) {
  return results.filter((result) => {
    const statusMatches =
      status === 'all' ||
      (status === 'possibleDuplicate'
        ? result.possibleDuplicate || result.status === 'duplicate'
        : result.status === status)
    const onlineMatches = status === 'online'
      ? result.status === 'ok' && (result.genreSource === 'lastfm' || result.genreSource === 'spotify')
      : statusMatches
    return onlineMatches && (genre === 'all' || (result.genre ?? 'review') === genre)
  })
}

export function tagResultCounts(results: TagResult[]) {
  return {
    all: results.length,
    ok: results.filter((result) => result.status === 'ok').length,
    review: results.filter((result) => result.status === 'review').length,
    duplicate: results.filter((result) => result.status === 'duplicate').length,
    possibleDuplicate: results.filter((result) => result.possibleDuplicate).length,
    online: results.filter((result) => result.status === 'ok' && (result.genreSource === 'lastfm' || result.genreSource === 'spotify')).length,
  }
}

export function mergeTrackMetadata<T extends TagResult>(row: T, metadata: { title?: string; artist?: string; bpm?: number | null; key?: string | null }): T {
  return { ...row, ...metadata, genre: row.genre, status: row.status, destination: row.destination }
}

export function canonicalTagDistribution(results: TagResult[], canonical: string[], reviewLabel: string) {
  const allowed = new Set(canonical)
  const counts = new Map<string, number>()
  for (const result of results) {
    const genre = result.genre && allowed.has(result.genre) ? result.genre : reviewLabel
    counts.set(genre, (counts.get(genre) ?? 0) + 1)
  }
  const total = results.length
  return [...counts].sort((a, b) => b[1] - a[1]).map(([genre, count], index) => ({
    genre,
    count,
    percentage: total ? (count / total) * 100 : 0,
    majority: index === 0,
  }))
}

export function changeTagGenre(
  results: TagResult[],
  paths: string[],
  genre: string,
  destRoot: string,
) {
  const selected = new Set(paths)
  return results.map((result) => {
    if (!selected.has(result.path)) return result
    const status: TagResult['status'] =
      result.status === 'duplicate' ? 'duplicate' : genre === 'review' ? 'review' : 'ok'
    return {
      ...result,
      genre: genre === 'review' ? null : genre,
      status,
      destination:
        genre === 'review'
          ? null
          : `${destRoot.replace(/[\\/]$/, '')}/${genre}/${result.path.split(/[\\/]/).pop()}`,
    }
  })
}
