import * as React from 'react'
import {
  Activity,
  AudioLines,
  Check,
  FolderOpen,
  Pause,
  Play,
  Plus,
  Save,
  Tags,
  X,
} from 'lucide-react'
import * as SwitchPrimitive from '@radix-ui/react-switch'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { CamelotBadge } from '@/components/music/CamelotBadge'
import { TrackArtwork } from '@/components/music/TrackArtwork'
import { TrackInspector, type InspectorTrack } from '@/components/music/TrackInspector'
import { useT, type TranslationKey } from '@/i18n/I18nProvider'
import { getJson, postJson, useProcessStream } from '@/lib/api'
import { electron, resolveDroppedFiles } from '@/lib/electron'
import { useProcess } from '@/lib/process'
import { useView } from '@/hooks/useView'
import { Popover } from 'radix-ui'
import { Checkbox } from '@/components/ui/checkbox'
import { useRowSelection } from '@/lib/selection'
import { SelectionControls, RowCheckbox } from '@/components/music/TableSelection'
import { usePlayer } from '@/lib/player'
import { useVirtualizer } from '@tanstack/react-virtual'
import { streamProcess } from '@/lib/api'
import {
  buildClassifyMoves,
  changeTagGenre,
  filterTagResults,
  tagResultCounts,
  mergeTrackMetadata,
  canonicalTagDistribution,
  type TagResult,
  type TagStatusFilter,
} from '@/lib/tag-classifier'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { toast } from 'sonner'
import { defaultSetPlaylistSections, type SetPlaylistSections } from '@/lib/set-playlists'
import { sortRows, useSort } from '@/lib/sort'
import { SortableHeader } from '@/components/music/SortableHeader'

const SOURCE_LABEL_KEYS: Record<string, TranslationKey> = {
  embedded: 'classifier.sourceLabels.embedded',
  online: 'classifier.sourceLabels.online',
  discogs: 'classifier.sourceLabels.discogs',
  lastfm: 'classifier.sourceLabels.lastfm',
  bpm: 'classifier.sourceLabels.bpm',
  override: 'classifier.sourceLabels.override',
  filtered: 'classifier.sourceLabels.filtered',
  unmatched: 'classifier.sourceLabels.unmatched',
}

export function sourceLabelKey(source: string): TranslationKey {
  return SOURCE_LABEL_KEYS[source] ?? 'classifier.sourceLabels.unmatched'
}

export interface ClassifierResult extends InspectorTrack {
  path: string
  genre: string
  source: string | null
  destination: string | null
  reason?: string | null
  error?: string
}

export function genreDistribution(results: ClassifierResult[]) {
  const counts = results.reduce<Record<string, number>>((acc, result) => {
    acc[result.genre] = (acc[result.genre] ?? 0) + 1
    return acc
  }, {})
  const total = results.length
  return Object.entries(counts)
    .sort(([, left], [, right]) => right - left)
    .map(([genre, count], index) => ({
      genre,
      count,
      percentage: total ? (count / total) * 100 : 0,
      majority: index === 0,
    }))
}

function fileName(path: string) {
  return path.split(/[\\/]/).pop() ?? path
}

function normalizeResult(result: Partial<ClassifierResult> & { path: string }): ClassifierResult {
  return {
    id: result.path,
    path: result.path,
    title: result.title?.trim() || fileName(result.path),
    artist: result.artist?.trim() || '—',
    bpm: result.bpm ?? null,
    key: result.key ?? null,
    genre: result.genre || '—',
    source: result.source ?? null,
    destination: result.destination ?? null,
    reason: result.reason ?? null,
  }
}

async function readTrackMetadata(
  tracks: ClassifierResult[],
  onTrack: (
    path: string,
    metadata: { title?: string; artist?: string; bpm?: number | null; key?: string | null },
  ) => void,
) {
  for (let index = 0; index < tracks.length; index += 4) {
    await Promise.all(
      tracks.slice(index, index + 4).map(async (track) => {
        try {
          const response = await getJson<{
            metadata?: {
              title?: string
              artist?: string
              bpm?: number | null
              key?: string | null
            }
          }>(`/api/metadata?file=${encodeURIComponent(track.path)}`)
          onTrack(track.path, response.metadata ?? {})
        } catch {
          onTrack(track.path, {})
        }
      }),
    )
  }
}

export function Classifier() {
  const [method, setMethod] = React.useState('tags')
  return method === 'tags' ? (
    <TagClassifier method={method} onMethodChange={setMethod} />
  ) : (
    <LegacyClassifier method={method} onMethodChange={setMethod} />
  )
}

