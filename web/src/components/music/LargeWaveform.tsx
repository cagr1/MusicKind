import { Pause, Play } from 'lucide-react'
import { useEffect, useState } from 'react'
import { getJson } from '@/lib/api'
import { useT } from '@/i18n/I18nProvider'
import { Skeleton } from '@/components/ui/skeleton'
import { usePlayer } from '@/lib/player'

interface LargeWaveformProps {
  path?: string | null
  className?: string
}

export function LargeWaveform({ path, className = '' }: LargeWaveformProps) {
  const t = useT()
  const [peaks, setPeaks] = useState<number[] | null>(null)
  const [waveDuration, setWaveDuration] = useState(0)
  const { path: activePath, playing, currentTime, duration, toggle, seek } = usePlayer()

  useEffect(() => {
    setPeaks(null)
    setWaveDuration(0)
    if (!path) return

    let cancelled = false
    void getJson<{ peaks: number[]; duration: number }>(
      `/api/waveform?path=${encodeURIComponent(path)}&bins=200`,
    )
      .then((data) => {
        if (cancelled) return
        setPeaks(data.peaks)
        setWaveDuration(data.duration)
      })
      .catch(() => {
        if (!cancelled) setPeaks([])
      })

    return () => {
      cancelled = true
    }
  }, [path])

  if (!path || peaks === null) {
    return <Skeleton className={`h-14 w-full ${className}`} />
  }

  const isActive = activePath === path
  const time = isActive ? currentTime : 0
  const progress = isActive && duration > 0 ? Math.min(1, currentTime / duration) : 0
  const formatTime = (seconds: number) =>
    `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(
      Math.floor(seconds % 60),
    ).padStart(2, '0')}`
  const seekToPoint = (clientX: number, left: number, width: number) => {
    if (width <= 0) return
    if (!isActive) {
      toggle(path)
    }
    seek(Math.max(0, Math.min(waveDuration, ((clientX - left) / width) * waveDuration)))
  }

  return (
    <div className={`flex w-full min-w-0 select-none flex-col gap-1.5 ${className}`}>
      <button
        type="button"
        aria-label={t('music.waveform')}
        className="relative h-14 w-full min-w-0 overflow-hidden rounded-md border
          border-line bg-surface-panel"
        onClick={(event) => {
          const bounds = event.currentTarget.getBoundingClientRect()
          seekToPoint(event.clientX, bounds.left, bounds.width)
        }}
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 200 56"
          preserveAspectRatio="none"
          className="size-full"
        >
          {peaks.map((peak, index) => {
            const height = Math.max(2, Math.min(54, peak * 54))
            const x = ((index + 0.5) / peaks.length) * 200
            return (
              <rect
                key={index}
                x={x}
                y={(56 - height) / 2}
                width={Math.max(0.5, 200 / peaks.length - 1)}
                height={height}
                rx="0.5"
                className={index / peaks.length <= progress ? 'fill-brand' : 'fill-zinc-600'}
              />
            )
          })}
          {progress > 0 && (
            <line
              x1={progress * 200}
              x2={progress * 200}
              y1="2"
              y2="54"
              className="stroke-brand"
              strokeWidth="1"
            />
          )}
        </svg>
      </button>
      <div className="flex items-center justify-between px-0.5 font-mono text-[11px] tabular-nums text-zinc-400">
        <span className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => toggle(path)}
            aria-label={isActive && playing ? t('music.pause') : t('music.play')}
            className="flex size-5 items-center justify-center rounded-full border border-line
              bg-black/70 text-white hover:bg-brand"
          >
            {isActive && playing ? (
              <Pause className="size-3" />
            ) : (
              <Play className="ml-0.5 size-3 fill-current" />
            )}
          </button>
          {formatTime(time)}
        </span>
        <span>{formatTime(waveDuration)}</span>
      </div>
    </div>
  )
}
