import { useMemo } from 'react'
import {
  CAMELOT_MAP,
  getCamelotRgba,
  getHarmonicMatches,
  normalizeCamelot,
} from '@/lib/camelot'

function point(cx: number, cy: number, radius: number, angle: number) {
  const radians = (angle * Math.PI) / 180
  return {
    x: cx + radius * Math.cos(radians),
    y: cy + radius * Math.sin(radians),
  }
}

function slice(
  cx: number,
  cy: number,
  inner: number,
  outer: number,
  start: number,
  end: number,
) {
  const a = point(cx, cy, outer, start)
  const b = point(cx, cy, outer, end)
  const c = point(cx, cy, inner, end)
  const d = point(cx, cy, inner, start)

  return [
    `M ${a.x.toFixed(2)} ${a.y.toFixed(2)}`,
    `A ${outer} ${outer} 0 0 1 ${b.x.toFixed(2)} ${b.y.toFixed(2)}`,
    `L ${c.x.toFixed(2)} ${c.y.toFixed(2)}`,
    `A ${inner} ${inner} 0 0 0 ${d.x.toFixed(2)} ${d.y.toFixed(2)}`,
    'Z',
  ].join(' ')
}

interface CamelotWheelProps {
  currentKey?: string | null
  onSelectKey?: (key: string) => void
  size?: number
  className?: string
}

export function CamelotWheel({
  currentKey,
  onSelectKey,
  size = 120,
  className = '',
}: CamelotWheelProps) {
  const key = normalizeCamelot(currentKey)
  const { compatibleSet } = useMemo(() => getHarmonicMatches(key), [key])
  const numbers = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]

  return (
    <div
      className={`relative shrink-0 select-none ${className}`}
      style={{ width: size, height: size }}
    >
      <svg viewBox="0 0 120 120" className="size-full overflow-visible">
        <circle
          cx="60"
          cy="60"
          r="24"
          fill="var(--surface-panel)"
          stroke="var(--line)"
        />
        <text
          x="60"
          y="58"
          textAnchor="middle"
          dominantBaseline="middle"
          className="fill-zinc-100 font-mono text-[11px] font-bold"
        >
          {key ?? '—'}
        </text>
        <text
          x="60"
          y="69"
          textAnchor="middle"
          dominantBaseline="middle"
          className="fill-zinc-500 font-mono text-[7.5px]"
        >
          {key ? CAMELOT_MAP[key].musicalKey : '—'}
        </text>
        {numbers.map((number) => {
          const angle = (number - 3) * 30

          return (
            <g key={number}>
              {(['B', 'A'] as const).map((letter, ring) => {
                const item = `${number}${letter}`
                const active = item === key
                const compatible = compatibleSet.has(item)
                const inner = ring === 0 ? 43 : 27
                const outer = ring === 0 ? 57 : 41
                const text = point(60, 60, (inner + outer) / 2, angle)
                const fill = active
                  ? CAMELOT_MAP[item].hex
                  : compatible
                    ? getCamelotRgba(item, 0.35)
                    : 'rgb(255 255 255 / 0.03)'

                return (
                  <g key={item}>
                    <path
                      d={slice(60, 60, inner, outer, angle - 13.8, angle + 13.8)}
                      fill={fill}
                      stroke={active ? 'white' : 'var(--line)'}
                      strokeWidth={active ? 1.5 : 0.6}
                      onClick={() => onSelectKey?.(item)}
                      className={
                        onSelectKey
                          ? 'cursor-pointer transition-opacity hover:opacity-80'
                          : ''
                      }
                    >
                      <title>{`${item} (${CAMELOT_MAP[item].musicalKey})`}</title>
                    </path>
                    <text
                      x={text.x}
                      y={text.y}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      className="pointer-events-none fill-zinc-300 font-mono text-[7px]
                        font-semibold"
                    >
                      {item}
                    </text>
                  </g>
                )
              })}
            </g>
          )
        })}
      </svg>
    </div>
  )
}
