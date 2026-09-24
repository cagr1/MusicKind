import * as React from 'react'
import {
  ArrowRightLeft,
  AudioLines,
  CheckCircle2,
  FileAudio,
  FolderOpen,
  Plus,
  RefreshCw,
  Settings as SettingsIcon,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { TrackInspector, type InspectorTrack } from '@/components/music/TrackInspector'
import { TrackArtwork } from '@/components/music/TrackArtwork'
import { useT } from '@/i18n/I18nProvider'
import { getJson, useProcessStream } from '@/lib/api'
import { electron, resolveDroppedFiles } from '@/lib/electron'
import { useProcess } from '@/lib/process'
import { useView } from '@/hooks/useView'
import { normalizeCamelot } from '@/lib/camelot'
import { appendResults, mergeUnique, pendingItems } from '@/lib/list'
import { useRowSelection } from '@/lib/selection'
import { SelectionControls, RowCheckbox } from '@/components/music/TableSelection'
import { usePlayer } from '@/lib/player'

export type ConversionFormat = 'mp3' | 'wav' | 'aiff' | 'flac'

export interface ConverterResult {
  ok: boolean
  input: string
  output: string
  format: ConversionFormat
  bitrate: number | null
  sizeIn: number
  sizeOut: number | null
  title?: string
  artist?: string
  bpm?: number | null
  key?: string | null
  error?: string
}

export function formatBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined || !Number.isFinite(bytes)) return '—'
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
}

export function summarizeConversionResults(results: ConverterResult[]) {
  return {
    count: results.length,
    sizeIn: results.reduce((total, result) => total + (result.sizeIn || 0), 0),
    sizeOut: results.reduce((total, result) => total + (result.sizeOut || 0), 0),
  }
}

export function shouldContinueAfterResult(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every(
      (item) => typeof item === 'object' && item !== null && (item as { ok?: unknown }).ok === true,
    )
  )
}

function fileName(path: string) {
  return path.split(/[\\/]/).pop() ?? path
}
function sourceFormat(path: string) {
  return fileName(path).split('.').pop()?.toUpperCase() || '—'
}
function toInspectorTrack(result: ConverterResult): InspectorTrack {
  return {
    id: result.input,
    title: result.title || fileName(result.input),
    artist: result.artist || '—',
    bpm: result.bpm ?? null,
    tagBpm: result.bpm ?? null,
    key: result.key ?? null,
    path: result.input,
  }
}

async function readConversionMetadata(
  tracks: ConverterResult[],
  onTrack: (
    input: string,
    metadata: { title?: string; artist?: string; bpm?: number | null; key?: string | null },
  ) => void,
) {
  for (let index = 0; index < tracks.length; index += 4) {
    await Promise.all(
      tracks.slice(index, index + 4).map(async (track) => {
        try {
          const response = await getJson<{
            metadata?: { title?: string; artist?: string; bpm?: number | null; key?: string | null }
          }>(`/api/metadata?file=${encodeURIComponent(track.input)}`)
          const metadata = response.metadata ?? {}
          onTrack(track.input, {
            ...metadata,
            key: normalizeCamelot(metadata.key),
          })
        } catch {
          onTrack(track.input, {})
        }
      }),
    )
  }
}

