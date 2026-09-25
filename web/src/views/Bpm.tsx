import * as React from 'react'
import { Activity, AudioLines, Check, FolderOpen, Pause, Play, Plus, Save, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { CamelotBadge } from '@/components/music/CamelotBadge'
import { CamelotWheel } from '@/components/music/CamelotWheel'
import { MiniWaveform } from '@/components/music/MiniWaveform'
import { TrackArtwork } from '@/components/music/TrackArtwork'
import { TrackInspector, type InspectorTrack } from '@/components/music/TrackInspector'
import { useT } from '@/i18n/I18nProvider'
import { getJson, postJson, useProcessStream } from '@/lib/api'
import { electron, resolveDroppedFiles } from '@/lib/electron'
import { useProcess } from '@/lib/process'
import { useView } from '@/hooks/useView'
import { Popover } from 'radix-ui'
import { CAMELOT_MAP } from '@/lib/camelot'
import { appendResults, mergeUnique } from '@/lib/list'
import { itemsFromPaths } from '@/lib/drop'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Checkbox } from '@/components/ui/checkbox'
import { useRowSelection } from '@/lib/selection'
import { SelectionControls, RowCheckbox } from '@/components/music/TableSelection'
import { usePlayer } from '@/lib/player'
import { sortRows, useSort } from '@/lib/sort'
import { SortableHeader } from '@/components/music/SortableHeader'

interface BpmResult extends InspectorTrack {
  file: string
  ok: boolean
  mode?: string | null
  camelot?: string | null
  keySource?: 'tag' | 'analysis' | null
  musicalKey?: string | null
  pending?: boolean
  index: number
}

export function isValidBpmInput(value: string): boolean {
  return /^(?:2[0-9]|[3-9][0-9]|[12][0-9]{2}|300)$/.test(value)
}

function fileName(path: string) {
  return path.split(/[\\/]/).pop() ?? path
}

async function readTrackMetadata(
  tracks: BpmResult[],
  onTrack: (id: string, metadata: { title?: string; artist?: string; bpm?: number | null }) => void,
) {
  for (let index = 0; index < tracks.length; index += 4) {
    const batch = tracks.slice(index, index + 4)
    await Promise.all(
      batch.map(async (track) => {
        try {
          const response = await getJson<{
            metadata?: { title?: string; artist?: string; bpm?: number | null }
          }>(`/api/metadata?file=${encodeURIComponent(track.file)}`)
          onTrack(track.id, response.metadata ?? {})
        } catch {
          onTrack(track.id, {})
        }
      }),
    )
  }
}

