import WaveSurfer from 'wavesurfer.js'
import { Pause, Play } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
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
  const [duration, setDuration] = useState(0)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const waveRef = useRef<WaveSurfer | null>(null)
  const { audio, path: activePath, playing, currentTime, select, toggle, seek } = usePlayer()

  useEffect(() => {
    setPeaks(null)
    setDuration(0)
    if (!path) return

    let cancelled = false
    void getJson<{ peaks: number[]; duration: number }>(
      `/api/waveform?path=${encodeURIComponent(path)}&bins=200`,
    )
      .then((data) => {
        if (cancelled) return
        setPeaks(data.peaks)
        setDuration(data.duration)
      })
      .catch(() => {
        if (!cancelled) setPeaks([])
      })

    return () => {
      cancelled = true
      waveRef.current?.destroy()
      waveRef.current = null
    }
  }, [path])

  useEffect(() => {
    if (!containerRef.current || !audio || !path || !peaks) return
    waveRef.current?.destroy()
    const wave = WaveSurfer.create({
      container: containerRef.current,
      media: audio,
      height: 56,
      width: containerRef.current.clientWidth || 300,
      cursorWidth: 1,
      cursorColor: 'var(--brand-color)',
      waveColor: 'rgb(63 63 70)',
      progressColor: 'rgb(212 212 216)',
      barWidth: 2,
      barGap: 1,
      barRadius: 1,
      interact: true,
    })
    wave.setOptions({ peaks: [peaks], duration })
    wave.on('interaction', (time) => seek(time))
    waveRef.current = wave
    return () => {
      wave.destroy()
      waveRef.current = null
    }
  }, [audio, duration, path, peaks, seek])

  if (!path || peaks === null) {
    return <Skeleton className={`h-14 w-full ${className}`} />
  }

  const time = activePath === path ? currentTime : 0
  const formatTime = (seconds: number) =>
    `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(
      Math.floor(seconds % 60),
    ).padStart(2, '0')}`

  return (
    <div
      className={`flex w-full min-w-0 select-none flex-col gap-1.5 ${className}`}
    >
      <div
        className="relative h-14 w-full min-w-0 overflow-hidden rounded-md border
          border-line bg-surface-panel"
      >
        <div ref={containerRef} aria-label={t('music.waveform')} role="img" className="size-full" />
        <button
          type="button"
          onClick={() => {
            if (path !== activePath) select(path)
            toggle(path)
          }}
          aria-label={activePath === path && playing ? t('music.pause') : t('music.play')}
          className="absolute bottom-2 left-2 flex size-6 items-center justify-center
            rounded-full border border-line bg-black/70 text-white hover:bg-brand"
        >
          {playing ? (
            <Pause className="size-3" />
          ) : (
            <Play className="ml-0.5 size-3 fill-current" />
          )}
        </button>
      </div>
      <div className="flex justify-between px-0.5 font-mono text-[11px] tabular-nums text-zinc-400">
        <span>{formatTime(time)}</span>
        <span>{formatTime(duration)}</span>
      </div>
    </div>
  )
}
