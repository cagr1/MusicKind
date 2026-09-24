import * as React from 'react'
import { Disc } from 'lucide-react'
import { getCamelotRgba, normalizeCamelot } from '@/lib/camelot'

interface TrackArtworkProps {
  camelotKey?: string | null
  path?: string | null
  size?: number
  className?: string
}

export function TrackArtwork({
  camelotKey = null,
  path = null,
  size = 32,
  className = '',
}: TrackArtworkProps) {
  const [failedPath, setFailedPath] = React.useState<string | null>(null)
  const imageFailed = failedPath === path
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
      {path && !imageFailed ? (
        <img
          src={`/api/artwork?path=${encodeURIComponent(path)}`}
          loading="lazy"
          onError={() => setFailedPath(path)}
          alt=""
          className={`h-full w-full ${radius} object-cover`}
        />
      ) : (
        <Disc
          size={iconSize}
          color={key ? getCamelotRgba(key, 0.85) : 'rgb(113 113 122)'}
          strokeWidth={2}
        />
      )}
    </div>
  )
}
