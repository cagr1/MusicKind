import * as React from 'react'
import {
  Activity,
  AudioLines,
  ArrowDownUp,
  Download,
  FolderOpen,
  Pause,
  Play,
  Sparkles,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
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
import { sortGroups, useSort } from '@/lib/sort'
import { SortableHeader } from '@/components/music/SortableHeader'
import { normalizeCamelot } from '@/lib/camelot'

export interface SetResult {
  file: string
  warmup: number | null
  peak: number | null
  closing: number | null
  best: 'warmup' | 'peak' | 'closing' | null
  review?: 'all-zero' | 'tie' | null
  refCounts?: Partial<Record<'warmup' | 'peak' | 'closing', number>>
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

export function exportConflictAction(status: number | undefined, confirmed: boolean) {
  if (status !== 409) return 'propagate'
  return confirmed ? 'retry' : 'cancel'
}

export function mergeTrackMetadata(
  track: SetResult,
  metadata: {
    title?: string | null
    artist?: string | null
    bpm?: number | null
    key?: string | null
  },
): SetResult {
  return {
    ...track,
    ...(metadata.title?.trim() ? { title: metadata.title } : {}),
    ...(metadata.artist?.trim() ? { artist: metadata.artist } : {}),
  }
}

export function groupSetResults(results: SetResult[]) {
  const sections: Array<{
    key: SectionKey | 'review'
    tracks: SetResult[]
    minBpm: number | null
    maxBpm: number | null
  }> = (['warmup', 'peak', 'closing'] as SectionKey[])
    .map((key) => {
      const tracks = results.filter((track) => track.best === key && !track.review && !track.error)
      const bpms = tracks.map((track) => track.bpm).filter((bpm): bpm is number => bpm !== null)
      return {
        key,
        tracks,
        minBpm: bpms.length ? Math.min(...bpms) : null,
        maxBpm: bpms.length ? Math.max(...bpms) : null,
      }
    })
    .filter((section) => section.tracks.length > 0)
  const reviewTracks = results.filter((track) => track.best === null || track.review || track.error)
  if (reviewTracks.length)
    sections.push({ key: 'review', tracks: reviewTracks, minBpm: null, maxBpm: null })
  return sections
}

export function applySequenceOrder<T extends { key: string; tracks: SetResult[] }>(
  groups: T[],
  orders: Record<string, string[]> | null,
): T[] {
  if (!orders) return groups
  return groups.map((group) => {
    const ids = orders[group.key]
    if (!ids) return group
    const byId = new Map(group.tracks.map((track) => [track.file, track]))
    return {
      ...group,
      tracks: ids.map((id) => byId.get(id)).filter((track): track is SetResult => Boolean(track)),
    }
  })
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
  const [sequence, setSequence] = React.useState<{
    orders: Record<string, string[]>
    transitions: Record<string, SequenceTransition>
  } | null>(null)
  const { sort, toggleSort } = useSort()
  const sortAccessors = React.useMemo(
    () => ({
      track: (track: SetResult) => track.title || fileName(track.file),
      bpm: (track: SetResult) => track.bpm,
      key: (track: SetResult) => track.camelot,
      section: (track: SetResult) => bestScore(track),
    }),
    [],
  )
  const visibleGroups = React.useMemo(() => {
    const sorted = sortGroups(groupSetResults(results), sort, sortAccessors)
    return applySequenceOrder(sorted, sequence?.orders ?? null)
  }, [results, sort, sortAccessors, sequence])
  const visibleResults = React.useMemo(
    () => visibleGroups.flatMap((group) => group.tracks),
    [visibleGroups],
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
        visibleResults.map((track) => ({
          path: track.file,
          title: track.title || fileName(track.file),
          artist: track.artist || '—',
          bpm: track.bpm,
          key: track.camelot,
        })),
      ),
    [setQueue, visibleResults],
  )
  const groups = visibleGroups
  const undoSnapshot = React.useRef<SetResult[] | null>(null)
  const selection = useRowSelection({
    items: visibleResults,
    getKey: (track) => track.file,
    isProtected: () => isBusy,
    onRemove: (keys) => {
      undoSnapshot.current = results
      const removed = new Set(keys)
      const next = results.filter((track) => !removed.has(track.file))
      setResults(next)
      setSequence(null)
      setResult(view, next)
      setSelectedId((current) => (removed.has(current ?? '') ? (next[0]?.file ?? null) : current))
    },
    onClear: () => {
      undoSnapshot.current = results
      setSequence(null)
      setResults([])
      setResult(view, [])
      setSelectedId(null)
    },
    onRestore: () => {
      if (undoSnapshot.current) {
        setSequence(null)
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
  const orderSet = async () => {
    const sections = groupSetResults(results)
      .filter((group): group is typeof group & { key: SectionKey } => group.key !== 'review')
      .map((group) => ({
        key: group.key,
        tracks: group.tracks.map((track) => ({
          id: track.file,
          bpm: track.bpm,
          camelot: track.camelot,
          artist: track.artist,
        })),
      }))
    try {
      const response = await fetch('/api/set-sequence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sections }),
      })
      const data = (await response.json()) as {
        ok: boolean
        sections?: Array<{ key: string; order: string[]; transitions: SequenceTransition[] }>
        error?: string
      }
      if (!response.ok || !data.ok || !data.sections)
        throw new Error(data.error || `Sequence failed: ${response.status}`)
      const orders: Record<string, string[]> = {}
      const transitions: Record<string, SequenceTransition> = {}
      for (const section of data.sections) {
        orders[section.key] = section.order
        for (const item of section.transitions) if (item.to) transitions[item.to] = item
      }
      setSequence({ orders, transitions })
    } catch (sequenceError) {
      setError(sequenceError instanceof Error ? sequenceError.message : String(sequenceError))
    }
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
          current.map((track) =>
            track.file === file ? mergeTrackMetadata(track, metadata) : track,
          ),
        ),
      )
    })
  }
  const exportPlaylists = async () => {
    const outputDir = await electron.openDirectory(t('sets.exportChooseFolder'))
    if (!outputDir) return
    const payload = {
      outputDir,
      baseName: folders.input ? fileName(folders.input) : 'MusicKind Set',
      groups: Object.fromEntries(
        groups.map((group) => [
          group.key,
          group.tracks.map((track) => ({
            path: track.file,
            title: track.title,
            artist: track.artist,
            duration: (track as SetResult & { duration?: number }).duration,
          })),
        ]),
      ),
    }
    try {
      const sendExport = async (body: typeof payload & { overwrite?: boolean }) => {
        const response = await fetch('/api/set-export', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        const data = await response.json()
        if (!response.ok) {
          const failure = new Error(data.error || `Export failed: ${response.status}`) as Error & {
            status: number
            existing?: string[]
          }
          failure.status = response.status
          failure.existing = data.existing
          throw failure
        }
        return data as { ok: boolean; written: string[] }
      }
      let response: { ok: boolean; written: string[] }
      try {
        response = await sendExport(payload)
      } catch (conflictError) {
        const conflict = conflictError as Error & { status?: number; existing?: string[] }
        if (conflict.status !== 409) throw conflictError
        const confirmed = window.confirm(
          t('sets.exportOverwrite').replace('{{names}}', conflict.existing?.join(', ') ?? ''),
        )
        if (exportConflictAction(conflict.status, confirmed) === 'cancel') return
        response = await sendExport({ ...payload, overwrite: true })
      }
      toast.success(t('sets.exportDone').replace('{{count}}', String(response.written.length)), {
        action: {
          label: t('sets.exportShow'),
          onClick: () => void electron.showInFolder(response.written[0]),
        },
      })
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : String(exportError))
    }
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
            {results.length > 0 && !isBusy && (
              <>
                {sequence ? (
                  <Button variant="outline" size="sm" onClick={() => setSequence(null)}>
                    {t('sets.originalOrder')}
                  </Button>
                ) : (
                  <Button variant="outline" size="sm" onClick={() => void orderSet()}>
                    <ArrowDownUp />
                    {t('sets.sequence')}
                  </Button>
                )}
                <Button variant="outline" size="sm" onClick={() => void exportPlaylists()}>
                  <Download />
                  {t('sets.export')}
                </Button>
              </>
            )}
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
          <div className="min-h-0 flex-1 overflow-auto px-6 pt-0 pb-2">
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
                  <SortableHeader
                    sort={sort}
                    sortKey="track"
                    onSort={(key) => {
                      setSequence(null)
                      toggleSort(key)
                    }}
                  >
                    {t('sets.track')}
                  </SortableHeader>
                  <SortableHeader
                    className="w-20"
                    sort={sort}
                    sortKey="bpm"
                    onSort={(key) => {
                      setSequence(null)
                      toggleSort(key)
                    }}
                  >
                    {t('sets.bpm')}
                  </SortableHeader>
                  <SortableHeader
                    className="w-20"
                    sort={sort}
                    sortKey="key"
                    onSort={(key) => {
                      setSequence(null)
                      toggleSort(key)
                    }}
                  >
                    {t('sets.key')}
                  </SortableHeader>
                  <SortableHeader
                    className="w-36"
                    sort={sort}
                    sortKey="section"
                    onSort={(key) => {
                      setSequence(null)
                      toggleSort(key)
                    }}
                  >
                    {t('sets.section')}
                  </SortableHeader>
                  {sequence && <th className="w-28 text-center">{t('sets.transition')}</th>}
                </tr>
              </thead>
              <tbody>
                {groups.map((group) => (
                  <React.Fragment key={group.key}>
                    <tr className="sticky top-8 z-[1] h-7 border-y border-line bg-surface-panel text-[10px] font-mono uppercase text-zinc-300">
                      <td colSpan={sequence ? 7 : 6} className="px-3">
                        {t(`sets.${group.key}`)} {group.tracks.length}
                        {group.key !== 'review' && (
                          <>
                            {' '}
                            · {group.minBpm ?? '—'}–{group.maxBpm ?? '—'} BPM
                          </>
                        )}
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
                        {...(sequence
                          ? { transition: sequence.transitions[track.file] ?? null }
                          : {})}
                        {...(sequence
                          ? {
                              fromTrack:
                                results.find(
                                  (candidate) =>
                                    candidate.file === sequence.transitions[track.file]?.from,
                                ) ?? null,
                            }
                          : {})}
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
        {selected &&
          (selected.best ? (
            <ScoreInspector track={selected} t={t} />
          ) : (
            <ReviewInspector track={selected} t={t} />
          ))}
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
  transition,
  fromTrack,
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
  transition?: SequenceTransition | null
  fromTrack?: SetResult | null
}) {
  const score = bestScore(track)
  const reviewReason =
    score === null
      ? track.error || (track.review === 'tie' ? t('sets.reviewTie') : t('sets.reviewNoSimilarity'))
      : null
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
          <TrackArtwork camelotKey={track.camelot} path={track.file} size={30} />
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
          <span
            className={`min-w-0 truncate font-mono text-[11px] tabular-nums text-zinc-300 ${reviewReason ? 'whitespace-nowrap' : ''}`}
            title={reviewReason ?? undefined}
          >
            {reviewReason ?? score}
          </span>
        </div>
      </td>
      {transition !== undefined && (
        <td className="text-center">
          <TransitionBadge
            transition={transition}
            fromTrack={fromTrack ?? null}
            toTrack={track}
            t={t}
          />
        </td>
      )}
    </tr>
  )
}

interface SequenceTransition {
  from: string | null
  to: string | null
  bpmDelta: number | null
  tempoRelation: 'same' | 'half' | 'double' | 'unknown'
  harmonic: 'same' | 'adjacent' | 'relative' | 'clash' | 'unknown'
  costBreakdown: { bpm: number; harmonic: number; artist: number }
  cost: number
}

function TransitionBadge({
  transition,
  fromTrack,
  toTrack,
  t,
}: {
  transition: SequenceTransition | null
  fromTrack: SetResult | null
  toTrack: SetResult
  t: ReturnType<typeof useT>
}) {
  if (!transition?.from) return <span className="text-zinc-600">—</span>
  const tone =
    transition.harmonic === 'clash'
      ? 'text-amber-300'
      : transition.harmonic === 'unknown'
        ? 'text-zinc-500'
        : transition.harmonic === 'same' || transition.harmonic === 'adjacent'
          ? 'text-emerald-300'
          : 'text-cyan-300'
  const delta =
    transition.bpmDelta === null
      ? '— BPM'
      : `${transition.bpmDelta > 0 ? '+' : ''}${Number(transition.bpmDelta.toFixed(1))} BPM`
  const multiplier =
    transition.tempoRelation === 'half'
      ? ' · ½×'
      : transition.tempoRelation === 'double'
        ? ' · 2×'
        : ''
  return (
    <span
      className={`font-mono text-[10px] ${tone}`}
      title={`${t('sets.transitionCost')}: ${transition.cost.toFixed(1)} (BPM ${transition.costBreakdown.bpm.toFixed(1)} + ${t(`sets.harmonic.${transition.harmonic}`)} ${transition.costBreakdown.harmonic.toFixed(1)} + ${t('sets.transitionArtist')} ${transition.costBreakdown.artist.toFixed(1)})`}
    >
      {delta}
      {' · '}
      {normalizeCamelot(fromTrack?.camelot) ?? '—'}→{normalizeCamelot(toTrack.camelot) ?? '—'}
      {multiplier}
    </span>
  )
}

function ScoreInspector({ track, t }: { track: SetResult; t: ReturnType<typeof useT> }) {
  return (
    <div className="space-y-3 rounded border border-line bg-surface-panel p-3">
      <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
        <Sparkles className="size-3.5 text-brand" />
        {t('sets.scores')}
      </div>
      <p className="text-[10px] text-zinc-500">{t('sets.affinityScale')}</p>
      {(['warmup', 'peak', 'closing'] as SectionKey[]).map((section) => {
        const value = track[section]
        const count = track.refCounts?.[section] ?? 0
        return (
          <div key={section} className="space-y-1">
            <div className="flex justify-between text-[11px]">
              <span className="text-zinc-400">{t(`sets.${section}`)}</span>
              <span className="font-mono text-zinc-200">{value === null ? '—' : value}</span>
            </div>
            {value !== null && track.best === section && (
              <p className="text-[10px] text-zinc-500">
                {t('sets.affinityExplanation')} {value}% {t('sets.ofYour')} {count}{' '}
                {t('sets.references')} {t(`sets.${section}`)}
                {count < 5 ? ` · ${t('sets.fewReferences')}` : ''}
              </p>
            )}
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

function ReviewInspector({ track, t }: { track: SetResult; t: ReturnType<typeof useT> }) {
  return (
    <div className="rounded border border-line bg-surface-panel p-3 text-[11px] text-zinc-400">
      {track.error || (track.review === 'tie' ? t('sets.reviewTie') : t('sets.reviewNoSimilarity'))}
    </div>
  )
}
