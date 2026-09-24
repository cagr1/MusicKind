import { useEffect, useRef, useState } from 'react'
import { getJson } from '@/lib/api'
import { useT } from '@/i18n/I18nProvider'
import { Skeleton } from '@/components/ui/skeleton'

const cache = new Map<string, number[] | null>()
const pending: Array<() => void> = []
let active = 0

function next() {
  while (active < 4 && pending.length) {
    active += 1
    const job = pending.shift()
    job?.()
  }
}

function loadPeaks(path: string): Promise<number[] | null> {
  return new Promise((resolve) => {
    const run = () => {
      getJson<{ peaks: number[] }>(
        `/api/waveform?path=${encodeURIComponent(path)}&bins=48`,
      )
        .then((data) => {
          cache.set(path, data.peaks)
          resolve(data.peaks)
        })
        .catch(() => {
          cache.set(path, null)
          resolve(null)
        })
        .finally(() => {
          active -= 1
          next()
        })
    }

    pending.push(run)
    next()
  })
}

interface MiniWaveformProps {
  path?: string | null
  isSelected?: boolean
  className?: string
}

export function MiniWaveform({
  path,
  isSelected = false,
  className = '',
}: MiniWaveformProps) {
  const t = useT()
  const ref = useRef<HTMLDivElement>(null)
  const cached = path && cache.has(path) ? cache.get(path) : undefined
  const [visible, setVisible] = useState(false)
  const [loaded, setLoaded] = useState(cached !== undefined)
  const [peaks, setPeaks] = useState<number[] | null>(cached ?? null)

  useEffect(() => {
    if (!ref.current || !('IntersectionObserver' in window)) {
      setVisible(true)
      return
    }

    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setVisible(true)
        observer.disconnect()
      }
    })
    observer.observe(ref.current)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const cachedPeaks = path && cache.has(path) ? cache.get(path) : undefined
    setLoaded(cachedPeaks !== undefined)
    setPeaks(cachedPeaks ?? null)
  }, [path])

  useEffect(() => {
    if (!visible || !path || loaded) return

    let cancelled = false
    void loadPeaks(path).then((value) => {
      if (cancelled) return
      setPeaks(value)
      setLoaded(true)
    })

    return () => {
      cancelled = true
    }
  }, [loaded, path, visible])

  if (!path || !visible) {
    return <div ref={ref} className={`h-5 w-16 ${className}`} />
  }

  if (!loaded) {
    return (
      <div ref={ref} className={`h-5 w-16 ${className}`}>
        <Skeleton className="size-full" />
      </div>
    )
  }

  if (!peaks) {
    return (
      <div ref={ref} className={className}>
        <svg
          width="64"
          height="20"
          viewBox="0 0 64 20"
          aria-label={t('music.waveform')}
          role="img"
        >
          <line
            x1="0"
            y1="10"
            x2="64"
            y2="10"
            stroke="rgb(82 82 91)"
            strokeWidth="1"
          />
        </svg>
      </div>
    )
  }

  return (
    <div ref={ref} className={className}>
      <svg
        width="64"
        height="20"
        viewBox="0 0 64 20"
        aria-label={t('music.waveform')}
        role="img"
      >
        {peaks.map((peak, index) => {
          const height = Math.max(2, peak * 18)

          return (
            <rect
              key={index}
              x={index * (64 / peaks.length) + 0.5}
              y={(20 - height) / 2}
              width={Math.max(1, 64 / peaks.length - 1)}
              height={height}
              rx="0.75"
              fill={isSelected ? 'var(--brand-color)' : 'rgb(82 82 91)'}
            />
          )
        })}
      </svg>
    </div>
  )
}