export function Converter() {
  const { setQueue, toggle, path: playingPath } = usePlayer()
  const t = useT()
  const { setView } = useView()
  const { state, run, cancel } = useProcessStream()
  const { results: savedResults, setActive, setResult } = useProcess()
  const [files, setFiles] = React.useState<string[]>([])
  const [results, setResults] = React.useState<ConverterResult[]>(
    () => (savedResults.converter as ConverterResult[] | undefined) ?? [],
  )
  const [format, setFormat] = React.useState<ConversionFormat>('wav')
  const [bitrate, setBitrate] = React.useState('320')
  const [outputDir, setOutputDir] = React.useState<string | null>(null)
  const [ffmpegInstalled, setFfmpegInstalled] = React.useState<boolean | null>(null)
  const [selectedId, setSelectedId] = React.useState<string | null>(results[0]?.input ?? null)
  const [dragging, setDragging] = React.useState(false)
  const undoSnapshot = React.useRef<{ files: string[]; results: ConverterResult[] } | null>(null)
  const isBusy = state.status === 'running' || state.status === 'paused'
  const selected = results.find((result) => result.input === selectedId) ?? results[0] ?? null
  React.useEffect(() => {
    const active = results.find((result) => result.output === playingPath)
    if (active) setSelectedId(active.input)
  }, [playingPath, results])
  React.useEffect(
    () =>
      setQueue(
        results
          .filter((item) => item.ok)
          .map((item) => ({
            path: item.output,
            title: item.title || fileName(item.output),
            artist: item.artist || '—',
            bpm: item.bpm ?? null,
            key: item.key ?? null,
          })),
      ),
    [setQueue, results],
  )
  const summary = summarizeConversionResults(results)
  const selection = useRowSelection({
    items: results,
    getKey: (result) => result.input,
    isProtected: (result) => isBusy && state.progress?.file === result.input,
    onRemove: (keys) => {
      undoSnapshot.current = { files, results }
      const removed = new Set(keys)
      const next = results.filter((result) => !removed.has(result.input))
      setResults(next)
      setFiles((current) => current.filter((file) => !removed.has(file)))
      setResult('converter', next)
      setSelectedId((current) => (removed.has(current ?? '') ? (next[0]?.input ?? null) : current))
    },
    onClear: () => {
      undoSnapshot.current = { files, results }
      setFiles([])
      setResults([])
      setResult('converter', [])
      setSelectedId(null)
    },
    onRestore: () => {
      if (undoSnapshot.current) {
        setFiles(undoSnapshot.current.files)
        setResults(undoSnapshot.current.results)
        setResult('converter', undoSnapshot.current.results)
        setSelectedId(undoSnapshot.current.results[0]?.input ?? null)
      }
    },
    removeLabel: t('common.removed'),
    clearLabel: t('common.cleared'),
    undoLabel: t('common.undo'),
  })

  React.useEffect(() => {
    let cancelled = false
    void Promise.all([
      getJson<{ settings?: { defaultOutputDir?: string } }>('/api/settings'),
      getJson<{ installed: boolean }>('/api/ffmpeg-status'),
    ])
      .then(([settings, ffmpeg]) => {
        if (cancelled) return
        setOutputDir(settings.settings?.defaultOutputDir || 'output')
        setFfmpegInstalled(ffmpeg.installed)
      })
      .catch(() => {
        if (!cancelled) setFfmpegInstalled(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  React.useEffect(() => {
    setActive({
      processId: state.processId,
      view: 'converter',
      name: t('converter.title'),
      current: state.progress?.current ?? 0,
      total: state.progress?.total ?? files.length,
      file: state.progress?.file ?? null,
      status: state.status,
    })
  }, [files.length, setActive, state, t])

  const chooseFiles = async () => {
    const picked = await electron.openFiles(t('converter.selectFiles'), true)
    const next = Array.isArray(picked) ? picked : picked ? [picked] : []
    if (next.length) {
      setFiles((current) => mergeUnique(current, next, (file) => file))
      setSelectedId((current) => current ?? next[0])
    }
  }

  const chooseDirectory = async () => {
    const directory = await electron.openDirectory(t('converter.selectFiles'))
    if (directory) {
      const expanded = await expandPaths([directory])
      setFiles((current) => mergeUnique(current, expanded, (file) => file))
      setSelectedId((current) => current ?? directory)
    }
  }

  const onDrop = async (event: React.DragEvent) => {
    event.preventDefault()
    try {
      const next = await resolveDroppedFiles(event.dataTransfer.files)
      if (next.length) {
        const expanded = await expandPaths(next)
        setFiles((current) => mergeUnique(current, expanded, (file) => file))
        setSelectedId((current) => current ?? next[0])
      }
    } catch (error) {
      setActive({ status: 'error', name: error instanceof Error ? error.message : String(error) })
    }
  }

  const start = async () => {
    const pending = pendingItems(
      files,
      results,
      (file) => file,
      (result) => result.input,
    )
    if (!pending.length || !outputDir || isBusy) return
    let converted = [...results]
    for (const input of pending) {
      const resultStart = converted.length
      let receivedResult = false
      let runFailed = false
      await run(
        '/api/convert',
        {
          inputPath: input,
          outputPath: outputDir,
          format,
          ...(format === 'mp3' ? { bitrate: Number(bitrate) } : {}),
        },
        (value) => {
          if (Array.isArray(value)) {
            receivedResult = true
            runFailed = !shouldContinueAfterResult(value)
            converted = appendResults(
              converted,
              value as ConverterResult[],
              (result) => result.input,
            )
            setResults(converted)
            setSelectedId((current) => current ?? input)
          }
        },
      )
      if (!receivedResult || runFailed) break
      await readConversionMetadata(converted.slice(resultStart), (resultInput, metadata) => {
        const result = converted.find((item) => item.input === resultInput)
        if (!result) return
        Object.assign(result, {
          title: metadata.title?.trim() || fileName(result.input),
          artist: metadata.artist?.trim() || '—',
          bpm: metadata.bpm ?? null,
          key: metadata.key ?? null,
        })
        setResults([...converted])
      })
    }
    if (converted.length) setResult('converter', converted)
  }

  if (ffmpegInstalled === null) return <div className="h-full" aria-label={t('converter.title')} />

  const pending = pendingItems(
    files,
    results,
    (file) => file,
    (result) => result.input,
  )

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
      {dragging && <DropOverlay label={t('converter.dropToAdd')} />}
      <section className="flex min-w-0 flex-1 flex-col">
        <header className="relative flex h-12 shrink-0 items-center justify-between border-b border-line px-6">
          <div className="flex items-center gap-3">
            <h1 className="text-[15px] font-semibold">{t('converter.title')}</h1>
            <span className="font-mono text-[11px] text-zinc-500">
              {files.length} {t('converter.files')} · {pending.length} {t('converter.pending')}
            </span>
          </div>
          {isBusy && (
            <div className="flex items-center gap-2 font-mono text-[11px] text-zinc-400">
              <span className="text-zinc-200">
                {state.progress?.current ?? 0}/{state.progress?.total ?? files.length}
              </span>
              <span className="truncate">{state.progress?.file}</span>
            </div>
          )}
          <div className="flex items-center gap-2">
            <SelectionControls selection={selection} t={t} hasRows={results.length > 0} />
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label={t('converter.addFiles')}
                    onClick={() => void chooseFiles()}
                  >
                    <Plus />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{t('converter.addFiles')}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
            {isBusy && (
              <Button variant="outline" size="sm" onClick={() => void cancel()}>
                <X />
                {t('converter.cancel')}
              </Button>
            )}
            <Button size="sm" onClick={() => void start()} disabled={isBusy || !pending.length}>
              <ArrowRightLeft />
              {t('converter.convert')}
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
          <div className="flex items-center gap-4">
            {files.length > 0 && (
              <button
                type="button"
                onClick={() => void chooseFiles()}
                className="flex max-w-[300px] items-center gap-2 truncate hover:text-zinc-300"
              >
                <FolderOpen className="size-3.5" />
                <span className="truncate font-mono text-zinc-300">
                  {files.length} {t('converter.selected')}
                </span>
              </button>
            )}
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label={t('converter.selectFiles')}
                    onClick={() => void chooseDirectory()}
                  >
                    <FolderOpen />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{t('converter.selectFiles')}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <label className="flex items-center gap-2 border-l border-line pl-4">
              <span>{t('converter.format')}</span>
              <Select
                value={format}
                onValueChange={(value) => setFormat(value as ConversionFormat)}
              >
                <SelectTrigger className="h-7 w-24 font-mono text-[11px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="wav">WAV</SelectItem>
                  <SelectItem value="aiff">AIFF</SelectItem>
                  <SelectItem value="flac">FLAC</SelectItem>
                  <SelectItem value="mp3">MP3</SelectItem>
                </SelectContent>
              </Select>
            </label>
            {format === 'mp3' && (
              <label className="flex items-center gap-2 border-l border-line pl-4">
                <span>{t('converter.bitrate')}</span>
                <Select value={bitrate} onValueChange={setBitrate}>
                  <SelectTrigger className="h-7 w-24 font-mono text-[11px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="320">320 kbps</SelectItem>
                    <SelectItem value="256">256 kbps</SelectItem>
                    <SelectItem value="192">192 kbps</SelectItem>
                  </SelectContent>
                </Select>
              </label>
            )}
          </div>
          {results.length > 0 && (
            <span className="font-mono tabular-nums">
              {summary.count} {t('converter.files')} · {formatBytes(summary.sizeIn)} →{' '}
              {formatBytes(summary.sizeOut)}
            </span>
          )}
        </div>
        {state.status === 'error' ? (
          <ErrorState
            message={state.error ?? t('converter.error')}
            onRetry={() => void start()}
            t={t}
          />
        ) : isBusy && !results.length ? (
          <RunningState files={files} t={t} />
        ) : !results.length ? (
          <EmptyState
            title={
              ffmpegInstalled === false ? t('converter.ffmpegMissing') : t('converter.chooseFiles')
            }
            disabled={ffmpegInstalled === false}
            onAction={() => (ffmpegInstalled === false ? setView('settings') : void chooseFiles())}
            onDrop={onDrop}
            t={t}
          />
        ) : (
          <ResultsTable
            results={results}
            selected={selected}
            playingPath={playingPath}
            onSelect={setSelectedId}
            onPlay={(result) => {
              setSelectedId(result.input)
              if (result.ok) toggle(result.output)
            }}
            t={t}
            selection={selection}
          />
        )}
      </section>
      <TrackInspector track={selected ? toInspectorTrack(selected) : null}>
        {selected && (
          <div className="space-y-3 pt-1">
            <div className="space-y-2 rounded border border-line bg-surface-panel p-3 text-[11px]">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                {t('converter.specs')}
              </p>
              <div className="flex justify-between font-mono">
                <span className="text-zinc-500">{t('converter.original')}</span>
                <span>{sourceFormat(selected.input)}</span>
              </div>
              <div className="flex justify-between font-mono">
                <span className="text-zinc-500">{t('converter.target')}</span>
                <span className="text-brand">
                  {selected.format.toUpperCase()}
                  {selected.format === 'mp3' ? ` · ${selected.bitrate ?? bitrate} kbps` : ''}
                </span>
              </div>
            </div>
            <div className="space-y-2 rounded border border-line bg-surface-panel p-3 text-[11px]">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                {t('converter.output')}
              </p>
              <p className="break-all font-mono text-zinc-400">{selected.output}</p>
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => void electron.showInFolder(selected.output)}
              >
                <FolderOpen />
                {t('converter.showInFolder')}
              </Button>
            </div>
          </div>
        )}
      </TrackInspector>
    </div>
  )
}

function ResultsTable({
  results,
  selected,
  playingPath,
  onSelect,
  onPlay,
  t,
  selection,
}: {
  results: ConverterResult[]
  selected: ConverterResult | null
  playingPath: string | null
  onSelect: (id: string) => void
  onPlay: (track: ConverterResult) => void
  t: ReturnType<typeof useT>
  selection: ReturnType<typeof useRowSelection<ConverterResult>>
}) {
  return (
    <div className="min-h-0 flex-1 overflow-auto px-6 py-2">
      <table className="w-full table-fixed text-left">
        <thead className="sticky top-0 z-10 border-b border-line bg-surface-app">
          <tr className="h-8 text-[10px] uppercase tracking-wider text-zinc-500">
            <th className="w-10 text-center">
              <CheckboxHeader selection={selection} t={t} />
            </th>
            <th className="w-10 text-center">#</th>
            <th>{t('converter.file')}</th>
            <th className="w-28">{t('converter.conversion')}</th>
            <th className="w-40">{t('converter.size')}</th>
            <th className="w-32 text-right">{t('converter.status')}</th>
          </tr>
        </thead>
        <tbody>
          {results.map((result, index) => (
            <tr
              key={`${result.input}-${index}`}
              onClick={() => onSelect(result.input)}
              onDoubleClick={() => onPlay(result)}
              className={`group h-12 cursor-pointer ${
                selected?.input === result.input ? 'bg-white/[0.06]' : 'hover:bg-white/[0.04]'
              }`}
            >
              <td className="text-center font-mono text-[11px] text-zinc-500">
                <RowCheckbox
                  checked={selection.selected.includes(result.input)}
                  disabled={selection.available.includes(result.input) === false}
                  label={result.title || fileName(result.input)}
                  onClick={(shiftKey) => selection.toggle(result.input, shiftKey)}
                />
              </td>
              <td className="text-center font-mono text-[11px] text-zinc-500">
                {result.output === playingPath ? (
                  <AudioLines className="mx-auto size-4 text-brand" />
                ) : (
                  String(index + 1).padStart(2, '0')
                )}
              </td>
              <td className="min-w-0 pr-4">
                <div className="flex min-w-0 items-center gap-3">
                  <TrackArtwork camelotKey={result.key} path={result.input} size={32} />
                  <div className="min-w-0">
                    <p className="truncate text-[13px] text-zinc-200">
                      {result.title || fileName(result.input)}
                    </p>
                    <p className="truncate text-[11px] text-zinc-500">
                      {result.artist || '—'} · {result.bpm ?? '—'} BPM · {result.key ?? '—'}
                    </p>
                  </div>
                </div>
              </td>
              <td className="font-mono text-[11px] text-zinc-300">
                {sourceFormat(result.input)} <span className="text-zinc-600">→</span>{' '}
                {result.format.toUpperCase()}
              </td>
              <td className="font-mono text-[11px] text-zinc-400">
                {formatBytes(result.sizeIn)} <span className="text-zinc-600">→</span>{' '}
                <span className="text-zinc-200">{formatBytes(result.sizeOut)}</span>
              </td>
              <td className="text-right">
                <div className="inline-flex items-center gap-2">
                  {result.ok ? (
                    <CheckCircle2 className="size-3.5 text-emerald-400/80" />
                  ) : (
                    <span className="text-[11px] text-red-300">{t('converter.failed')}</span>
                  )}
                  {result.ok && (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            className="opacity-0 group-hover:opacity-100"
                            aria-label={t('converter.showInFolder')}
                            onClick={(event) => {
                              event.stopPropagation()
                              void electron.showInFolder(result.output)
                            }}
                          >
                            <FolderOpen />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>{t('converter.showInFolder')}</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function CheckboxHeader({
  selection,
  t,
}: {
  selection: ReturnType<typeof useRowSelection<ConverterResult>>
  t: ReturnType<typeof useT>
}) {
  return (
    <Checkbox
      checked={selection.checked ? true : selection.indeterminate ? 'indeterminate' : false}
      onCheckedChange={selection.toggleAll}
      aria-label={t('common.selectAll')}
    />
  )
}

function EmptyState({
  title,
  disabled,
  onAction,
  onDrop,
  t,
}: {
  title: string
  disabled: boolean
  onAction: () => void
  onDrop: (event: React.DragEvent) => void
  t: ReturnType<typeof useT>
}) {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center p-6">
      <button
        type="button"
        onClick={onAction}
        onDragOver={(event) => event.preventDefault()}
        onDrop={onDrop}
        aria-disabled={disabled}
        className="flex h-64 w-full max-w-xl flex-col items-center justify-center gap-3
          rounded border border-dashed border-line text-zinc-500 transition-colors
          hover:border-brand/60 hover:text-zinc-300"
      >
        {disabled ? (
          <SettingsIcon className="size-12" strokeWidth={1} />
        ) : (
          <FileAudio className="size-12" strokeWidth={1} />
        )}
        <span className="text-[13px]">{title}</span>
        {disabled && (
          <span className="font-mono text-[11px] text-brand">{t('converter.openSettings')}</span>
        )}
      </button>
    </div>
  )
}

function RunningState({ files, t }: { files: string[]; t: ReturnType<typeof useT> }) {
  return (
    <div className="min-h-0 flex-1 overflow-auto px-6 py-2">
      <div className="border-b border-line py-3 font-mono text-[11px] text-zinc-500">
        {t('converter.running')}
      </div>
      <div className="divide-y divide-line">
        {files.map((file, index) => (
          <div key={file} className="flex h-12 items-center gap-3 text-[12px] text-zinc-400">
            <span className="w-8 text-center font-mono">{String(index + 1).padStart(2, '0')}</span>
            <FileAudio className="size-4 text-zinc-600" />
            <span className="truncate">{fileName(file)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

async function expandPaths(paths: string[]): Promise<string[]> {
  const expanded = await Promise.all(
    paths.map(async (path) => {
      try {
        const response = await getJson<{ files?: string[] }>(
          `/api/metadata/list?dir=${encodeURIComponent(path)}&recursive=false`,
        )
        return response.files?.length ? response.files : [path]
      } catch {
        return [path]
      }
    }),
  )
  return expanded.flat()
}

function DropOverlay({ label }: { label: string }) {
  return (
    <div className="pointer-events-none absolute inset-3 z-20 flex items-center justify-center rounded border-2 border-dashed border-brand bg-surface-app/90 text-sm font-semibold text-brand">
      {label}
    </div>
  )
}

function ErrorState({
  message,
  onRetry,
  t,
}: {
  message: string
  onRetry: () => void
  t: ReturnType<typeof useT>
}) {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center p-6">
      <div className="flex max-w-md flex-col items-center gap-3 text-center">
        <RefreshCw className="size-10 text-red-300" strokeWidth={1.5} />
        <p className="text-sm text-zinc-200">{message}</p>
        <Button variant="outline" size="sm" onClick={onRetry}>
          <RefreshCw />
          {t('converter.retry')}
        </Button>
      </div>
    </div>
  )
}