export function Bpm() {
  const { setQueue, toggle, path: playingPath } = usePlayer()
  const t = useT()
  const { view } = useView()
  const { state, run, pause, resume, cancel } = useProcessStream()
  const { results: savedResults, setActive, setResult } = useProcess()
  const [tracks, setTracks] = React.useState<BpmResult[]>(
    () => (savedResults[view] as BpmResult[] | undefined) ?? [],
  )
  const { sort, toggleSort } = useSort()
  const visibleTracks = React.useMemo(
    () =>
      sortRows(tracks, sort, {
        track: (row) => row.title,
        artist: (row) => row.artist,
        bpm: (row) => row.bpm,
        key: (row) => row.key,
      }),
    [tracks, sort],
  )
  const [selectedId, setSelectedId] = React.useState<string | null>(tracks[0]?.id ?? null)
  const [files, setFiles] = React.useState<string[]>([])
  const [seconds, setSeconds] = React.useState(60)
  const [original, setOriginal] = React.useState<
    Record<string, { bpm: number | null; key: string | null }>
  >({})
  const [dragging, setDragging] = React.useState(false)
  const undoSnapshot = React.useRef<{
    tracks: BpmResult[]
    files: string[]
    original: Record<string, { bpm: number | null; key: string | null }>
  } | null>(null)

  React.useEffect(() => {
    const stored = savedResults[view] as BpmResult[] | undefined
    if (!stored) return
    setTracks(stored)
    setFiles((current) =>
      mergeUnique(
        current,
        stored.map((track) => track.file),
        (file) => file,
      ),
    )
    setSelectedId((current) => current ?? stored[0]?.id ?? null)
    setOriginal((current) => ({
      ...Object.fromEntries(stored.map((track) => [track.id, { bpm: track.bpm, key: track.key }])),
      ...current,
    }))
  }, [savedResults, view])

  React.useEffect(() => {
    const process = state.progress
    setActive({
      processId: state.processId,
      view,
      name: t('bpm.title'),
      current: process?.current ?? 0,
      total: process?.total ?? 0,
      file: process?.file ?? null,
      status: state.status,
    })
  }, [state.progress, state.processId, state.status, setActive, t, view])

  React.useEffect(() => {
    if (!state.result || !Array.isArray(state.result)) return
    const next = (state.result as BpmResult[]).map((item, index) => ({
      ...item,
      id: item.file,
      title: fileName(item.file),
      artist: '—',
      path: item.file,
      analyzedBpm: item.bpm,
      musicalKey: item.key,
      key: item.camelot ?? item.key,
      pending: false,
      tagBpm: null,
      index: item.index ?? index + 1,
    }))
    let cancelled = false
    setTracks((current) => {
      const resultsWithMetadata = next.map((track) => {
        const previous = current.find((item) => item.file === track.file)
        return previous
          ? {
              ...track,
              title: previous.title,
              artist: previous.artist,
              tagBpm: previous.tagBpm ?? null,
            }
          : track
      })
      const merged = appendResults(current, resultsWithMetadata, (track) => track.file)
      setResult(view, merged)
      return merged
    })
    setOriginal((current) => ({
      ...current,
      ...Object.fromEntries(next.map((track) => [track.id, { bpm: track.bpm, key: track.key }])),
    }))
    setSelectedId((current) => current ?? next[0]?.id ?? null)
    void readTrackMetadata(next, (id, metadata) => {
      if (cancelled) return
      setTracks((current) => {
        const updated = current.map((track) =>
          track.id === id
            ? {
                ...track,
                title: metadata.title?.trim() || fileName(track.file),
                artist: metadata.artist?.trim() || '—',
                tagBpm: metadata.bpm ?? null,
              }
            : track,
        )
        setResult(view, updated)
        return updated
      })
    })
    return () => {
      cancelled = true
    }
  }, [state.result, setResult, t, view])

  const selected = tracks.find((track) => track.id === selectedId) ?? tracks[0] ?? null
  React.useEffect(() => {
    const active = tracks.find((track) => track.file === playingPath)
    if (active) setSelectedId(active.id)
  }, [playingPath, tracks])
  React.useEffect(
    () =>
      setQueue(
        visibleTracks.map((track) => ({
          path: track.file,
          title: track.title,
          artist: track.artist,
          bpm: track.bpm,
          key: track.key,
        })),
      ),
    [setQueue, visibleTracks],
  )
  const changed = tracks.filter(
    (track) =>
      original[track.id] &&
      (original[track.id].bpm !== track.bpm || original[track.id].key !== track.key),
  )
  const isBusy = state.status === 'running' || state.status === 'paused'
  const processingKey = state.progress?.file
  const selection = useRowSelection({
    items: visibleTracks,
    getKey: (track) => track.id,
    isProtected: (track) => isBusy && track.file === processingKey,
    onRemove: (keys) => {
      undoSnapshot.current = { tracks, files, original }
      const removed = new Set(keys)
      const next = tracks.filter((track) => !removed.has(track.id))
      setTracks(next)
      setFiles((current) => current.filter((file) => !removed.has(file)))
      setOriginal((current) =>
        Object.fromEntries(Object.entries(current).filter(([key]) => !removed.has(key))),
      )
      setResult(view, next)
      setSelectedId((current) => (removed.has(current ?? '') ? (next[0]?.id ?? null) : current))
    },
    onClear: () => {
      undoSnapshot.current = { tracks, files, original }
      setTracks([])
      setFiles([])
      setOriginal({})
      setResult(view, [])
      setSelectedId(null)
    },
    onRestore: () => {
      if (!undoSnapshot.current) return
      setTracks(undoSnapshot.current.tracks)
      setFiles(undoSnapshot.current.files)
      setOriginal(undoSnapshot.current.original)
      setResult(view, undoSnapshot.current.tracks)
      setSelectedId(undoSnapshot.current.tracks[0]?.id ?? null)
    },
    removeLabel: t('common.removed'),
    clearLabel: t('common.cleared'),
    undoLabel: t('common.undo'),
  })

  const chooseFolder = async () => {
    const directory = await electron.openDirectory(t('bpm.selectFolder'))
    if (!directory) return
    try {
      await addPaths([directory])
    } catch (error) {
      setActive({
        status: 'error',
        name: error instanceof Error ? error.message : String(error),
      })
    }
  }

  const addFiles = async () => {
    const picked = await electron.openFiles(t('bpm.selectFolder'), true)
    const paths = Array.isArray(picked) ? picked : picked ? [picked] : []
    if (paths.length) await addPaths(paths, false)
  }

  const addPaths = async (paths: string[], expand = true) => {
    const expanded = expand
      ? await itemsFromPaths(paths, async (path) => {
          const response = await getJson<{ files?: string[] }>(
            `/api/metadata/list?dir=${encodeURIComponent(path)}&recursive=true`,
          )
          return response.files ?? []
        })
      : paths.map((path) => ({ path, root: null }))
    const incoming = expanded.map((item) => item.path)
    if (!incoming.length) throw new Error(t('bpm.noFiles'))
    const newFiles = incoming.filter((file) => !files.includes(file))
    setFiles((current) => mergeUnique(current, incoming, (file) => file))
    const placeholders = newFiles.map((file, index) => ({
      id: file,
      file,
      path: file,
      title: fileName(file),
      artist: '—',
      bpm: null,
      key: null,
      ok: false,
      pending: true,
      index: tracks.length + index + 1,
    }))
    if (!placeholders.length) return
    setTracks((current) => {
      const merged = mergeUnique(current, placeholders, (track) => track.file)
      setResult(view, merged)
      return merged
    })
    setSelectedId((current) => current ?? placeholders[0]?.id ?? null)
    void readTrackMetadata(placeholders, (id, metadata) => {
      setTracks((current) => {
        const updated = current.map((track) =>
          track.id === id && track.pending
            ? {
                ...track,
                title: metadata.title?.trim() || fileName(track.file),
                artist: metadata.artist?.trim() || '—',
                tagBpm: metadata.bpm ?? null,
              }
            : track,
        )
        setResult(view, updated)
        return updated
      })
    })
  }

  const start = async () => {
    const pending = files.filter((file) => !tracks.some((track) => track.file === file && track.ok))
    if (!pending.length) return
    await run('/api/bpm/analyze', { files: pending, analysisSeconds: seconds })
  }

  const save = async (selection: BpmResult[]) => {
    await Promise.all(
      selection.map(async (track) => {
        try {
          await postJson('/api/metadata/write', {
            filePath: track.path,
            metadata: {
              bpm: track.bpm === null ? null : Math.round(track.bpm),
              key: track.musicalKey ?? track.key,
            },
          })
          setOriginal((current) => ({
            ...current,
            [track.id]: { bpm: track.bpm, key: track.key },
          }))
        } catch (error) {
          toast.error(
            `${fileName(track.file)}: ${error instanceof Error ? error.message : String(error)}`,
          )
        }
      }),
    )
  }

  const update = (id: string, patch: Partial<BpmResult>) => {
    setTracks((current) =>
      current.map((track) => (track.id === id ? { ...track, ...patch } : track)),
    )
  }

  const onDrop = async (event: React.DragEvent) => {
    event.preventDefault()
    try {
      const dropped = await resolveDroppedFiles(event.dataTransfer.files)
      await addPaths(dropped)
    } catch (error) {
      setActive({
        status: 'error',
        name: error instanceof Error ? error.message : String(error),
      })
    }
  }

  const pending = files.filter((file) => !tracks.some((track) => track.file === file && track.ok))

  return (
    <div
      className="relative flex h-full min-w-0 overflow-hidden"
      onDragEnter={(event) => {
        event.preventDefault()
        setDragging(true)
      }}
      onDragOver={(event) => event.preventDefault()}
      onDragLeave={(event) => {
        if (event.currentTarget === event.target) setDragging(false)
      }}
      onDrop={(event) => {
        setDragging(false)
        void onDrop(event)
      }}
    >
      {dragging && <DropOverlay label={t('bpm.dropToAdd')} />}
      <section className="flex min-w-0 flex-1 flex-col">
        <header className="relative flex h-12 shrink-0 items-center justify-between border-b border-line px-6">
          <div className="flex items-center gap-3">
            <h1 className="text-[15px] font-semibold">{t('bpm.title')}</h1>
            <span className="font-mono text-[11px] text-zinc-500">
              {files.length} {t('bpm.tracks')} · {pending.length} {t('bpm.pending')}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <SelectionControls selection={selection} t={t} hasRows={tracks.length > 0} />
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label={t('bpm.addFolder')}
                    onClick={() => void chooseFolder()}
                  >
                    <FolderOpen />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{t('bpm.addFolder')}</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label={t('bpm.addFiles')}
                    onClick={() => void addFiles()}
                  >
                    <Plus />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{t('bpm.addFiles')}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
            {isBusy && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={state.status === 'paused' ? resume : pause}
                >
                  {state.status === 'paused' ? <Play /> : <Pause />}
                  {state.status === 'paused' ? t('bpm.resume') : t('bpm.pause')}
                </Button>
                <Button variant="outline" size="sm" onClick={() => void cancel()}>
                  <X />
                  {t('bpm.cancel')}
                </Button>
              </>
            )}
            {changed.length > 0 && (
              <Button variant="outline" size="sm" onClick={() => void save(changed)}>
                <Save />
                {t('bpm.saveChanges')} {changed.length}
              </Button>
            )}
            <Button size="sm" onClick={() => void start()} disabled={isBusy || !pending.length}>
              <Activity />
              {t('bpm.analyze')} {pending.length}
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
        <div className="flex h-11 shrink-0 items-center justify-between border-b border-line px-6 text-[11px] text-zinc-500">
          {files.length > 0 ? (
            <span className="flex min-w-0 items-center gap-2 truncate">
              <FolderOpen className="size-3.5" />
              <span className="truncate font-mono text-zinc-300">
                {files.length} {t('bpm.files')}
              </span>
            </span>
          ) : (
            <span />
          )}
          <label className="flex w-56 items-center gap-2">
            <span className="shrink-0">{t('bpm.seconds')}</span>
            <Slider
              min={30}
              max={120}
              step={15}
              value={[seconds]}
              onValueChange={([value]) => setSeconds(value)}
              disabled={isBusy}
              aria-label={t('bpm.seconds')}
            />
            <span className="w-8 font-mono text-zinc-300">{seconds}s</span>
          </label>
        </div>
        {isBusy && (
          <div className="flex items-center justify-end gap-2 border-b border-line px-6 py-2 font-mono text-[11px] text-zinc-400">
            <span className="text-zinc-200">
              {state.progress?.current ?? 0}/{state.progress?.total ?? files.length}
            </span>
            <span className="truncate">{state.progress?.file}</span>
          </div>
        )}
        {!tracks.length && !isBusy ? (
          <EmptyState
            title={
              state.status === 'error'
                ? (state.error ?? t('bpm.errorTitle'))
                : t('bpm.chooseFolder')
            }
            action={state.status === 'error' ? t('bpm.retry') : undefined}
            onAction={chooseFolder}
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
                  <SortableHeader sort={sort} sortKey="track" onSort={toggleSort}>
                    {t('bpm.tableTrack')}
                  </SortableHeader>
                  <SortableHeader className="w-40" sort={sort} sortKey="artist" onSort={toggleSort}>
                    {t('common.artist')}
                  </SortableHeader>
                  <SortableHeader className="w-24" sort={sort} sortKey="bpm" onSort={toggleSort}>
                    {t('bpm.tableBpm')}
                  </SortableHeader>
                  <SortableHeader className="w-24" sort={sort} sortKey="key" onSort={toggleSort}>
                    {t('bpm.tableKey')}
                  </SortableHeader>
                  <th className="w-24 text-right">{t('bpm.tableActions')}</th>
                </tr>
              </thead>
              <tbody>
                {visibleTracks.map((track, index) => (
                  <BpmRow
                    key={track.id}
                    track={track}
                    index={index}
                    isPlaying={track.file === playingPath}
                    selected={track.id === selectedId}
                    processing={state.progress?.file === track.file && isBusy}
                    changed={Boolean(
                      original[track.id] &&
                      (original[track.id].bpm !== track.bpm ||
                        original[track.id].key !== track.key),
                    )}
                    onSelect={() => setSelectedId(track.id)}
                    onPlay={() => {
                      setSelectedId(track.id)
                      toggle(track.file)
                    }}
                    onUpdate={update}
                    onSave={() => void save([track])}
                    checked={selection.selected.includes(track.id)}
                    disabled={isBusy && track.file === processingKey}
                    onCheck={(shiftKey) => selection.toggle(track.id, shiftKey)}
                    t={t}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <TrackInspector
        track={selected}
        onKeyChange={(key) => selected && update(selected.id, { key })}
      >
        {selected && (
          <div className="space-y-2 rounded border border-line bg-surface-panel p-3 font-mono text-[11px]">
            <p className="font-sans text-[10px] uppercase tracking-wider text-zinc-500">
              {t('bpm.beats')}
            </p>
            <div className="flex justify-between">
              <span className="text-zinc-500">{t('bpm.original')}</span>
              <span>{original[selected.id]?.bpm ?? '—'} BPM</span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-500">{t('bpm.current')}</span>
              <span className="text-brand">
                {selected.bpm === null || selected.bpm === undefined
                  ? '—'
                  : Math.round(selected.bpm)}{' '}
                BPM
              </span>
            </div>
          </div>
        )}
      </TrackInspector>
    </div>
  )
}

function DropOverlay({ label }: { label: string }) {
  return (
    <div className="pointer-events-none absolute inset-3 z-20 flex items-center justify-center rounded border-2 border-dashed border-brand bg-surface-app/90 text-sm font-semibold text-brand">
      {label}
    </div>
  )
}

function BpmRow({
  track,
  index,
  isPlaying,
  selected,
  processing,
  changed,
  onSelect,
  onPlay,
  onUpdate,
  onSave,
  t,
  checked,
  disabled,
  onCheck,
}: {
  track: BpmResult
  index: number
  isPlaying: boolean
  selected: boolean
  processing: boolean
  changed: boolean
  onSelect: () => void
  onPlay: () => void
  onUpdate: (id: string, patch: Partial<BpmResult>) => void
  onSave: () => void
  t: ReturnType<typeof useT>
  checked: boolean
  disabled: boolean
  onCheck: (shiftKey: boolean) => void
}) {
  const [draft, setDraft] = React.useState(track.bpm === null ? '' : String(Math.round(track.bpm)))
  const valid = draft === '' || isValidBpmInput(draft)

  React.useEffect(() => {
    setDraft(track.bpm === null ? '' : String(Math.round(track.bpm)))
  }, [track.bpm])

  const updateBpm = (value: string) => {
    setDraft(value)
    if (value === '') {
      onUpdate(track.id, { bpm: null })
    } else if (isValidBpmInput(value)) {
      onUpdate(track.id, { bpm: Number(value) })
    }
  }

  return (
    <tr
      onClick={onSelect}
      onDoubleClick={track.pending ? undefined : onPlay}
      className={`h-12 cursor-pointer ${selected ? 'bg-white/[0.06]' : 'hover:bg-white/[0.04]'}`}
    >
      <td
        className="text-center font-mono text-[11px] text-zinc-500"
        onClick={(event) => event.stopPropagation()}
      >
        <RowCheckbox checked={checked} disabled={disabled} label={track.title} onClick={onCheck} />
      </td>
      <td className="text-center font-mono text-[11px] text-zinc-500">
        {track.pending ? (
          '—'
        ) : processing ? (
          <span className="mx-auto block size-2 rounded-full bg-brand" />
        ) : isPlaying ? (
          <AudioLines className="mx-auto size-4 text-brand" />
        ) : (
          String(index + 1).padStart(2, '0')
        )}
      </td>
      <td>
        <div className="flex items-center gap-3">
          <TrackArtwork camelotKey={track.key} path={track.file} size={30} />
          <div className="min-w-0">
            <p className="truncate text-[12px] text-zinc-200">{track.title}</p>
          </div>
          <MiniWaveform path={track.file} isSelected={selected} />
        </div>
      </td>
      <td
        className={`w-40 truncate pr-2 text-[12px] ${track.artist?.trim() && track.artist !== '—' ? 'text-zinc-300' : 'text-zinc-600'}`}
        title={track.artist && track.artist !== '—' ? track.artist : undefined}
      >
        {track.artist && track.artist !== '—' ? track.artist : '—'}
      </td>
      {track.pending ? (
        <>
          <td className="font-mono text-[11px] text-zinc-500">{t('bpm.statusPending')}</td>
          <td className="text-center text-zinc-600">—</td>
          <td className="pr-2 text-right text-[11px] text-zinc-500">{t('bpm.statusPending')}</td>
        </>
      ) : (
        <>
          <td onClick={(event) => event.stopPropagation()}>
            <input
              className={`w-16 rounded border bg-transparent px-1 font-mono text-[12px]
            text-zinc-100 focus:bg-surface-panel focus:outline-none ${
              valid
                ? 'border-transparent focus:border-brand'
                : 'border-red-500/70 focus:border-red-500'
            }`}
              type="text"
              inputMode="numeric"
              value={draft}
              onChange={(event) => updateBpm(event.target.value)}
              aria-invalid={!valid}
            />
          </td>
          <td onClick={(event) => event.stopPropagation()}>
            <Popover.Root>
              <Popover.Trigger asChild>
                <button type="button" className="cursor-pointer">
                  <CamelotBadge camelotKey={track.key} keySource={track.keySource} />
                </button>
              </Popover.Trigger>
              <Popover.Portal>
                <Popover.Content className="rounded border border-line bg-surface-panel p-3 shadow-xl">
                  <p className="mb-2 text-[10px] uppercase tracking-wider text-zinc-500">
                    {t('music.harmonicWheel')}
                  </p>
                  <CamelotWheel
                    currentKey={track.key}
                    size={140}
                    onSelectKey={(key) =>
                      onUpdate(track.id, {
                        key,
                        camelot: key,
                        musicalKey: CAMELOT_MAP[key].musicalKey,
                      })
                    }
                  />
                </Popover.Content>
              </Popover.Portal>
            </Popover.Root>
          </td>
          <td className="pr-2 text-right">
            {changed ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={(event) => {
                  event.stopPropagation()
                  onSave()
                }}
              >
                <Save />
                {t('bpm.saveOne')}
              </Button>
            ) : (
              <Check className="ml-auto size-3.5 text-zinc-600" />
            )}
          </td>
        </>
      )}
    </tr>
  )
}

function EmptyState({
  title,
  action,
  onAction,
  onDrop,
}: {
  title: string
  action?: string
  onAction: () => void
  onDrop?: (event: React.DragEvent) => void
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onAction}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') onAction()
      }}
      onDragOver={(event) => event.preventDefault()}
      onDrop={onDrop}
      className="flex min-h-0 flex-1 cursor-pointer flex-col items-center justify-center
        gap-3 border-2 border-dashed border-zinc-800 p-8 text-center hover:border-zinc-700"
    >
      <span className="flex size-12 items-center justify-center rounded-full border border-dashed border-zinc-700 text-brand">
        <FolderOpen className="size-5" />
      </span>
      <span className="text-[15px] font-semibold text-zinc-200">{title}</span>
      {action ? (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation()
            onAction()
          }}
          className="text-[12px] text-brand hover:text-brand-hover"
        >
          {action}
        </button>
      ) : null}
    </div>
  )
}
