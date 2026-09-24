import { Disc } from 'lucide-react'
import { getCamelotRgba, normalizeCamelot } from '@/lib/camelot'

interface TrackArtworkProps {
  camelotKey?: string | null
  size?: number
  className?: string
}

export function TrackArtwork({ camelotKey = null, size = 32, className = '' }: TrackArtworkProps) {
  const key = normalizeCamelot(camelotKey)
  const iconSize = size >= 90 ? 36 : size >= 48 ? 20 : 14
  const radius = size >= 90 ? 'rounded-lg' : size >= 48 ? 'rounded-md' : 'rounded'

  return (
    <div
      aria-hidden="true"
      className={`flex shrink-0 select-none items-center justify-center ${radius} ${
        key ? '' : 'bg-zinc-800'
      } ${className}`}
      style={{
        width: size,
        height: size,
        ...(key ? { backgroundColor: getCamelotRgba(key, 0.2) } : {}),
      }}
    >
      <Disc
        size={iconSize}
        color={key ? getCamelotRgba(key, 0.85) : 'rgb(113 113 122)'}
        strokeWidth={2}
      />
    </div>
  )
}
