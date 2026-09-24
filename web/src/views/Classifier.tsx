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

const SOURCE_LABEL_KEYS: Record<string, TranslationKey> = {
  embedded: 'classifier.sourceLabels.embedded',
  online: 'classifier.sourceLabels.online',
  spotify: 'classifier.sourceLabels.spotify',
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
  const { setQueue, toggle, path: playingPath } = usePlayer()
  const t = useT()
  const { view, setView } = useView()
  const { state, run, pause, resume, cancel } = useProcessStream()
  const { results: savedResults, setActive, setResult } = useProcess()
  const [results, setResults] = React.useState<ClassifierResult[]>(
    () => (savedResults[view] as ClassifierResult[] | undefined) ?? [],
  )
  const [folder, setFolder] = React.useState<string | null>(null)
  const [selectedId, setSelectedId] = React.useState<string | null>(results[0]?.id ?? null)
  const [genres, setGenres] = React.useState<string[]>([])
  const [genreDraft, setGenreDraft] = React.useState('')
  const [settings, setSettings] = React.useState({ hasSpotify: true })
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
        results.map((track) => ({
          path: track.path,
          title: track.title,
          artist: track.artist,
          bpm: track.bpm,
          key: track.key,
        })),
      ),
    [setQueue, results],
  )
  const distribution = React.useMemo(() => genreDistribution(results), [results])
  const undoSnapshot = React.useRef<ClassifierResult[] | null>(null)
  const selection = useRowSelection({
    items: results,
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
          spotifyClientId?: string
          spotifyClientSecret?: string
        }
      }>('/api/settings'),
    ])
      .then(([genreResponse, settingsResponse]) => {
        if (cancelled) return
        setGenres(genreResponse.genres ?? [])
        const saved = settingsResponse.settings ?? {}
        setSettings({
          hasSpotify: Boolean(saved.spotifyClientId && saved.spotifyClientSecret),
        })
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
            results={results}
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
        {!settings.hasSpotify && (
          <div className="border-t border-amber-500/30 bg-amber-500/5 px-6 py-2 text-[11px] text-amber-200">
            {t('classifier.noSpotify')}{' '}
            <button
              type="button"
              className="underline underline-offset-2"
              onClick={() => setView('settings')}
            >
              {t('classifier.openSettings')}
            </button>
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

function ResultsTable({
  results,
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
    <div className="min-h-0 flex-1 overflow-auto px-6 py-2">
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
            <th>{t('classifier.track')}</th>
            <th className="w-40">{t('classifier.genre')}</th>
            <th className="w-24">{t('classifier.bpm')}</th>
            <th className="w-28 text-right">{t('classifier.status')}</th>
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
                  <TrackArtwork camelotKey={result.key} size={30} />
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

function Distribution({ distribution }: { distribution: ReturnType<typeof genreDistribution> }) {
  return (
    <div className="flex shrink-0 items-center gap-3 border-t border-line px-6 py-3">
      <div className="flex h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-zinc-800">
        {distribution.map((item) => (
          <span
            key={item.genre}
            className={item.majority ? 'bg-brand' : 'bg-zinc-600'}
            style={{ width: `${item.percentage}%` }}
          />
        ))}
      </div>
      <div className="flex max-w-[45%] flex-wrap justify-end gap-x-3 gap-y-1 text-[10px] text-zinc-400">
        {distribution.map((item) => (
          <span key={item.genre}>
            <i
              className={`mr-1 inline-block size-1.5 rounded-full ${item.majority ? 'bg-brand' : 'bg-zinc-600'}`}
            />
            {item.genre} {item.count}
          </span>
        ))}
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
