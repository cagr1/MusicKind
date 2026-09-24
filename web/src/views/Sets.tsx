import * as React from 'react'
import { Activity, AudioLines, FolderOpen, Pause, Play, Sparkles, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { CamelotBadge } from '@/components/music/CamelotBadge'
import { TrackArtwork } from '@/components/music/TrackArtwork'
import { TrackInspector, type InspectorTrack } from '@/components/music/TrackInspector'
import { useT } from '@/i18n/I18nProvider'
import { getJson, useProcessStream } from '@/lib/api'
import { electron, resolveDroppedFiles } from '@/lib/electron'
import { useProcess } from '@/lib/process'
import { useView } from '@/hooks/useView'
import { Checkbox } from '@/components/ui/checkbox'
import { useRowSelection } from '@/lib/selection'
import { SelectionControls, RowCheckbox } from '@/components/music/TableSelection'
import { usePlayer } from '@/lib/player'

export interface SetResult {
  file: string
  warmup: number | null
  peak: number | null
  closing: number | null
  best: 'warmup' | 'peak' | 'closing' | null
  bpm: number | null
  camelot: string | null
  keySource?: 'tag' | 'analysis' | null
  title?: string
  artist?: string
  error?: string
  id?: string
}

type SectionKey = 'warmup' | 'peak' | 'closing'

export function bestScore(track: SetResult): number | null {
  return track.best ? track[track.best] : null
}

export function groupSetResults(results: SetResult[]) {
  return (['warmup', 'peak', 'closing'] as SectionKey[])
    .map((key) => {
      const tracks = results.filter((track) => track.best === key)
      const bpms = tracks.map((track) => track.bpm).filter((bpm): bpm is number => bpm !== null)
      return {
        key,
        tracks,
        minBpm: bpms.length ? Math.min(...bpms) : null,
        maxBpm: bpms.length ? Math.max(...bpms) : null,
      }
    })
    .filter((section) => section.tracks.length > 0)
}

export function energyPath(results: SetResult[], width = 640, height = 64) {
  if (!results.length) return ''
  const paddingX = 24
  const paddingY = 12
  const usableWidth = width - paddingX * 2
  const usableHeight = height - paddingY * 2
  return results
    .map((track, index) => {
      const x = paddingX + (index / Math.max(1, results.length - 1)) * usableWidth
      const y = height - paddingY - ((bestScore(track) ?? 0) / 100) * usableHeight
      return `${index === 0 ? 'M' : 'L'} ${x} ${y}`
    })
    .join(' ')
}

function fileName(path: string) {
  return path.split(/[\\/]/).pop() ?? path
}

async function readMetadata(
  tracks: SetResult[],
  onTrack: (file: string, metadata: { title?: string; artist?: string }) => void,
) {
  for (let index = 0; index < tracks.length; index += 4) {
    await Promise.all(
      tracks.slice(index, index + 4).map(async (track) => {
        try {
          const response = await getJson<{ metadata?: { title?: string; artist?: string } }>(
            `/api/metadata?file=${encodeURIComponent(track.file)}`,
          )
          onTrack(track.file, response.metadata ?? {})
        } catch {
          onTrack(track.file, {})
        }
      }),
    )
  }
}

export function Sets() {
  const { setQueue, toggle, path: playingPath } = usePlayer()
  const t = useT()
  const { view } = useView()
  const { state, run, pause, resume, cancel } = useProcessStream()
  const { results: savedResults, setActive, setResult } = useProcess()
  const [results, setResults] = React.useState<SetResult[]>(
    () => (savedResults[view] as SetResult[] | undefined) ?? [],
  )
  const [selectedId, setSelectedId] = React.useState<string | null>(results[0]?.file ?? null)
  const [folders, setFolders] = React.useState<Record<SectionKey | 'input', string | null>>({
    warmup: null,
    peak: null,
    closing: null,
    input: null,
  })
  const [seconds, setSeconds] = React.useState(60)
  const [error, setError] = React.useState<string | null>(null)
  const isBusy = state.status === 'running' || state.status === 'paused'
  const selected = results.find((track) => track.file === selectedId) ?? results[0] ?? null
  React.useEffect(() => {
    const active = results.find((track) => track.file === playingPath)
    if (active) setSelectedId(active.file)
  }, [playingPath, results])
  React.useEffect(
    () =>
      setQueue(
        results.map((track) => ({
          path: track.file,
          title: track.title || fileName(track.file),
          artist: track.artist || '—',
          bpm: track.bpm,
          key: track.camelot,
        })),
      ),
    [setQueue, results],
  )
  const groups = React.useMemo(() => groupSetResults(results), [results])
  const ordered = React.useMemo(() => groups.flatMap((group) => group.tracks), [groups])
  const undoSnapshot = React.useRef<SetResult[] | null>(null)
  const selection = useRowSelection({
    items: results,
    getKey: (track) => track.file,
    isProtected: () => isBusy,
    onRemove: (keys) => {
      undoSnapshot.current = results
      const removed = new Set(keys)
      const next = results.filter((track) => !removed.has(track.file))
      setResults(next)
      setResult(view, next)
      setSelectedId((current) => (removed.has(current ?? '') ? (next[0]?.file ?? null) : current))
    },
    onClear: () => {
      undoSnapshot.current = results
      setResults([])
      setResult(view, [])
      setSelectedId(null)
    },
    onRestore: () => {
      if (undoSnapshot.current) {
        setResults(undoSnapshot.current)
        setResult(view, undoSnapshot.current)
        setSelectedId(undoSnapshot.current[0]?.file ?? null)
      }
    },
    removeLabel: t('common.removed'),
    clearLabel: t('common.cleared'),
    undoLabel: t('common.undo'),
  })

  React.useEffect(() => {
    const stored = savedResults[view] as SetResult[] | undefined
    if (stored) setResults(stored)
  }, [savedResults, view])
  React.useEffect(() => {
    setActive({
      processId: state.processId,
      view,
      name: t('sets.title'),
      current: state.progress?.current ?? 0,
      total: state.progress?.total ?? 0,
      file: state.progress?.file ?? null,
      status: state.status,
    })
  }, [setActive, state, t, view])

  const chooseFolder = async (kind: SectionKey | 'input') => {
    const directory = await electron.openDirectory(t(`sets.${kind}Folder`))
    if (directory) setFolders((current) => ({ ...current, [kind]: directory }))
  }
  const onDrop = async (event: React.DragEvent) => {
    event.preventDefault()
    try {
      const paths = await resolveDroppedFiles(event.dataTransfer.files)
      if (paths[0]) setFolders((current) => ({ ...current, input: paths[0] }))
    } catch (dropError) {
      setError(dropError instanceof Error ? dropError.message : String(dropError))
    }
  }
  const analyze = async () => {
    if (!folders.input || (!folders.warmup && !folders.peak && !folders.closing) || isBusy) return
    setError(null)
    await run('/api/set-analyze', { ...folders, analysisSeconds: seconds }, (value) => {
      if (!Array.isArray(value)) return
      const next = (value as SetResult[]).map((track) => ({ ...track, id: track.file }))
      setResults(next)
      setResult(view, next)
      setSelectedId(next[0]?.file ?? null)
      void readMetadata(next, (file, metadata) =>
        setResults((current) =>
          current.map((track) => (track.file === file ? { ...track, ...metadata } : track)),
        ),
      )
    })
  }
  const selectedTrack: InspectorTrack | null = selected
    ? {
        id: selected.file,
        title: selected.title?.trim() || fileName(selected.file),
        artist: selected.artist?.trim() || '—',
        bpm: selected.bpm,
        key: selected.camelot,
        path: selected.file,
        analyzedBpm: selected.bpm,
      }
    : null

  return (
    <div className="flex h-full min-w-0 overflow-hidden">
      <section className="flex min-w-0 flex-1 flex-col">
        <header className="relative flex h-12 shrink-0 items-center justify-between border-b border-line px-6">
          <div className="flex items-center gap-3">
            <h1 className="text-[15px] font-semibold">{t('sets.title')}</h1>
            {results.length > 0 && (
              <span className="font-mono text-[11px] text-zinc-500">
                {results.length} {t('sets.tracks')}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <SelectionControls selection={selection} t={t} hasRows={results.length > 0} />
            {isBusy && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={state.status === 'paused' ? resume : pause}
                >
                  {state.status === 'paused' ? <Play /> : <Pause />}
                  {state.status === 'paused' ? t('sets.resume') : t('sets.pause')}
                </Button>
                <Button variant="outline" size="sm" onClick={() => void cancel()}>
                  <X />
                  {t('sets.cancel')}
                </Button>
              </>
            )}
            <Button size="sm" onClick={() => void analyze()} disabled={isBusy || !folders.input}>
              <Activity />
              {t('sets.analyze')}
            </Button>
          </div>
          {isBusy && (
            <div className="absolute inset-x-0 bottom-0 h-0.5 bg-white/10">
              <div
                className="h-full bg-brand transition-all"
                style={{ width: `${state.progress?.percentage ?? 0}%` }}
              />
            </div>
          )}
        </header>
        <div className="grid shrink-0 grid-cols-4 gap-2 border-b border-line px-6 py-2">
          {(['warmup', 'peak', 'closing', 'input'] as const).map((kind) => (
            <button
              key={kind}
              type="button"
              onClick={() => void chooseFolder(kind)}
              className="flex min-w-0 items-center gap-2 rounded border border-line bg-surface-panel px-2 py-1.5 text-left hover:border-brand"
              aria-label={t(`sets.${kind}Folder`)}
            >
              <FolderOpen className="size-3.5 shrink-0 text-brand" />
              <span className="min-w-0 truncate text-[11px] text-zinc-300">
                {folders[kind] ? fileName(folders[kind] as string) : t(`sets.${kind}Folder`)}
              </span>
            </button>
          ))}
        </div>
        <div className="flex h-11 shrink-0 items-center justify-end gap-3 border-b border-line px-6 text-[11px] text-zinc-500">
          <label className="flex w-56 items-center gap-2">
            <span className="shrink-0">{t('sets.seconds')}</span>
            <Slider
              min={30}
              max={120}
              step={15}
              value={[seconds]}
              onValueChange={([value]) => setSeconds(value)}
              disabled={isBusy}
              aria-label={t('sets.seconds')}
            />
            <span className="w-8 font-mono text-zinc-300">{seconds}s</span>
          </label>
        </div>
        {isBusy && (
          <div className="flex items-center justify-end gap-2 border-b border-line px-6 py-2 font-mono text-[11px] text-zinc-400">
            <span className="text-zinc-200">
              {state.progress?.current ?? 0}/{state.progress?.total ?? 0}
            </span>
            <span className="truncate">{state.progress?.file}</span>
          </div>
        )}
        {error || state.status === 'error' ? (
          <div className="m-6 flex items-center justify-between rounded border border-red-500/30 bg-red-500/5 px-4 py-3 text-[12px] text-red-200">
            <span>{error ?? state.error ?? t('sets.error')}</span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setError(null)
                void analyze()
              }}
            >
              {t('sets.retry')}
            </Button>
          </div>
        ) : !results.length && !isBusy ? (
          <EmptyState
            title={t('sets.chooseInput')}
            onChoose={() => void chooseFolder('input')}
            onDrop={onDrop}
          />
        ) : (
          <div className="min-h-0 flex-1 overflow-auto px-6 py-2">
            <EnergyCurve results={ordered} selectedId={selectedId} onSelect={setSelectedId} t={t} />
            <table className="w-full table-fixed text-left">
              <thead className="sticky top-0 z-10 border-b border-line bg-surface-app">
                <tr className="h-8 text-[10px] uppercase tracking-wider text-zinc-500">
                  <th className="w-10 text-center">
                    <Checkbox
                      checked={
                        selection.checked ? true : selection.indeterminate ? 'indeterminate' : false
                      }
                      onCheckedChange={selection.toggleAll}
                      aria-label={t('common.selectAll')}
                    />
                  </th>
                  <th className="w-10 text-center">#</th>
                  <th>{t('sets.track')}</th>
                  <th className="w-20">{t('sets.bpm')}</th>
                  <th className="w-20">{t('sets.key')}</th>
                  <th className="w-36">{t('sets.section')}</th>
                </tr>
              </thead>
              <tbody>
                {groups.map((group) => (
                  <React.Fragment key={group.key}>
                    <tr className="sticky top-8 z-[1] h-7 border-y border-line bg-surface-panel text-[10px] font-mono uppercase text-zinc-300">
                      <td colSpan={6} className="px-3">
                        {t(`sets.${group.key}`)} {group.tracks.length} · {group.minBpm ?? '—'}–
                        {group.maxBpm ?? '—'} BPM
                      </td>
                    </tr>
                    {group.tracks.map((track, index) => (
                      <SetRow
                        key={track.file}
                        track={track}
                        index={index}
                        isPlaying={track.file === playingPath}
                        selected={track.file === selectedId}
                        onSelect={() => setSelectedId(track.file)}
                        onPlay={() => {
                          setSelectedId(track.file)
                          toggle(track.file)
                        }}
                        checked={selection.selected.includes(track.file)}
                        disabled={isBusy}
                        onCheck={(shiftKey) => selection.toggle(track.file, shiftKey)}
                        t={t}
                      />
                    ))}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <TrackInspector track={selectedTrack}>
        {selected && <ScoreInspector track={selected} t={t} />}
      </TrackInspector>
    </div>
  )
}

function EmptyState({
  title,
  onChoose,
  onDrop,
}: {
  title: string
  onChoose: () => void
  onDrop: (event: React.DragEvent) => void
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onChoose}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') onChoose()
      }}
      onDragOver={(event) => event.preventDefault()}
      onDrop={onDrop}
      className="flex min-h-0 flex-1 cursor-pointer flex-col items-center justify-center gap-3 border-2 border-dashed border-zinc-800 p-8 text-center hover:border-zinc-700"
    >
      <span className="flex size-12 items-center justify-center rounded-full border border-dashed border-zinc-700 text-brand">
        <FolderOpen className="size-5" />
      </span>
      <span className="text-[15px] font-semibold text-zinc-200">{title}</span>
    </div>
  )
}

function SetRow({
  track,
  index,
  isPlaying,
  selected,
  onSelect,
  onPlay,
  t,
  checked,
  disabled,
  onCheck,
}: {
  track: SetResult
  index: number
  isPlaying: boolean
  selected: boolean
  onSelect: () => void
  onPlay: () => void
  t: ReturnType<typeof useT>
  checked: boolean
  disabled: boolean
  onCheck: (shiftKey: boolean) => void
}) {
  const score = bestScore(track)
  return (
    <tr
      onClick={onSelect}
      onDoubleClick={onPlay}
      className={`h-12 cursor-pointer ${selected ? 'bg-white/[0.06]' : 'hover:bg-white/[0.04]'}`}
    >
      <td className="text-center font-mono text-[11px] text-zinc-500">
        <RowCheckbox
          checked={checked}
          disabled={disabled}
          label={fileName(track.file)}
          onClick={onCheck}
        />
      </td>
      <td className="text-center font-mono text-[11px] text-zinc-500">
        {isPlaying ? (
          <AudioLines className="mx-auto size-4 text-brand" />
        ) : (
          String(index + 1).padStart(2, '0')
        )}
      </td>
      <td>
        <div className="flex items-center gap-3">
          <TrackArtwork camelotKey={track.camelot} size={30} />
          <div className="min-w-0">
            <p className="truncate text-[12px] text-zinc-200">
              {track.title?.trim() || fileName(track.file)}
            </p>
            <p className="truncate text-[11px] text-zinc-500">{track.artist?.trim() || '—'}</p>
          </div>
        </div>
      </td>
      <td className="font-mono text-[12px] text-zinc-200">{track.bpm ?? '—'}</td>
      <td>
        <CamelotBadge camelotKey={track.camelot} keySource={track.keySource} />
      </td>
      <td>
        <div className="flex items-center gap-2">
          <div className="flex h-1.5 w-20 gap-0.5" aria-label={t('sets.score')}>
            {(['warmup', 'peak', 'closing'] as SectionKey[]).map((section) => (
              <span
                key={section}
                className={`flex-1 rounded-sm ${track.best === section ? 'bg-brand' : 'bg-zinc-700'}`}
              />
            ))}
          </div>
          <span className="font-mono text-[11px] tabular-nums text-zinc-300">
            {score === null ? '—' : `${score}%`}
          </span>
        </div>
      </td>
    </tr>
  )
}

function EnergyCurve({
  results,
  selectedId,
  onSelect,
  t,
}: {
  results: SetResult[]
  selectedId: string | null
  onSelect: (id: string) => void
  t: ReturnType<typeof useT>
}) {
  return (
    <div className="border-b border-line py-2">
      <div className="mb-1 flex justify-between text-[10px] uppercase tracking-wider text-zinc-500">
        <span>{t('sets.energy')}</span>
        <span>
          {results.length} {t('sets.tracks')}
        </span>
      </div>
      <svg
        className="h-16 w-full rounded border border-line bg-surface-panel"
        viewBox="0 0 640 64"
        preserveAspectRatio="none"
        role="img"
        aria-label={t('sets.energy')}
      >
        <path
          d={energyPath(results)}
          fill="none"
          stroke="currentColor"
          className="text-brand"
          strokeWidth="1"
        />
        {results.map((track, index) => {
          const x = 24 + (index / Math.max(1, results.length - 1)) * 592
          const y = 52 - ((bestScore(track) ?? 0) / 100) * 40
          return (
            <circle
              key={track.file}
              cx={x}
              cy={y}
              r={track.file === selectedId ? 4 : 2}
              className="cursor-pointer fill-surface-panel stroke-brand"
              strokeWidth="1"
              onClick={() => onSelect(track.file)}
            >
              <title>{fileName(track.file)}</title>
            </circle>
          )
        })}
      </svg>
    </div>
  )
}

function ScoreInspector({ track, t }: { track: SetResult; t: ReturnType<typeof useT> }) {
  return (
    <div className="space-y-3 rounded border border-line bg-surface-panel p-3">
      <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
        <Sparkles className="size-3.5 text-brand" />
        {t('sets.scores')}
      </div>
      {(['warmup', 'peak', 'closing'] as SectionKey[]).map((section) => {
        const value = track[section]
        return (
          <div key={section} className="space-y-1">
            <div className="flex justify-between text-[11px]">
              <span className="text-zinc-400">{t(`sets.${section}`)}</span>
              <span className="font-mono text-zinc-200">{value === null ? '—' : `${value}%`}</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded bg-zinc-800">
              <div
                className={`h-full ${track.best === section ? 'bg-brand' : 'bg-zinc-600'}`}
                style={{ width: `${value ?? 0}%` }}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}
