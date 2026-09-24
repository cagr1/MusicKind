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
}

export type TagStatusFilter = 'all' | TagResult['status'] | 'possibleDuplicate'

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
    return statusMatches && (genre === 'all' || (result.genre ?? 'review') === genre)
  })
}

export function tagResultCounts(results: TagResult[]) {
  return {
    all: results.length,
    ok: results.filter((result) => result.status === 'ok').length,
    review: results.filter((result) => result.status === 'review').length,
    duplicate: results.filter((result) => result.status === 'duplicate').length,
    possibleDuplicate: results.filter((result) => result.possibleDuplicate).length,
  }
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
