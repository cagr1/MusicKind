import type { ReactNode } from 'react'
import { useT } from '@/i18n/I18nProvider'
import { CAMELOT_MAP, getHarmonicMatches, normalizeCamelot } from '@/lib/camelot'
import { CamelotWheel } from './CamelotWheel'
import { LargeWaveform } from './LargeWaveform'
import { TrackArtwork } from './TrackArtwork'

export interface InspectorTrack {
  id: string
  title: string
  artist: string
  bpm: number | null
  key: string | null
  path?: string
  analyzedBpm?: number | null
  tagBpm?: number | null
}

interface TrackInspectorProps {
  track: InspectorTrack | null
  onKeyChange?: (key: string) => void
  children?: ReactNode
  className?: string
}

export function TrackInspector({
  track,
  onKeyChange,
  children,
  className = '',
}: TrackInspectorProps) {
  const t = useT()

  if (!track) {
    return (
      <aside
        className={`flex h-full w-[340px] shrink-0 items-center justify-center border-l
          border-line bg-surface-app p-6 text-center text-[13px] text-zinc-500 ${className}`}
      >
        {t('music.noTrackSelected')}
      </aside>
    )
  }

  const camelot = normalizeCamelot(track.key)
  const musicalKey = camelot ? CAMELOT_MAP[camelot].musicalKey : null
  const matches = getHarmonicMatches(camelot)
  const bpm = track.bpm ?? track.analyzedBpm
  const bpmNote =
    track.analyzedBpm === null || track.analyzedBpm === undefined
      ? track.tagBpm === null || track.tagBpm === undefined
        ? '—'
        : `${t('music.tag')} ${Math.round(track.tagBpm)}`
      : `${track.analyzedBpm.toFixed(1)}${
          track.tagBpm !== null && track.tagBpm !== undefined && track.analyzedBpm !== track.tagBpm
            ? ` · ${t('music.tag')} ${Math.round(track.tagBpm)}`
            : ''
        }`

  return (
    <aside
      className={`flex h-full w-[340px] shrink-0 select-none flex-col overflow-hidden
        border-l border-line bg-surface-app ${className}`}
    >
      <div key={track.id} className="flex-1 space-y-6 overflow-y-auto p-5">
        <div className="flex flex-col items-center gap-3 text-center">
          <TrackArtwork
            camelotKey={camelot}
            path={track.path}
            size={96}
            className="border border-line"
          />
          <div className="w-full px-2">
            <h2 className="truncate text-[15px] font-semibold text-zinc-100">{track.title}</h2>
            <p className="mt-0.5 truncate text-[13px] text-zinc-400">{track.artist}</p>
          </div>
        </div>

        <div
          className="grid grid-cols-2 gap-3 rounded-md border border-line
            bg-surface-panel px-3 py-2"
        >
          <div>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
              {t('music.bpm')}
            </span>
            <span
              className="mt-1 block font-mono text-[40px] font-semibold leading-none
                tracking-tight text-zinc-100 tabular-nums"
            >
              {bpm === null || bpm === undefined ? '—' : Math.round(bpm)}
            </span>
            <span className="mt-1 block font-mono text-[10px] text-zinc-500">{bpmNote}</span>
          </div>
          <div className="border-l border-line pl-3">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
              {t('music.key')}
            </span>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span
                className="font-mono text-[40px] font-semibold leading-none
                  tracking-tight text-zinc-100"
              >
                {camelot ?? '—'}
              </span>
              <span className="font-mono text-[14px] text-zinc-400">{musicalKey ?? '—'}</span>
            </div>
            <span className="mt-1 block font-mono text-[10px] text-zinc-500">
              {camelot ? (camelot.endsWith('A') ? t('music.minor') : t('music.major')) : '—'}
            </span>
          </div>
        </div>

        <div
          className="flex flex-col items-center gap-3 rounded-md border border-line
            bg-surface-panel p-3"
        >
          <div className="flex w-full items-center justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
              {t('music.harmonicWheel')}
            </span>
            <span className="font-mono text-[10px] text-zinc-500">{musicalKey ?? '—'}</span>
          </div>
          <CamelotWheel currentKey={camelot} onSelectKey={onKeyChange} />
          <div
            className="flex w-full items-center justify-between border-t border-line
              pt-2 font-mono text-[11px]"
          >
            <span className="text-zinc-300">
              <small className="mr-1 text-[9px] text-zinc-500">{t('music.down')}</small>
              {matches.minusOne ?? '—'}
            </span>
            <span className="font-bold text-brand">
              <small className="mr-1 text-[9px] text-zinc-500">{t('music.exact')}</small>
              {matches.exact ?? '—'}
            </span>
            <span className="text-zinc-300">
              <small className="mr-1 text-[9px] text-zinc-500">{t('music.up')}</small>
              {matches.plusOne ?? '—'}
            </span>
            <span className="text-zinc-300">
              <small className="mr-1 text-[9px] text-zinc-500">{t('music.relative')}</small>
              {matches.relative ?? '—'}
            </span>
          </div>
        </div>

        <div className="flex flex-col gap-1.5 rounded-md border border-line bg-surface-panel p-3">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
            {t('music.waveformAnalysis')}
          </span>
          <LargeWaveform path={track.path} />
        </div>

        {children ? <div className="space-y-4 pt-1">{children}</div> : null}
      </div>
    </aside>
  )
}
