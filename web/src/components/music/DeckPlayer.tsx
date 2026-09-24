import * as React from 'react'
import { ChevronLeft, ChevronRight, Loader2, Pause, Play, Volume2, VolumeX, X } from 'lucide-react'
import { usePlayer } from '@/lib/player'
import { getJson } from '@/lib/api'
import { TrackArtwork } from './TrackArtwork'
import { CamelotBadge } from './CamelotBadge'
import { Slider } from '@/components/ui/slider'
import { useT } from '@/i18n/I18nProvider'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

function clock(value: number) {
  return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(Math.floor(value % 60)).padStart(2, '0')}`
}

export function waveformSeekTime(clientX: number, left: number, width: number, duration: number) {
  return Math.max(0, Math.min(duration, ((clientX - left) / width) * duration))
}

export function waveformPeakIndex(clientX: number, left: number, width: number, peakCount: number) {
  if (width <= 0 || peakCount <= 0) return 0
  return Math.min(peakCount - 1, Math.floor(((clientX - left) / width) * peakCount))
}

export function deckBpmLabel(bpm: number | null) {
  return bpm === null ? '—' : String(Math.round(bpm))
}

export function canStep(queue: { path: string }[], path: string | null, delta: -1 | 1) {
  const index = queue.findIndex((item) => item.path === path)
  return index >= 0 && index + delta >= 0 && index + delta < queue.length
}

export function DeckPlayer() {
  const t = useT()
  const {
    audio,
    path,
    current,
    queue,
    playing,
    currentTime,
    duration,
    toggle,
    seek,
    previous,
    next,
    visible,
    preparing,
    close,
  } = usePlayer()
  const [peaks, setPeaks] = React.useState<number[]>([])
  const [volume, setVolume] = React.useState(0.8)
  const track = current
  React.useEffect(() => {
    setPeaks([])
    if (!path) return
    let active = true
    void getJson<{ peaks: number[] }>(`/api/waveform?path=${encodeURIComponent(path)}&bins=400`)
      .then((result) => {
        if (active) setPeaks(result.peaks)
      })
      .catch(() => {
        if (active) setPeaks([])
      })
    return () => {
      active = false
    }
  }, [path])
  React.useEffect(() => {
    if (audio) audio.volume = volume
  }, [audio, volume])
  if (!visible || !track) return null
  const progress = duration ? currentTime / duration : 0
  return (
    <footer
      className="flex h-16 shrink-0 items-center gap-3 border-t border-line bg-surface-app px-4"
      aria-label={t('player.title')}
    >
      <div className="flex w-[220px] min-w-0 items-center gap-2">
        <TrackArtwork camelotKey={track.key} path={track.path} size={40} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-medium text-zinc-100">{track.title}</p>
          <p className="truncate text-[11px] text-zinc-500">{track.artist}</p>
        </div>
        <span className="font-mono text-[10px] text-zinc-400">{deckBpmLabel(track.bpm)}</span>
        <CamelotBadge camelotKey={track.key} />
      </div>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={previous}
          disabled={!canStep(queue, path, -1)}
          aria-label={t('player.previous')}
          className="p-1.5 text-zinc-400 hover:text-white disabled:cursor-not-allowed disabled:opacity-30"
        >
          <ChevronLeft className="size-4" />
        </button>
        <button
          type="button"
          onClick={() => toggle()}
          aria-label={playing ? t('music.pause') : t('music.play')}
          className="flex size-8 items-center justify-center rounded-full bg-brand text-zinc-950"
        >
          {preparing ? (
            <Loader2 className="size-4 animate-spin" />
          ) : playing ? (
            <Pause className="size-4" />
          ) : (
            <Play className="ml-0.5 size-4 fill-current" />
          )}
        </button>
        {preparing && <span className="text-[10px] text-zinc-400">{t('player.preparing')}</span>}
        <button
          type="button"
          onClick={next}
          disabled={!canStep(queue, path, 1)}
          aria-label={t('player.next')}
          className="p-1.5 text-zinc-400 hover:text-white disabled:cursor-not-allowed disabled:opacity-30"
        >
          <ChevronRight className="size-4" />
        </button>
      </div>
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <span className="font-mono text-[10px] tabular-nums text-zinc-500">
          {clock(currentTime)}
        </span>
        <button
          type="button"
          className="relative h-8 min-w-0 flex-1 overflow-hidden"
          aria-label={t('player.seek')}
          onClick={(event) => {
            const bounds = event.currentTarget.getBoundingClientRect()
            seek(waveformSeekTime(event.clientX, bounds.left, bounds.width, duration))
          }}
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 400 32"
            preserveAspectRatio="none"
            className="size-full"
          >
            {peaks.map((peak, index) => {
              const height = Math.max(3, Math.min(28, peak * 28))
              return (
                <rect
                  key={index}
                  x={((index + 0.5) / peaks.length) * 400 - 0.35}
                  y={(32 - height) / 2}
                  width="0.7"
                  height={height}
                  rx="0.35"
                  className={index / peaks.length <= progress ? 'fill-zinc-300' : 'fill-zinc-700'}
                />
              )
            })}
            <line
              x1={progress * 400}
              x2={progress * 400}
              y1="3"
              y2="29"
              className="stroke-brand"
              strokeWidth="1"
            />
          </svg>
        </button>
        <span className="font-mono text-[10px] tabular-nums text-zinc-500">{clock(duration)}</span>
      </div>
      <div className="flex w-32 items-center gap-2">
        <button
          type="button"
          aria-label={volume === 0 ? t('player.unmute') : t('player.mute')}
          onClick={() => setVolume(volume === 0 ? 0.8 : 0)}
          className="text-zinc-400"
        >
          {volume === 0 ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
        </button>
        <Slider
          aria-label={t('player.volume')}
          min={0}
          max={1}
          step={0.01}
          value={[volume]}
          onValueChange={([value]) => setVolume(value)}
        />
      </div>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={close}
              aria-label={t('player.close')}
              className="p-1.5 text-zinc-400 hover:text-white"
            >
              <X className="size-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent>{t('player.close')}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </footer>
  )
}
