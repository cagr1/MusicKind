import { describe, expect, it } from 'vitest'
import {
  formatBytes,
  pendingConverterResult,
  skippedFormatLabel,
  shouldContinueAfterResult,
  summarizeConversionResults,
  type ConverterResult,
} from './Converter'
import {
  effectiveFormat,
  itemsFromPaths,
  overrideFormat,
  shouldSkipConversion,
  type ConversionItem,
} from './converter-model'

const result = (sizeIn: number, sizeOut: number | null): ConverterResult => ({
  ok: sizeOut !== null,
  input: '/music/input.mp3',
  output: '/music/output.wav',
  format: 'wav',
  bitrate: null,
  sizeIn,
  sizeOut,
})

describe('converter summaries', () => {
  it('sums input and successful output sizes', () => {
    expect(summarizeConversionResults([result(1024, 2048), result(4096, null)])).toEqual({
      count: 2,
      sizeIn: 5120,
      sizeOut: 2048,
    })
  })

  it('formats sizes using readable units', () => {
    expect(formatBytes(1024 * 1024)).toBe('1.0 MB')
    expect(formatBytes(1024 * 1024 * 1024 * 1.2)).toBe('1.2 GB')
    expect(formatBytes(null)).toBe('—')
  })

  it('stops after a missing or failed terminal result', () => {
    expect(shouldContinueAfterResult([])).toBe(false)
    expect(shouldContinueAfterResult([{ ok: false }])).toBe(false)
    expect(shouldContinueAfterResult([{ ok: true }])).toBe(true)
    expect(shouldContinueAfterResult(null)).toBe(false)
  })
})

describe('converter row display', () => {
  it('creates a pending row without an input size until conversion returns one', () => {
    const item: ConversionItem = { path: '/music/pending.mp3', root: null, format: null }
    expect(pendingConverterResult(item, 'wav')).toMatchObject({
      input: '/music/pending.mp3',
      sizeIn: null,
      sizeOut: null,
    })
  })

  it('shows the actual target format in a compact skipped label', () => {
    expect(skippedFormatLabel('ya es {format} · se omite', 'wav')).toBe('ya es WAV · se omite')
  })
})

describe('per-item conversion formats', () => {
  const items: ConversionItem[] = [
    { path: '/music/a.wav', root: '/music', format: null },
    { path: '/music/b.mp3', root: '/music', format: 'flac' },
  ]
  it('follows the general format until a row override is set', () => {
    expect(effectiveFormat(items[0], 'aiff')).toBe('aiff')
    expect(effectiveFormat(items[1], 'aiff')).toBe('flac')
    expect(effectiveFormat(items[0], 'mp3')).toBe('mp3')
  })
  it('skips matching formats and treats aif as aiff', () => {
    expect(shouldSkipConversion({ path: '/music/a.wav', root: null, format: null }, 'wav')).toBe(
      true,
    )
    expect(shouldSkipConversion({ path: '/music/a.aif', root: null, format: null }, 'aiff')).toBe(
      true,
    )
    expect(shouldSkipConversion(items[0], 'flac')).toBe(false)
  })
  it('applies a format to selected paths including General', () => {
    expect(overrideFormat(items, ['/music/a.wav'], 'mp3').map((item) => item.format)).toEqual([
      'mp3',
      'flac',
    ])
    expect(overrideFormat(items, ['/music/b.mp3'], null)[1].format).toBeNull()
  })
})

describe('converter input paths', () => {
  it('expands folders and keeps each file rooted at that folder', async () => {
    await expect(
      itemsFromPaths(['/music/set'], async () => ['/music/set/a.mp3', '/music/set/sub/b.wav']),
    ).resolves.toEqual([
      { path: '/music/set/a.mp3', root: '/music/set', format: null },
      { path: '/music/set/sub/b.wav', root: '/music/set', format: null },
    ])
  })

  it('keeps a dropped file without a root', async () => {
    await expect(
      itemsFromPaths(['/music/a.mp3'], async () => {
        throw new Error('not a directory')
      }),
    ).resolves.toEqual([{ path: '/music/a.mp3', root: null, format: null }])
  })

  it('recognizes a metadata-list response containing the same file as a standalone file', async () => {
    await expect(itemsFromPaths(['/music/a.mp3'], async (path) => [path])).resolves.toEqual([
      { path: '/music/a.mp3', root: null, format: null },
    ])
  })

  it('handles a folder mixed with a standalone file', async () => {
    await expect(
      itemsFromPaths(['/music/set', '/music/loose.mp3'], async (path) => {
        if (path === '/music/set') return ['/music/set/a.mp3']
        throw new Error('not a directory')
      }),
    ).resolves.toEqual([
      { path: '/music/set/a.mp3', root: '/music/set', format: null },
      { path: '/music/loose.mp3', root: null, format: null },
    ])
  })

  it('returns no items for an empty folder', async () => {
    await expect(itemsFromPaths(['/music/empty'], async () => [])).resolves.toEqual([])
  })
})
