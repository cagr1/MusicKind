import { mergeUnique } from './list'

export interface DroppedPath {
  path: string
  root: string | null
}

export { mergeUnique }

export async function itemsFromPaths(
  paths: string[],
  listDir: (path: string) => Promise<string[]>,
): Promise<DroppedPath[]> {
  const expanded = await Promise.all(
    paths.map(async (path) => {
      try {
        const files = await listDir(path)
        if (files.length === 1 && files[0] === path) return [{ path, root: null }]
        return files.map((file) => ({ path: file, root: path }))
      } catch {
        return [{ path, root: null }]
      }
    }),
  )
  return mergeUnique([], expanded.flat(), (item) => item.path)
}
