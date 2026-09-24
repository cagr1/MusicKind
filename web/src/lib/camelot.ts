export interface CamelotInfo {
  number: number
  letter: 'A' | 'B'
  key: string
  musicalKey: string
  rgb: [number, number, number]
  hex: string
}

const musicalKeys = [
  ['Abm', 'B'], ['Ebm', 'F#'], ['Bbm', 'Db'], ['Fm', 'Ab'], ['Cm', 'Eb'], ['Gm', 'Bb'],
  ['Dm', 'F'], ['Am', 'C'], ['Em', 'G'], ['Bm', 'D'], ['F#m', 'A'], ['C#m', 'E'],
] as const
const colors = ['#14b8a6', '#06b6d4', '#22c55e', '#84cc16', '#eab308', '#f59e0b', '#f97316', '#ef4444', '#ec4899', '#a855f7', '#6366f1', '#3b82f6'] as const
const rgbs: [number, number, number][] = [[20, 184, 166], [6, 182, 212], [34, 197, 94], [132, 204, 22], [234, 179, 8], [245, 158, 11], [249, 115, 22], [239, 68, 68], [236, 72, 153], [168, 85, 247], [99, 102, 241], [59, 130, 246]]

export const CAMELOT_MAP: Record<string, CamelotInfo> = Object.fromEntries(
  musicalKeys.flatMap(([minor, major], index) => {
    const number = index + 1
    const color = colors[index]
    const rgb = rgbs[index]
    return [
      [`${number}A`, { number, letter: 'A', key: `${number}A`, musicalKey: minor, rgb, hex: color }],
      [`${number}B`, { number, letter: 'B', key: `${number}B`, musicalKey: major, rgb, hex: color }],
    ]
  }),
) as Record<string, CamelotInfo>

export function normalizeCamelot(keyStr: string | null | undefined): string | null {
  const normalized = keyStr?.trim().toUpperCase() ?? ''
  if (CAMELOT_MAP[normalized]) return normalized
  const musicalMatch = Object.values(CAMELOT_MAP).find(
    (info) => info.musicalKey.toUpperCase() === normalized,
  )
  return musicalMatch?.key ?? null
}

export function getHarmonicMatches(keyStr: string | null | undefined) {
  const exact = normalizeCamelot(keyStr)
  if (!exact) {
    return {
      exact: null,
      relative: null,
      minusOne: null,
      plusOne: null,
      compatibleSet: new Set<string>(),
    }
  }
  const info = CAMELOT_MAP[exact]
  const relative = `${info.number}${info.letter === 'A' ? 'B' : 'A'}`
  const minusOne = `${info.number === 1 ? 12 : info.number - 1}${info.letter}`
  const plusOne = `${info.number === 12 ? 1 : info.number + 1}${info.letter}`
  return { exact, relative, minusOne, plusOne, compatibleSet: new Set([exact, relative, minusOne, plusOne]) }
}

export function getCamelotRgba(keyStr: string, alpha: number): string {
  const normalized = normalizeCamelot(keyStr)
  if (!normalized) return `rgba(113, 113, 122, ${alpha})`
  const [r, g, b] = CAMELOT_MAP[normalized].rgb
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}