function LegacyClassifier({
  method,
  onMethodChange,
}: {
  method: string
  onMethodChange: (method: string) => void
}) {
  const { setQueue, toggle, path: playingPath } = usePlayer()
  const t = useT()
  const { view } = useView()
  const { state, run, pause, resume, cancel } = useProcessStream()
  const { results: savedResults, setActive, setResult } = useProcess()
  const [results, setResults] = React.useState<ClassifierResult[]>(
    () => (savedResults[view] as ClassifierResult[] | undefined) ?? [],
  )
  const { sort, toggleSort } = useSort()
  const visibleResults = React.useMemo(
    () =>
      sortRows(results, sort, {
        track: (row) => row.title,
        artist: (row) => row.artist,
        genre: (row) => row.genre,
        bpm: (row) => row.bpm,
        status: (row) => (row.error ? row.error : row.source || 'ok'),
      }),
    [results, sort],
  )
  const [folder, setFolder] = React.useState<string | null>(null)
  const [selectedId, setSelectedId] = React.useState<string | null>(results[0]?.id ?? null)
  const [genres, setGenres] = React.useState<string[]>([])
  const [genreDraft, setGenreDraft] = React.useState('')
  const [configError, setConfigError] = React.useState<string | null>(null)
  const isBusy = state.status === 'running' || state.status === 'paused'
  const selected = results.find((result) => result.id === selectedId) ?? results[0] ?? null
  React.useEffect(() => {
    const active = results.find((result) => result.path === playingPath)
    if (active) setSelectedId(active.id)
  }, [playingPath, results])
  React.useEffect(
    () =>
      setQueue(
        visibleResults.map((track) => ({
          path: track.path,
          title: track.title,
          artist: track.artist,
          bpm: track.bpm,
          key: track.key,
        })),
      ),
    [setQueue, visibleResults],
  )
  const distribution = React.useMemo(() => genreDistribution(results), [results])
  const undoSnapshot = React.useRef<ClassifierResult[] | null>(null)
  const selection = useRowSelection({
    items: visibleResults,
    getKey: (result) => result.id,
    isProtected: () => isBusy,
    onRemove: (keys) => {
      undoSnapshot.current = results
      const removed = new Set(keys)
      const next = results.filter((result) => !removed.has(result.id))
      setResults(next)
      setResult(view, next)
      setSelectedId((current) => (removed.has(current ?? '') ? (next[0]?.id ?? null) : current))
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
        setSelectedId(undoSnapshot.current[0]?.id ?? null)
      }
    },
    removeLabel: t('common.removed'),
    clearLabel: t('common.cleared'),
    undoLabel: t('common.undo'),
  })

  React.useEffect(() => {
    const stored = savedResults[view] as ClassifierResult[] | undefined
    if (stored) setResults(stored)
  }, [savedResults, view])

  React.useEffect(() => {
    setActive({
      processId: state.processId,
      view,
      name: t('classifier.title'),
      current: state.progress?.current ?? 0,
      total: state.progress?.total ?? 0,
      file: state.progress?.file ?? null,
      status: state.status,
    })
  }, [setActive, state, t, view])

  React.useEffect(() => {
    let cancelled = false
    void Promise.all([
      getJson<{ genres?: string[] }>('/api/genres'),
      getJson<{
        settings?: {
          defaultOutputDir?: string
        }
      }>('/api/settings'),
    ])
      .then(([genreResponse, settingsResponse]) => {
        if (cancelled) return
        setGenres(genreResponse.genres ?? [])
        void settingsResponse
      })
      .catch(() => {
        if (!cancelled) setConfigError(t('classifier.settingsError'))
      })
    return () => {
      cancelled = true
    }
  }, [t])

  const onResult = React.useCallback(
    (value: unknown) => {
      if (!Array.isArray(value)) return
      const next = (value as Array<Partial<ClassifierResult> & { path: string }>).map(
        normalizeResult,
      )
      setResults(next)
      setResult(view, next)
      setSelectedId(next[0]?.id ?? null)
      void readTrackMetadata(next, (path, metadata) => {
        setResults((current) => {
          const updated = current.map((result) =>
            result.path === path
              ? {
                  ...result,
                  title: metadata.title?.trim() || result.title,
                  artist: metadata.artist?.trim() || result.artist,
                  bpm: metadata.bpm ?? result.bpm,
                  key: metadata.key ?? result.key,
                }
              : result,
          )
          setResult(view, updated)
          return updated
        })
      })
    },
    [setResult, view],
  )

  const chooseFolder = async () => {
    const directory = await electron.openDirectory(t('classifier.selectFolder'))
    if (directory) setFolder(directory)
  }

  const onDrop = async (event: React.DragEvent) => {
    event.preventDefault()
    try {
      const dropped = await resolveDroppedFiles(event.dataTransfer.files)
      if (dropped[0]) setFolder(dropped[0])
    } catch (error) {
      setConfigError(error instanceof Error ? error.message : String(error))
    }
  }

  const analyze = async () => {
    if (!folder || isBusy) return
    setConfigError(null)
    setResults([])
    await run('/api/genre-classify', { inputPath: folder, dryRun: true }, onResult)
  }

  const updateGenre = (id: string, genre: string) => {
    setResults((current) => {
      const next = current.map((result) => (result.id === id ? { ...result, genre } : result))
      setResult(view, next)
      return next
    })
  }

  const saveGenres = async () => {
    const next = genres.map((genre) => genre.trim()).filter(Boolean)
    if (!next.length) return
    try {
      const response = await postJson<{ genres: string[] }>('/api/genres', { genres: next })
      setGenres(response.genres ?? next)
    } catch (error) {
      setConfigError(error instanceof Error ? error.message : String(error))
    }
  }

  const addGenre = () => {
    const value = genreDraft.trim()
    if (value && !genres.includes(value)) setGenres((current) => [...current, value])
    setGenreDraft('')
  }

  const selectedTrack: InspectorTrack | null = selected
    ? { ...selected, analyzedBpm: null, tagBpm: selected.bpm }
    : null

  return (
    <div className="flex h-full min-w-0 overflow-hidden">
      <section className="flex min-w-0 flex-1 flex-col">
        <header className="relative flex h-12 shrink-0 items-center justify-between border-b border-line px-6">
          <div className="flex items-center gap-3">
            <h1 className="text-[15px] font-semibold">{t('classifier.title')}</h1>
            {results.length > 0 && (
              <span className="font-mono text-[11px] text-zinc-500">
                {results.length} {t('classifier.tracks')}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Select value={method} onValueChange={onMethodChange}>
              <SelectTrigger className="h-8 w-56 text-[11px]" aria-label={t('classifier.method')}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="tags">{t('classifier.methodTags')}</SelectItem>
                <SelectItem value="legacy">{t('classifier.methodOnline')}</SelectItem>
              </SelectContent>
            </Select>
            <SelectionControls selection={selection} t={t} hasRows={results.length > 0} />
            {isBusy && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={state.status === 'paused' ? resume : pause}
                >
                  {state.status === 'paused' ? <Play /> : <Pause />}
                  {state.status === 'paused' ? t('classifier.resume') : t('classifier.pause')}
                </Button>
                <Button variant="outline" size="sm" onClick={() => void cancel()}>
                  <X /> {t('classifier.cancel')}
                </Button>
              </>
            )}
            <TooltipProvider delayDuration={0}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <label className="flex h-8 items-center gap-2 rounded border border-line px-2 text-[11px] text-zinc-400">
                    <SwitchPrimitive.Root
                      checked
                      disabled
                      aria-label={t('classifier.simulation')}
                      className="inline-flex h-4 w-7 shrink-0 items-center rounded-full border border-line bg-zinc-800 transition-colors data-[state=checked]:border-brand data-[state=checked]:bg-brand/70 disabled:cursor-not-allowed disabled:opacity-70"
                    >
                      <SwitchPrimitive.Thumb className="pointer-events-none block size-3 rounded-full bg-zinc-400 transition-transform data-[state=checked]:translate-x-3 data-[state=checked]:bg-white" />
                    </SwitchPrimitive.Root>
                    {t('classifier.simulation')}
                  </label>
                </TooltipTrigger>
                <TooltipContent>{t('classifier.simulationHint')}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <Button size="sm" onClick={() => void analyze()} disabled={isBusy || !folder}>
              <Activity /> {t('classifier.analyze')}
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
        <div className="flex min-h-11 shrink-0 items-center justify-between border-b border-line px-6 py-2 text-[11px] text-zinc-500">
          {folder ? (
            <button
              type="button"
              onClick={chooseFolder}
              className="flex min-w-0 items-center gap-2 truncate hover:text-zinc-300"
            >
              <FolderOpen className="size-3.5" />
              <span className="truncate font-mono text-zinc-300">{folder}</span>
            </button>
          ) : (
            <span />
          )}
          <Popover.Root>
            <Popover.Trigger asChild>
              <Button variant="outline" size="sm">
                <Tags /> {t('classifier.genres')} · {genres.length}
              </Button>
            </Popover.Trigger>
            <Popover.Portal>
              <Popover.Content
                align="end"
                className="w-72 space-y-3 rounded border border-line bg-surface-panel p-3 shadow-xl"
              >
                <div className="flex flex-wrap gap-1.5">
                  {genres.map((genre) => (
                    <button
                      key={genre}
                      type="button"
                      onClick={() =>
                        setGenres((current) => current.filter((item) => item !== genre))
                      }
                      className="rounded border border-line px-2 py-1 text-[11px] text-zinc-300 hover:border-brand hover:text-brand"
                    >
                      {genre} ×
                    </button>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Input
                    value={genreDraft}
                    onChange={(event) => setGenreDraft(event.target.value)}
                    onKeyDown={(event) => event.key === 'Enter' && addGenre()}
                    placeholder={t('classifier.addGenre')}
                  />
                  <Button size="icon-sm" onClick={addGenre} aria-label={t('classifier.addGenre')}>
                    <Plus />
                  </Button>
                </div>
                <Button size="sm" className="w-full" onClick={() => void saveGenres()}>
                  <Save /> {t('classifier.saveGenres')}
                </Button>
              </Popover.Content>
            </Popover.Portal>
          </Popover.Root>
        </div>
        {isBusy && (
          <div className="flex items-center justify-end gap-2 border-b border-line px-6 py-2 font-mono text-[11px] text-zinc-400">
            <span className="text-zinc-200">
              {state.progress?.current ?? 0}/{state.progress?.total ?? 0}
            </span>
            <span className="truncate">{state.progress?.file}</span>
          </div>
        )}
        {!results.length && !isBusy ? (
          <EmptyState
            title={
              state.status === 'error'
                ? (state.error ?? t('classifier.error'))
                : t('classifier.chooseFolder')
            }
            action={state.status === 'error' ? t('classifier.retry') : undefined}
            onAction={state.status === 'error' ? () => void analyze() : chooseFolder}
            onDrop={onDrop}
          />
        ) : results.length ? (
          <ResultsTable
            results={visibleResults}
            sort={sort}
            toggleSort={toggleSort}
            selectedId={selected?.id ?? null}
            playingPath={playingPath}
            onSelect={setSelectedId}
            onPlay={(track) => {
              setSelectedId(track.id)
              toggle(track.path)
            }}
            onGenreChange={updateGenre}
            genres={genres}
            t={t}
            selection={selection}
            busy={isBusy}
          />
        ) : (
          <RunningState t={t} />
        )}
        {configError && (
          <div className="border-t border-amber-500/30 bg-amber-500/5 px-6 py-2 text-[11px] text-amber-200">
            {configError}
          </div>
        )}
        {distribution.length > 0 && <Distribution distribution={distribution} />}
      </section>
      <TrackInspector track={selectedTrack}>
        {selected && (
          <div className="space-y-2 rounded border border-line bg-surface-panel p-3 text-[11px]">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
              {t('classifier.details')}
            </p>
            <div className="flex justify-between gap-3">
              <span className="text-zinc-500">{t('classifier.destination')}</span>
              <span className="truncate font-mono text-right">{selected.destination ?? '—'}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-zinc-500">{t('classifier.source')}</span>
              <span>{selected.source ? t(sourceLabelKey(selected.source)) : '—'}</span>
            </div>
          </div>
        )}
      </TrackInspector>
    </div>
  )
}

interface TagClassifierSnapshot {
  inputRoot: string
  inputPaths: string[]
  destRoot: string
  results: TagResult[]
  selectedPath: string | null
  selectedPaths: string[]
  statusFilter: TagStatusFilter
  genreFilter: string
}

function TagClassifier({
  method,
  onMethodChange,
}: {
  method: string
  onMethodChange: (method: string) => void
}) {
  const t = useT()
  const { toggle, path: playingPath, setQueue } = usePlayer()
  const { results: savedResults, setResult, active, setActive } = useProcess()
  const savedSnapshot = savedResults['classifier-tags'] as TagClassifierSnapshot | undefined
  const [inputRoot, setInputRoot] = React.useState(() => savedSnapshot?.inputRoot ?? '')
  const [inputPaths, setInputPaths] = React.useState<string[]>(
    () => savedSnapshot?.inputPaths ?? [],
  )
  const [addedFileCount, setAddedFileCount] = React.useState(0)
  const [genres, setGenres] = React.useState<string[]>([])
  const [destRoot, setDestRoot] = React.useState(() => savedSnapshot?.destRoot ?? '')
  const [results, setResults] = React.useState<TagResult[]>(() => savedSnapshot?.results ?? [])
  const [selectedPath, setSelectedPath] = React.useState<string | null>(
    () => savedSnapshot?.selectedPath ?? null,
  )
  const [selectedPaths, setSelectedPaths] = React.useState<string[]>(
    () => savedSnapshot?.selectedPaths ?? [],
  )
  const [statusFilter, setStatusFilter] = React.useState<TagStatusFilter>(
    () => savedSnapshot?.statusFilter ?? 'all',
  )
  const [genreFilter, setGenreFilter] = React.useState(() => savedSnapshot?.genreFilter ?? 'all')
  const [confirmOpen, setConfirmOpen] = React.useState(false)
  const [historyOpen, setHistoryOpen] = React.useState(false)
  const [playlistsOpen, setPlaylistsOpen] = React.useState(false)
  const [playlistGenres, setPlaylistGenres] = React.useState<string[]>([])
  const [existingPlaylists, setExistingPlaylists] = React.useState<string[]>([])
  const [playlistSections, setPlaylistSections] = React.useState<SetPlaylistSections>({
    warmup: [],
    peak: [],
    closing: [],
  })
  const [playlistPreview, setPlaylistPreview] = React.useState<Record<
    string,
    {
      count: number
      skippedCount: number
      bpmMin: number | null
      bpmMax: number | null
      durationSec: number
    }
  > | null>(null)
  const [playlistWritten, setPlaylistWritten] = React.useState<string[]>([])
  const [manifests, setManifests] = React.useState<
    Array<{ manifestPath: string; createdAt: string; total: number; done: number; undone: boolean }>
  >([])
  const [error, setError] = React.useState<string | null>(null)
  const processIsActive = active.view === 'classifier-tags' && active.status === 'running'
  const [busy, setBusy] = React.useState(false)
  const [progress, setProgress] = React.useState('')
  const isBusy = busy || processIsActive
  const progressText =
    processIsActive && active.file ? `${active.current}/${active.total} · ${active.file}` : progress
  const scrollRef = React.useRef<HTMLDivElement>(null)
  const { sort: tagSort, toggleSort: toggleTagSort } = useSort()
  const filtered = React.useMemo(
    () => filterTagResults(results, statusFilter, genreFilter),
    [results, statusFilter, genreFilter],
  )
  const visibleFiltered = React.useMemo(
    () =>
      sortRows(filtered, tagSort, {
        track: (row) => row.title || fileName(row.path),
        originalTag: (row) => row.tagGenre,
        genre: (row) => row.genre || row.family,
        status: (row) => row.status,
        destination: (row) => row.destination,
      }),
    [filtered, tagSort],
  )
  React.useEffect(() => {
    setResult('classifier-tags', {
      inputRoot,
      inputPaths,
      destRoot,
      results,
      selectedPath,
      selectedPaths,
      statusFilter,
      genreFilter,
    } satisfies TagClassifierSnapshot)
  }, [
    destRoot,
    genreFilter,
    inputRoot,
    inputPaths,
    results,
    selectedPath,
    selectedPaths,
    setResult,
    statusFilter,
  ])
  const counts = React.useMemo(() => tagResultCounts(results), [results])
  const moves = React.useMemo(() => buildClassifyMoves(results), [results])
  const onlineMoveCount = React.useMemo(
    () =>
      moves.filter((move) => {
        const row = results.find((item) => item.path === move.from)
        return row?.genreSource === 'lastfm' || row?.genreSource === 'discogs'
      }).length,
    [moves, results],
  )
  const selected = results.find((item) => item.path === selectedPath) ?? results[0] ?? null
  const virtualizer = useVirtualizer({
    count: visibleFiltered.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 54,
    overscan: 8,
  })
  React.useEffect(() => {
    let cancelled = false
    void getJson<{ canonical?: string[] }>('/api/genre-aliases')
      .then((aliases) => {
        if (cancelled) return
        setGenres(aliases.canonical ?? [])
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
    return () => {
      cancelled = true
    }
  }, [])
  React.useEffect(() => {
    void setQueue(
      visibleFiltered.map((item) => ({
        path: item.path,
        title: item.title || fileName(item.path),
        artist: item.artist || '—',
        bpm: item.bpm ?? null,
        key: item.key ?? null,
      })),
    )
  }, [visibleFiltered, setQueue])
  const choose = async (label: string, setter: (path: string) => void) => {
    const path = await electron.openDirectory(label)
    if (path) setter(path)
  }
  const analyze = async () => {
    if ((!inputRoot && !inputPaths.length) || isBusy) return
    setError(null)
    setResults([])
    setSelectedPath(null)
    setSelectedPaths([])
    setBusy(true)
    setActive({ view: 'classifier-tags', name: t('classifier.title'), status: 'running' })
    await streamProcess(
      '/api/classify-by-tags',
      {
        inputRoot: inputPaths.length ? undefined : inputRoot,
        inputPaths: inputPaths.length ? inputPaths : undefined,
        destRoot: destRoot || undefined,
      },
      {
        onStart: (processId) => setActive({ processId, status: 'running' }),
        onProgress: (p) => {
          setProgress(`${p.current}/${p.total} · ${p.file}`)
          setActive({ current: p.current, total: p.total, file: p.file, status: 'running' })
        },
        onResult: (value) => {
          if (!Array.isArray(value)) return
          const rows = value as TagResult[]
          setResults(rows)
          setResult('classifier-tags', {
            inputRoot,
            inputPaths,
            destRoot,
            results: rows,
            selectedPath: rows[0]?.path ?? null,
            selectedPaths: [],
            statusFilter,
            genreFilter,
          } satisfies TagClassifierSnapshot)
          setSelectedPath(rows[0]?.path ?? null)
          void readTrackMetadata(rows as unknown as ClassifierResult[], (path, meta) =>
            setResults((current) => {
              const updated = current.map((row) =>
                row.path === path ? mergeTrackMetadata(row, meta) : row,
              )
              setResult('classifier-tags', {
                inputRoot,
                inputPaths,
                destRoot,
                results: updated,
                selectedPath: rows[0]?.path ?? null,
                selectedPaths: [],
                statusFilter,
                genreFilter,
              } satisfies TagClassifierSnapshot)
              return updated
            }),
          )
        },
        onError: setError,
        onDone: ({ success }) => {
          setBusy(false)
          setProgress('')
          setActive({ status: success ? 'done' : 'error' })
        },
      },
    )
    setBusy(false)
    setActive({ status: 'done' })
  }
  const updateMany = (paths: string[], genre: string) =>
    setResults((current) => changeTagGenre(current, paths, genre, destRoot))
  const refreshHistory = async () => {
    if (!destRoot) return
    try {
      const response = await getJson<{ manifests: typeof manifests }>(
        `/api/classify-manifests?destRoot=${encodeURIComponent(destRoot)}`,
      )
      setManifests(response.manifests ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }
  const openPlaylists = async () => {
    if (!destRoot) return
    setError(null)
    try {
      const response = await getJson<{ genres: string[]; existing: string[] }>(
        `/api/set-playlist-genres?root=${encodeURIComponent(destRoot)}`,
      )
      setPlaylistGenres(response.genres)
      setExistingPlaylists(response.existing)
      setPlaylistSections(defaultSetPlaylistSections(response.genres))
      setPlaylistPreview(null)
      setPlaylistWritten([])
      setPlaylistsOpen(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }
  const togglePlaylistGenre = (section: keyof SetPlaylistSections, genre: string) => {
    setPlaylistSections((current) => ({
      ...current,
      [section]: current[section].includes(genre)
        ? current[section].filter((item) => item !== genre)
        : [...current[section], genre],
    }))
    setPlaylistPreview(null)
  }
  const previewPlaylists = async () => {
    try {
      const response = await postJson<{ sections: NonNullable<typeof playlistPreview> }>(
        '/api/set-playlists',
        { root: destRoot, sections: playlistSections, dryRun: true },
      )
      setPlaylistPreview(response.sections)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }
  const createPlaylists = async () => {
    try {
      const sectionFiles: Record<keyof SetPlaylistSections, string> = {
        warmup: 'Warmup.m3u8',
        peak: 'Peak.m3u8',
        closing: 'Closing.m3u8',
      }
      const replacing = (Object.keys(sectionFiles) as Array<keyof SetPlaylistSections>)
        .filter((section) => (playlistPreview?.[section]?.count ?? 0) > 0)
        .map((section) => sectionFiles[section])
        .filter((name) => existingPlaylists.includes(name))
      if (
        replacing.length &&
        !window.confirm(`${t('classifier.playlistReplace')} ${replacing.join(', ')}`)
      )
        return
      const response = await postJson<{ written: string[] }>('/api/set-playlists', {
        root: destRoot,
        sections: playlistSections,
        dryRun: false,
      })
      setPlaylistWritten(response.written)
      setExistingPlaylists((current) => [
        ...new Set([
          ...current,
          ...response.written.map((file) => file.split(/[\\/]/).pop() || ''),
        ]),
      ])
      toast.success(t('classifier.playlistCreated'))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }
  const runApply = async (endpoint: string, body: Record<string, unknown>, successText: string) => {
    setBusy(true)
    setError(null)
    setConfirmOpen(false)
    let manifestPath: string | null = null
    let completed = false
    await streamProcess(endpoint, body, {
      onProgress: (p) => setProgress(`${p.current}/${p.total} · ${p.file}`),
      onResult: (value) => {
        if (
          value &&
          typeof value === 'object' &&
          'manifestPath' in value &&
          typeof value.manifestPath === 'string'
        )
          manifestPath = value.manifestPath
      },
      onError: setError,
      onDone: ({ success }) => {
        completed = success
        setBusy(false)
        setProgress('')
        if (success && manifestPath && endpoint.endsWith('apply'))
          toast.success(successText, {
            action: {
              label: t('classifier.undo'),
              onClick: () =>
                void runApply('/api/classify-undo', { manifestPath }, t('classifier.undone')),
            },
          })
        else if (success) toast.success(successText)
        void refreshHistory()
      },
    })
    setBusy(false)
    if (completed && endpoint.endsWith('apply')) {
      setResults((current) =>
        current.filter((row) => !moves.some((move) => move.from === row.path)),
      )
      setSelectedPaths([])
    }
  }
  const selectedTrack: InspectorTrack | null = selected
    ? {
        id: selected.path,
        path: selected.path,
        title: selected.title || fileName(selected.path),
        artist: selected.artist || '—',
        bpm: selected.bpm ?? null,
        key: selected.key ?? null,
        tagBpm: selected.bpm ?? null,
        analyzedBpm: null,
      }
    : null
  const distribution = React.useMemo(
    () =>
      canonicalTagDistribution(
        results,
        genres,
        t('classifier.review'),
        t('classifier.statuses.family'),
        {
          Electronic: t('classifier.families.Electronic'),
          Latin: t('classifier.families.Latin'),
          Rock: t('classifier.families.Rock'),
          Pop: t('classifier.families.Pop'),
          'Hip Hop': t('classifier.families.Hip Hop'),
          Jazz: t('classifier.families.Jazz'),
          'Funk / Soul': t('classifier.families.Funk / Soul'),
          Reggae: t('classifier.families.Reggae'),
          Blues: t('classifier.families.Blues'),
          Classical: t('classifier.families.Classical'),
          'Folk, World, & Country': t('classifier.families.Folk, World, & Country'),
          'Stage & Screen': t('classifier.families.Stage & Screen'),
          'Brass & Military': t('classifier.families.Brass & Military'),
          "Children's": t("classifier.families.Children's"),
          'Non-Music': t('classifier.families.Non-Music'),
        },
      ),
    [results, genres, t],
  )
  return (
    <div className="flex h-full min-w-0 overflow-hidden">
      <section className="flex min-w-0 flex-1 flex-col">
        <header className="flex min-h-12 shrink-0 flex-wrap items-center justify-between gap-2 border-b border-line px-5 py-2">
          <div className="flex items-center gap-3">
            <h1 className="text-[15px] font-semibold">{t('classifier.title')}</h1>
            <span className="text-[11px] text-zinc-500">
              {results.length} {t('classifier.tracks')}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={method} onValueChange={onMethodChange}>
              <SelectTrigger className="h-8 w-56 text-[11px]" aria-label={t('classifier.method')}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="tags">{t('classifier.methodTags')}</SelectItem>
                <SelectItem value="legacy">{t('classifier.methodOnline')}</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void openPlaylists()}
              disabled={isBusy || !destRoot}
            >
              {t('classifier.playlists')}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setHistoryOpen(true)
                void refreshHistory()
              }}
            >
              {t('classifier.history')}
            </Button>
            <Button
              size="sm"
              onClick={() => void analyze()}
              disabled={isBusy || (!inputRoot && !inputPaths.length)}
            >
              <Activity />
              {t('classifier.analyze')}
            </Button>
            <Button
              size="sm"
              onClick={() => setConfirmOpen(true)}
              disabled={isBusy || moves.length === 0 || !destRoot}
              title={!destRoot ? t('classifier.chooseDestinationToMove') : undefined}
            >
              {t('classifier.move')} · {moves.length}
            </Button>
          </div>
        </header>
        <div className="grid shrink-0 gap-2 border-b border-line px-5 py-3 text-[11px] md:grid-cols-2">
          <FolderField
            label={t('classifier.inputRoot')}
            value={inputRoot}
            onClick={() =>
              void choose(t('classifier.inputRoot'), (p) => {
                setInputRoot(p)
                setInputPaths([p])
                if (!destRoot) setDestRoot(`${p}/Clasificado`)
              })
            }
          />
          <FolderField
            label={t('classifier.destRoot')}
            value={destRoot}
            onClick={() => void choose(t('classifier.destRoot'), setDestRoot)}
            emptyLabel={t('classifier.analyzeNoDestination')}
            clearLabel={t('classifier.clearDestination')}
            onClear={() => setDestRoot('')}
          />
          <div className="flex gap-2 md:col-span-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                void electron.openFiles(t('classifier.addFiles'), true).then((picked) => {
                  const paths = typeof picked === 'string' ? [picked] : (picked ?? [])
                  setInputPaths((current) => [...new Set([...current, ...paths])])
                  setAddedFileCount((count) => count + paths.length)
                })
              }
            >
              {t('classifier.addFiles')}
            </Button>
            <span className="self-center text-zinc-500">
              {addedFileCount > 0
                ? `${addedFileCount} ${t(addedFileCount === 1 ? 'classifier.addedFile' : 'classifier.addedFiles')}`
                : ''}
            </span>
          </div>
        </div>
        {isBusy && (
          <div className="border-b border-line px-5 py-2 font-mono text-[11px] text-zinc-400">
            {progressText || t('classifier.running')}
          </div>
        )}
        {error && (
          <div className="flex items-center justify-between border-b border-red-500/30 bg-red-500/5 px-5 py-2 text-[11px] text-red-200">
            <span>{error}</span>
            <Button size="sm" variant="outline" onClick={() => void analyze()}>
              {t('classifier.retry')}
            </Button>
          </div>
        )}
        {results.length === 0 && !isBusy ? (
          <EmptyState
            title={t('classifier.chooseFolder')}
            onAction={() => void choose(t('classifier.inputRoot'), setInputRoot)}
            onDrop={(event) => {
              event.preventDefault()
              void resolveDroppedFiles(event.dataTransfer.files).then((paths) => {
                setInputRoot('')
                setInputPaths((current) => [...new Set([...current, ...paths])])
                setAddedFileCount((count) => count + paths.length)
              })
            }}
          />
        ) : (
          <>
            <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-line px-5 py-2">
              <Select
                value={statusFilter}
                onValueChange={(v) => setStatusFilter(v as TagStatusFilter)}
              >
                <SelectTrigger
                  className="h-7 w-48 text-[11px]"
                  aria-label={t('classifier.filterStatus')}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(['all', 'ok', 'family', 'online', 'review'] as TagStatusFilter[]).map((v) => (
                    <SelectItem key={v} value={v}>
                      {t(`classifier.statuses.${v}` as TranslationKey)} ·{' '}
                      {counts[v === 'all' ? 'all' : v]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={genreFilter} onValueChange={setGenreFilter}>
                <SelectTrigger
                  className="h-7 w-44 text-[11px]"
                  aria-label={t('classifier.filterGenre')}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('classifier.allGenres')}</SelectItem>
                  {Array.from(
                    new Set(
                      results
                        .map((r) => r.family)
                        .filter((family): family is string => Boolean(family)),
                    ),
                  ).map((family) => (
                    <SelectItem key={`family:${family}`} value={`family:${family}`}>
                      {t(`classifier.families.${family}` as TranslationKey)}
                    </SelectItem>
                  ))}
                  {genres.map((g) => (
                    <SelectItem key={g} value={g}>
                      {g}
                    </SelectItem>
                  ))}
                  <SelectItem value="review">{t('classifier.review')}</SelectItem>
                </SelectContent>
              </Select>
              <Select
                value=""
                onValueChange={(genre) => updateMany(selectedPaths, genre)}
                disabled={!selectedPaths.length}
              >
                <SelectTrigger
                  className="h-7 w-52 text-[11px]"
                  aria-label={t('classifier.changeSelected')}
                >
                  <SelectValue
                    placeholder={`${t('classifier.changeSelected')} (${selectedPaths.length})`}
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="review">{t('classifier.review')}</SelectItem>
                  {genres.map((g) => (
                    <SelectItem key={g} value={g}>
                      {g}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span className="ml-auto text-[11px] text-zinc-400">
                {counts.ok - counts.online} {t('classifier.statuses.ok')} · {counts.family}{' '}
                {t('classifier.statuses.family')} · {counts.online}{' '}
                {t('classifier.statuses.online')} · {counts.review} {t('classifier.review')}
              </span>
            </div>
            {distribution.length > 0 && (
              <Distribution
                distribution={distribution}
                compact
                reviewLabel={t('classifier.review')}
              />
            )}
            <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto px-5 pt-0 pb-2">
              <table className="w-full min-w-[980px] text-left text-[11px]">
                <thead className="sticky top-0 z-10 bg-surface-app text-zinc-500">
                  <tr className="grid h-8 grid-cols-[32px_40px_minmax(260px,1fr)_144px_176px_160px_208px] items-center">
                    <th>
                      <Checkbox
                        checked={
                          selectedPaths.length === visibleFiltered.length &&
                          visibleFiltered.length > 0
                        }
                        onCheckedChange={(checked) =>
                          setSelectedPaths(checked ? visibleFiltered.map((row) => row.path) : [])
                        }
                        aria-label={t('common.selectAll')}
                      />
                    </th>
                    <th>#</th>
                    <SortableHeader sort={tagSort} sortKey="track" onSort={toggleTagSort}>
                      {t('classifier.track')}
                    </SortableHeader>
                    <SortableHeader sort={tagSort} sortKey="originalTag" onSort={toggleTagSort}>
                      {t('classifier.originalTag')}
                    </SortableHeader>
                    <SortableHeader sort={tagSort} sortKey="genre" onSort={toggleTagSort}>
                      {t('classifier.genre')}
                    </SortableHeader>
                    <SortableHeader sort={tagSort} sortKey="status" onSort={toggleTagSort}>
                      {t('classifier.status')}
                    </SortableHeader>
                    <SortableHeader sort={tagSort} sortKey="destination" onSort={toggleTagSort}>
                      {t('classifier.destination')}
                    </SortableHeader>
                  </tr>
                </thead>
                <tbody style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
                  {virtualizer.getVirtualItems().map((item) => {
                    const row = visibleFiltered[item.index]
                    return (
                      <tr
                        key={row.path}
                        onClick={() => setSelectedPath(row.path)}
                        onDoubleClick={() => toggle(row.path)}
                        className={`absolute left-0 grid h-[54px] w-full cursor-pointer grid-cols-[32px_40px_minmax(260px,1fr)_144px_176px_160px_208px] items-center border-b border-line/60 ${selected?.path === row.path ? 'bg-white/[0.06]' : 'hover:bg-white/[0.03]'}`}
                        style={{ transform: `translateY(${item.start}px)` }}
                      >
                        <td>
                          <Checkbox
                            checked={selectedPaths.includes(row.path)}
                            onCheckedChange={(v) =>
                              setSelectedPaths((prev) =>
                                v ? [...prev, row.path] : prev.filter((p) => p !== row.path),
                              )
                            }
                            aria-label={`${t('common.selectAll')} ${row.title || fileName(row.path)}`}
                          />
                        </td>
                        <td className="text-center">
                          {row.path === playingPath ? (
                            <AudioLines className="mx-auto size-4 text-brand" />
                          ) : (
                            item.index + 1
                          )}
                        </td>
                        <td className="min-w-0 pr-3">
                          <div className="flex items-center gap-2">
                            <TrackArtwork path={row.path} camelotKey={row.key} size={34} />
                            <div className="min-w-0">
                              <p className="truncate text-zinc-200">
                                {row.title || fileName(row.path)}
                              </p>
                              <p className="truncate text-zinc-500">{row.artist || '—'}</p>
                            </div>
                          </div>
                        </td>
                        <td className="truncate pr-2" title={row.tagGenre ?? undefined}>
                          {row.tagGenre || '—'}
                        </td>
                        <td onClick={(e) => e.stopPropagation()}>
                          <Select
                            value={row.genre ?? (row.family ? `family:${row.family}` : 'review')}
                            onValueChange={(genre) =>
                              genre.startsWith('family:')
                                ? undefined
                                : updateMany([row.path], genre)
                            }
                          >
                            <SelectTrigger
                              className="h-7 w-40 text-[10px]"
                              aria-label={`${t('classifier.genre')}: ${row.title || fileName(row.path)}`}
                            >
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="review">{t('classifier.review')}</SelectItem>
                              {row.family && !row.genre && (
                                <SelectItem value={`family:${row.family}`}>
                                  {t(`classifier.families.${row.family}` as TranslationKey)} ·{' '}
                                  {t('classifier.statuses.family')}
                                </SelectItem>
                              )}
                              {genres.map((g) => (
                                <SelectItem key={g} value={g}>
                                  {g}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="truncate">
                          {t(
                            row.genreSource === 'lastfm' || row.genreSource === 'discogs'
                              ? 'classifier.statuses.online'
                              : (`classifier.statuses.${row.status}` as TranslationKey),
                          )}
                        </td>
                        <td
                          className="truncate font-mono text-zinc-500"
                          title={row.destination ?? undefined}
                        >
                          {row.destination ?? '—'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
      <TrackInspector track={selectedTrack}>
        {selected && (
          <div className="space-y-2 rounded border border-line bg-surface-panel p-3 text-[11px]">
            <p>
              {t('classifier.originalTag')}: {selected.tagGenre || '—'}
            </p>
            <p>
              {t('classifier.genre')}: {selected.genre || '—'} · {t('classifier.family')}:{' '}
              {selected.family
                ? t(`classifier.families.${selected.family}` as TranslationKey)
                : '—'}{' '}
              ·{' '}
              {t(
                `classifier.sourceLabels.${selected.genreSource === 'tag' ? 'embedded' : selected.genreSource || 'unmatched'}` as TranslationKey,
              )}
            </p>
            <p>
              {t('classifier.destination')}: {selected.destination || '—'}
            </p>
            {(selected.genreSource === 'lastfm' || selected.genreSource === 'discogs') && (
              <p>
                {selected.onlineTag} ·{' '}
                {t(`classifier.sourceLabels.${selected.genreSource}` as TranslationKey)}
              </p>
            )}
          </div>
        )}
      </TrackInspector>
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('classifier.confirmMove')}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-zinc-400">
            {moves.length} {t('classifier.move')} · {moves.length - onlineMoveCount}{' '}
            {t('classifier.moveFromTags')} · {onlineMoveCount} {t('classifier.moveFromOnline')} ·{' '}
            {destRoot}
          </p>
          <div className="max-h-48 overflow-auto text-xs">
            {Object.entries(
              moves.reduce<Record<string, number>>((acc, move) => {
                const genre = results.find((r) => r.path === move.from)?.genre ?? ''
                acc[genre] = (acc[genre] ?? 0) + 1
                return acc
              }, {}),
            ).map(([genre, n]) => (
              <p key={genre}>
                {genre}: {n}
              </p>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              {t('classifier.cancel')}
            </Button>
            <Button
              onClick={() =>
                void runApply('/api/classify-apply', { moves, destRoot }, t('classifier.moveDone'))
              }
            >
              {t('classifier.move')} · {moves.length}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('classifier.history')}</DialogTitle>
          </DialogHeader>
          <div className="max-h-72 space-y-2 overflow-auto">
            {manifests.map((m) => (
              <div key={m.manifestPath} className="flex items-center justify-between gap-2 text-xs">
                <span>
                  {new Date(m.createdAt).toLocaleString()} · {m.done}/{m.total}
                </span>
                {!m.undone && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      void runApply(
                        '/api/classify-undo',
                        { manifestPath: m.manifestPath },
                        t('classifier.undone'),
                      )
                    }
                  >
                    {t('classifier.undo')}
                  </Button>
                )}
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={playlistsOpen} onOpenChange={setPlaylistsOpen}>
        <DialogContent className="max-h-[85vh] overflow-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{t('classifier.playlists')}</DialogTitle>
          </DialogHeader>
          <p className="break-all text-xs text-zinc-500">{destRoot}</p>
          {(['warmup', 'peak', 'closing'] as const).map((section) => (
            <div key={section} className="space-y-2 rounded border border-line p-3">
              <h3 className="text-sm font-medium">
                {t(`classifier.playlistSections.${section}` as TranslationKey)}
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {playlistGenres.map((genre) => {
                  const active = playlistSections[section].includes(genre)
                  return (
                    <Button
                      key={genre}
                      size="sm"
                      variant={active ? 'default' : 'outline'}
                      onClick={() => togglePlaylistGenre(section, genre)}
                    >
                      {genre}
                    </Button>
                  )
                })}
              </div>
              {playlistPreview && (
                <p className="text-xs text-zinc-400">
                  {playlistPreview[section]?.count ?? 0} {t('classifier.tracks')} ·{' '}
                  {playlistPreview[section]?.bpmMin ?? '—'}–
                  {playlistPreview[section]?.bpmMax ?? '—'} BPM ·{' '}
                  {Math.round((playlistPreview[section]?.durationSec ?? 0) / 60)} min
                  {(playlistPreview[section]?.skippedCount ?? 0) > 0 && (
                    <>
                      {' '}
                      · {playlistPreview[section].skippedCount} {t('classifier.playlistSkipped')}
                    </>
                  )}
                </p>
              )}
            </div>
          ))}
          {playlistWritten.length > 0 && (
            <Button
              variant="outline"
              onClick={() => void electron.showInFolder(playlistWritten[0])}
            >
              {t('classifier.showPlaylists')}
            </Button>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => void previewPlaylists()}>
              {t('classifier.playlistPreview')}
            </Button>
            <Button disabled={!playlistPreview || busy} onClick={() => void createPlaylists()}>
              {t('classifier.playlistCreate')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function FolderField({
  label,
  value,
  onClick,
  emptyLabel,
  clearLabel,
  onClear,
}: {
  label: string
  value: string
  onClick: () => void
  emptyLabel?: string
  clearLabel?: string
  onClear?: () => void
}) {
  return (
    <div className="flex min-w-0 items-stretch rounded border border-line hover:border-brand">
      <button
        type="button"
        onClick={onClick}
        className="flex min-w-0 flex-1 items-center gap-2 px-3 py-2 text-left"
      >
        <FolderOpen className="size-4 shrink-0 text-brand" />
        <span className="min-w-0">
          <span className="block text-zinc-500">{label}</span>
          <span className={`block truncate ${value ? 'font-mono text-zinc-200' : 'text-zinc-500'}`}>
            {value || emptyLabel || '—'}
          </span>
        </span>
      </button>
      {value && onClear && (
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          className="my-auto mr-1 shrink-0"
          onClick={onClear}
          aria-label={clearLabel}
          title={clearLabel}
        >
          <X />
        </Button>
      )}
    </div>
  )
}

function ResultsTable({
  results,
  sort,
  toggleSort,
  selectedId,
  playingPath,
  onSelect,
  onPlay,
  onGenreChange,
  genres,
  t,
  selection,
  busy,
}: {
  results: ClassifierResult[]
  sort: import('@/lib/sort').SortState
  toggleSort: (key: string) => void
  selectedId: string | null
  playingPath: string | null
  onSelect: (id: string) => void
  onPlay: (track: ClassifierResult) => void
  onGenreChange: (id: string, genre: string) => void
  genres: string[]
  t: ReturnType<typeof useT>
  selection: ReturnType<typeof useRowSelection<ClassifierResult>>
  busy: boolean
}) {
  return (
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
              {t('classifier.track')}
            </SortableHeader>
            <SortableHeader className="w-40" sort={sort} sortKey="genre" onSort={toggleSort}>
              {t('classifier.genre')}
            </SortableHeader>
            <SortableHeader className="w-24" sort={sort} sortKey="bpm" onSort={toggleSort}>
              {t('classifier.bpm')}
            </SortableHeader>
            <SortableHeader
              className="w-28 text-right"
              sort={sort}
              sortKey="status"
              onSort={toggleSort}
            >
              {t('classifier.status')}
            </SortableHeader>
          </tr>
        </thead>
        <tbody>
          {results.map((result, index) => (
            <tr
              key={result.id}
              onClick={() => onSelect(result.id)}
              onDoubleClick={() => onPlay(result)}
              className={`group h-12 cursor-pointer ${selectedId === result.id ? 'bg-white/[0.06]' : 'hover:bg-white/[0.04]'}`}
            >
              <td className="text-center font-mono text-[11px] text-zinc-500">
                <RowCheckbox
                  checked={selection.selected.includes(result.id)}
                  disabled={busy}
                  label={result.title}
                  onClick={(shiftKey) => selection.toggle(result.id, shiftKey)}
                />
              </td>
              <td className="text-center font-mono text-[11px] text-zinc-500">
                {result.path === playingPath ? (
                  <AudioLines className="mx-auto size-4 text-brand" />
                ) : (
                  String(index + 1).padStart(2, '0')
                )}
              </td>
              <td className="min-w-0 pr-3">
                <div className="flex min-w-0 items-center gap-3">
                  <TrackArtwork camelotKey={result.key} path={result.path} size={30} />
                  <div className="min-w-0">
                    <p className="truncate text-[12px] text-zinc-200">{result.title}</p>
                    <p className="truncate text-[11px] text-zinc-500">{result.artist}</p>
                  </div>
                  <CamelotBadge camelotKey={result.key} className="ml-auto" />
                </div>
              </td>
              <td onClick={(event) => event.stopPropagation()}>
                <Select
                  value={result.genre}
                  onValueChange={(genre) => onGenreChange(result.id, genre)}
                >
                  <SelectTrigger
                    className="h-7 w-36 border-line bg-surface-panel font-mono text-[11px] text-zinc-200"
                    aria-label={`${t('classifier.genre')}: ${result.title}`}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="—">—</SelectItem>
                    {genres.map((genre) => (
                      <SelectItem key={genre} value={genre}>
                        {genre}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </td>
              <td className="font-mono text-[11px] text-zinc-300">{result.bpm ?? '—'}</td>
              <td className="pr-2 text-right">
                {result.error ? (
                  <span className="text-[11px] text-red-300">{result.error}</span>
                ) : (
                  <Check className="ml-auto size-3.5 text-emerald-400/80" />
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Distribution({
  distribution,
  compact = false,
  reviewLabel,
}: {
  distribution: ReturnType<typeof genreDistribution>
  compact?: boolean
  reviewLabel?: string
}) {
  const label = (genre: string) =>
    genre === 'Por revisar' || genre === 'Review' ? (reviewLabel ?? genre) : genre
  const reviewItems = compact
    ? distribution.filter(
        (item) =>
          item.genre === reviewLabel || item.genre === 'Por revisar' || item.genre === 'Review',
      )
    : []
  const canonicalItems = compact
    ? distribution.filter((item) => !reviewItems.includes(item))
    : distribution
  const visible = compact ? [...canonicalItems.slice(0, 6), ...reviewItems] : distribution
  const remainder = compact ? canonicalItems.slice(6) : []
  return (
    <div
      className={`flex shrink-0 flex-wrap items-center gap-3 px-5 ${compact ? 'min-h-9 border-b border-line py-2' : 'border-t border-line py-3'}`}
    >
      <div className="flex h-1.5 min-w-24 flex-1 overflow-hidden rounded-full bg-zinc-800">
        {distribution.map((item) => (
          <span
            key={item.genre}
            className={item.majority ? 'bg-brand' : 'bg-zinc-600'}
            style={{ width: `${item.percentage}%` }}
          />
        ))}
      </div>
      <div className="flex min-w-0 max-w-[45%] flex-wrap items-center justify-end gap-x-3 text-[10px] text-zinc-400">
        {visible.map((item) => (
          <span key={item.genre} className="whitespace-nowrap">
            <i
              className={`mr-1 inline-block size-1.5 rounded-full ${item.majority ? 'bg-brand' : 'bg-zinc-600'}`}
            />
            {label(item.genre)} · {item.count}
          </span>
        ))}
        {remainder.length > 0 && (
          <TooltipProvider delayDuration={0}>
            <Tooltip>
              <TooltipTrigger asChild>
                <button className="shrink-0 text-zinc-300">+{remainder.length}</button>
              </TooltipTrigger>
              <TooltipContent>
                {remainder.map((item) => `${label(item.genre)} ${item.count}`).join(' · ')}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>
    </div>
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
  onDrop: (event: React.DragEvent) => void
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onAction}
      onKeyDown={(event) => (event.key === 'Enter' || event.key === ' ') && onAction()}
      onDragOver={(event) => event.preventDefault()}
      onDrop={onDrop}
      className="flex min-h-0 flex-1 cursor-pointer flex-col items-center justify-center gap-3 border-2 border-dashed border-zinc-800 p-8 text-center hover:border-zinc-700"
    >
      <span className="flex size-12 items-center justify-center rounded-full border border-dashed border-zinc-700 text-brand">
        <FolderOpen className="size-5" />
      </span>
      <span className="text-[15px] font-semibold text-zinc-200">{title}</span>
      {action && (
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
      )}
    </div>
  )
}

function RunningState({ t }: { t: ReturnType<typeof useT> }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 text-zinc-500">
      <Activity className="size-8 text-brand" />
      <span className="text-[13px]">{t('classifier.running')}</span>
    </div>
  )
}
