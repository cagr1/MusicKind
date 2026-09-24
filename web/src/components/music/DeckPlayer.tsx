import * as React from 'react'
import { ChevronLeft, ChevronRight, Loader2, Pause, Play, Volume2, VolumeX } from 'lucide-react'
import { usePlayer } from '@/lib/player'
import { getJson } from '@/lib/api'
import { TrackArtwork } from './TrackArtwork'
import { CamelotBadge } from './CamelotBadge'
import { Slider } from '@/components/ui/slider'
import { useT } from '@/i18n/I18nProvider'

function clock(value: number) {
  return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(Math.floor(value % 60)).padStart(2, '0')}`
}

export function waveformSeekTime(clientX: number, left: number, width: number, duration: number) {
  return Math.max(0, Math.min(duration, ((clientX - left) / width) * duration))
}

export function deckBpmLabel(bpm: number | null) {
  return bpm === null ? '—' : String(Math.round(bpm))
}

export function DeckPlayer() {
  const t = useT()
  const {
    audio,
    path,
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
  } = usePlayer()
  const [peaks, setPeaks] = React.useState<number[]>([])
  const [volume, setVolume] = React.useState(0.8)
  const track = queue.find((item) => item.path === path)
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
          aria-label={t('player.previous')}
          className="p-1.5 text-zinc-400 hover:text-white"
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
          aria-label={t('player.next')}
          className="p-1.5 text-zinc-400 hover:text-white"
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
          className="relative flex h-8 min-w-0 flex-1 items-center gap-px overflow-hidden"
          aria-label={t('player.seek')}
          onClick={(event) => {
            const bounds = event.currentTarget.getBoundingClientRect()
            seek(waveformSeekTime(event.clientX, bounds.left, bounds.width, duration))
          }}
        >
          {peaks.map((peak, index) => (
            <span
              key={index}
              className={`min-w-px flex-1 rounded-sm ${index / peaks.length <= progress ? 'bg-zinc-300' : 'bg-zinc-700'}`}
              style={{ height: `${Math.max(3, peak * 28)}px` }}
            />
          ))}
          <span
            className="pointer-events-none absolute h-5 w-px bg-brand"
            style={{ left: `calc(${progress * 100}% + 1px)` }}
          />
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
    </footer>
  )
}
