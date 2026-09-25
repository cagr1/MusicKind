export type ConversionFormat = 'mp3' | 'wav' | 'aiff' | 'flac'
export interface ConversionItem {
  path: string
  root: string | null
  format: ConversionFormat | null
}

export async function itemsFromPaths(
  paths: string[],
  listDir: (path: string) => Promise<string[]>,
): Promise<ConversionItem[]> {
  const expanded = await Promise.all(
    paths.map(async (path) => {
      try {
        const files = await listDir(path)
        if (files.length === 1 && files[0] === path) {
          return [{ path, root: null, format: null }]
        }
        return files.map((file) => ({ path: file, root: path, format: null }))
      } catch {
        return [{ path, root: null, format: null }]
      }
    }),
  )
  return expanded.flat()
}

export function effectiveFormat(item: ConversionItem, general: ConversionFormat): ConversionFormat {
  return item.format ?? general
}

export function sourceExtension(path: string): string {
  return path.split(/[\\/]/).pop()?.split('.').pop()?.toLowerCase() ?? ''
}

export function shouldSkipConversion(item: ConversionItem, general: ConversionFormat): boolean {
  const source = sourceExtension(item.path)
  return (source === 'aif' ? 'aiff' : source) === effectiveFormat(item, general)
}

export function overrideFormat(
  items: ConversionItem[],
  paths: string[],
  format: ConversionFormat | null,
) {
  const selected = new Set(paths)
  return items.map((item) => (selected.has(item.path) ? { ...item, format } : item))
}
