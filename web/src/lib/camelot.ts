export interface CamelotInfo {
  number: number
  letter: 'A' | 'B'
  key: string
  musicalKey: string
  rgb: [number, number, number]
  hex: string
}

const musicalKeys = [
  ['Abm', 'B'],
  ['Ebm', 'F#'],
  ['Bbm', 'Db'],
  ['Fm', 'Ab'],
  ['Cm', 'Eb'],
  ['Gm', 'Bb'],
  ['Dm', 'F'],
  ['Am', 'C'],
  ['Em', 'G'],
  ['Bm', 'D'],
  ['F#m', 'A'],
  ['C#m', 'E'],
] as const
const colors = [
  '#14b8a6',
  '#06b6d4',
  '#22c55e',
  '#84cc16',
  '#eab308',
  '#f59e0b',
  '#f97316',
  '#ef4444',
  '#ec4899',
  '#a855f7',
  '#6366f1',
  '#3b82f6',
] as const
const rgbs: [number, number, number][] = [
  [20, 184, 166],
  [6, 182, 212],
  [34, 197, 94],
  [132, 204, 22],
  [234, 179, 8],
  [245, 158, 11],
  [249, 115, 22],
  [239, 68, 68],
  [236, 72, 153],
  [168, 85, 247],
  [99, 102, 241],
  [59, 130, 246],
]

export const CAMELOT_MAP: Record<string, CamelotInfo> = Object.fromEntries(
  musicalKeys.flatMap(([minor, major], index) => {
    const number = index + 1
    const color = colors[index]
    const rgb = rgbs[index]
    return [
      [
        `${number}A`,
        { number, letter: 'A', key: `${number}A`, musicalKey: minor, rgb, hex: color },
      ],
      [
        `${number}B`,
        { number, letter: 'B', key: `${number}B`, musicalKey: major, rgb, hex: color },
      ],
    ]
  }),
) as Record<string, CamelotInfo>

const PITCH_CLASSES: Record<string, number> = {
  C: 0,
  'B#': 0,
  'C#': 1,
  Db: 1,
  D: 2,
  'D#': 3,
  Eb: 3,
  E: 4,
  Fb: 4,
  F: 5,
  'E#': 5,
  'F#': 6,
  Gb: 6,
  G: 7,
  'G#': 8,
  Ab: 8,
  A: 9,
  'A#': 10,
  Bb: 10,
  B: 11,
  Cb: 11,
}

const CAMELOT_BY_PITCH_AND_MODE: Record<string, string> = {
  '0-major': '8B',
  '1-major': '3B',
  '2-major': '10B',
  '3-major': '5B',
  '4-major': '12B',
  '5-major': '7B',
  '6-major': '2B',
  '7-major': '9B',
  '8-major': '4B',
  '9-major': '11B',
  '10-major': '6B',
  '11-major': '1B',
  '0-minor': '5A',
  '1-minor': '12A',
  '2-minor': '7A',
  '3-minor': '2A',
  '4-minor': '9A',
  '5-minor': '4A',
  '6-minor': '11A',
  '7-minor': '6A',
  '8-minor': '1A',
  '9-minor': '8A',
  '10-minor': '3A',
  '11-minor': '10A',
}

export function normalizeCamelot(keyStr: string | null | undefined): string | null {
  if (typeof keyStr !== 'string') return null
  const normalized = keyStr.trim().toUpperCase()
  if (CAMELOT_MAP[normalized]) return normalized
  const musicalMatch = Object.values(CAMELOT_MAP).find(
    (info) => info.musicalKey.toUpperCase() === normalized,
  )
  if (musicalMatch) return musicalMatch.key

  const camelot = normalized.match(/^(0?[1-9]|1[0-2])\s*([AB])$/)
  if (camelot) {
    const candidate = `${Number(camelot[1])}${camelot[2]}`
    return CAMELOT_MAP[candidate] ? candidate : null
  }

  const musical = keyStr.trim().match(/^([A-Ga-g])([#b]?)(?:\s*(m|min|minor|maj|major))?$/i)
  if (!musical) return null
  const pitchName = musical[1].toUpperCase() + musical[2]
  const pitchClass = PITCH_CLASSES[pitchName]
  if (pitchClass === undefined) return null
  const suffix = (musical[3] ?? '').toLowerCase()
  const mode = ['m', 'min', 'minor'].includes(suffix) ? 'minor' : 'major'
  return CAMELOT_BY_PITCH_AND_MODE[`${pitchClass}-${mode}`] ?? null
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
  return {
    exact,
    relative,
    minusOne,
    plusOne,
    compatibleSet: new Set([exact, relative, minusOne, plusOne]),
  }
}

export function getCamelotRgba(keyStr: string, alpha: number): string {
  const normalized = normalizeCamelot(keyStr)
  if (!normalized) return `rgba(113, 113, 122, ${alpha})`
  const [r, g, b] = CAMELOT_MAP[normalized].rgb
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}
