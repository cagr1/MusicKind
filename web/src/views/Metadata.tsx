import * as React from 'react'
import { AudioLines, FileAudio, FolderOpen, Plus, Save, ScanSearch, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { TrackArtwork } from '@/components/music/TrackArtwork'
import { TrackInspector, type InspectorTrack } from '@/components/music/TrackInspector'
import { useT } from '@/i18n/I18nProvider'
import { getJson, postJson } from '@/lib/api'
import { electron, resolveDroppedFiles } from '@/lib/electron'
import { useProcess } from '@/lib/process'
import { useView } from '@/hooks/useView'
import { appendResults, mergeUnique, pendingItems } from '@/lib/list'
import { itemsFromPaths } from '@/lib/drop'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { useRowSelection } from '@/lib/selection'
import { SelectionControls, RowCheckbox } from '@/components/music/TableSelection'
import { Checkbox } from '@/components/ui/checkbox'
import { usePlayer } from '@/lib/player'

interface MetadataFields {
  title: string
  artist: string
  album: string
  year: string
  genre: string
  track: string
  newFilename?: string
}

export interface MetadataRow {
  id: string
  path: string
  name: string
  metadata: MetadataFields
  original: MetadataFields
  originalName: string
  newFilename: string
  bpm?: number | null
  key?: string | null
}

interface MetadataResponse {
  metadata?: {
    title?: string
    artist?: string
    album?: string
    year?: number | null
    genre?: string
    track?: number | null
    bpm?: number | null
    key?: string | null
  }
}

interface PreviewResponse {
  ok: boolean
  original: string
  metadata: MetadataResponse['metadata']
  newFilename: string
}

function fileName(filePath: string) {
  return filePath.split(/[\\/]/).pop() ?? filePath
}

function fieldsFromMetadata(metadata: MetadataResponse['metadata'] = {}): MetadataFields {
  return {
    title: metadata.title ?? '',
    artist: metadata.artist ?? '',
    album: metadata.album ?? '',
    year: metadata.year === null || metadata.year === undefined ? '' : String(metadata.year),
    genre: metadata.genre ?? '',
    track: metadata.track === null || metadata.track === undefined ? '' : String(metadata.track),
  }
}

function display(value: string) {
  return value.trim() || '—'
}

function asInspectorTrack(row: MetadataRow): InspectorTrack {
  return {
    id: row.id,
    title: display(row.metadata.title) === '—' ? row.name : display(row.metadata.title),
    artist: display(row.metadata.artist),
    bpm: row.bpm ?? null,
    key: row.key ?? null,
    path: row.path,
  }
}

function isApiKeyError(message: string) {
  return /clave API|api key|acoustid/i.test(message)
}

export function metadataFormValues(row: MetadataRow | null): MetadataFields {
  if (!row) return { title: '', artist: '', album: '', year: '', genre: '', track: '' }
  return { ...row.metadata, newFilename: row.newFilename }
}

export function metadataNeedsRename(row: MetadataRow): boolean {
  return row.newFilename !== row.name
}

export function mergeMetadataRows(current: MetadataRow[], incoming: MetadataRow[]) {
  const existingPaths = new Set(current.map((row) => row.path))
  return appendResults(
    current,
    incoming.filter((row) => !existingPaths.has(row.path)),
    (row) => row.path,
  )
}

export function Metadata() {
  const { setQueue, toggle, path: playingPath } = usePlayer()
  const t = useT()
  const { setView } = useView()
  const { results: savedResults, setActive, setResult } = useProcess()
  const savedRows = savedResults.metadata as MetadataRow[] | undefined
  const [folder, setFolder] = React.useState<string | null>(null)
  const [rows, setRows] = React.useState<MetadataRow[]>(() => savedRows ?? [])
  const [selectedId, setSelectedId] = React.useState<string | null>(null)
  const [form, setForm] = React.useState<MetadataFields>(metadataFormValues(null))
  const [error, setError] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [progress, setProgress] = React.useState({ current: 0, total: 0, file: '' })
  const [identified, setIdentified] = React.useState<string[]>(() =>
    (savedRows ?? []).map((row) => row.path),
  )
  const [dragging, setDragging] = React.useState(false)
  const controllerRef = React.useRef<AbortController | null>(null)
  const selected = rows.find((row) => row.id === selectedId) ?? rows[0] ?? null
  React.useEffect(() => {
    const active = rows.find((row) => row.path === playingPath)
    if (active) setSelectedId(active.id)
  }, [playingPath, rows])
  React.useEffect(
    () =>
      setQueue(
        rows.map((row) => ({
          path: row.path,
          title: display(row.metadata.title) === '—' ? row.name : display(row.metadata.title),
          artist: display(row.metadata.artist),
          bpm: row.bpm ?? null,
          key: row.key ?? null,
        })),
      ),
    [setQueue, rows],
  )
  const undoSnapshot = React.useRef<{ rows: MetadataRow[]; identified: string[] } | null>(null)
  const selection = useRowSelection({
    items: rows,
    getKey: (row) => row.id,
    isProtected: (row) => busy && progress.file === row.name,
    onRemove: (keys) => {
      undoSnapshot.current = { rows, identified }
      const removed = new Set(keys)
      const next = rows.filter((row) => !removed.has(row.id))
      setRows(next)
      setIdentified((current) => current.filter((path) => !removed.has(path)))
      setResult('metadata', next)
      setSelectedId((current) => (removed.has(current ?? '') ? (next[0]?.id ?? null) : current))
    },
    onClear: () => {
      undoSnapshot.current = { rows, identified }
      setRows([])
      setIdentified([])
      setResult('metadata', [])
      setSelectedId(null)
    },
    onRestore: () => {
      if (undoSnapshot.current) {
        setRows(undoSnapshot.current.rows)
        setIdentified(undoSnapshot.current.identified)
        setResult('metadata', undoSnapshot.current.rows)
        setSelectedId(undoSnapshot.current.rows[0]?.id ?? null)
      }
    },
    removeLabel: t('common.removed'),
    clearLabel: t('common.cleared'),
    undoLabel: t('common.undo'),
  })

  React.useEffect(() => {
    setForm(metadataFormValues(selected))
  }, [selectedId, selected])

  React.useEffect(() => () => controllerRef.current?.abort(), [])

  const updateProcess = React.useCallback(
    (status: 'idle' | 'running' | 'done' | 'error') => {
      setActive({
        processId: null,
        view: 'metadata',
        name: t('metadata.title'),
        current: progress.current,
        total: progress.total,
        file: progress.file || null,
        status,
      })
    },
    [progress, setActive, t],
  )

  const loadFiles = async (paths: string[], source?: string | null) => {
    setError(null)
    try {
      if (!paths.length) throw new Error(t('metadata.noFiles'))
      const newPaths = paths.filter((path) => !rows.some((row) => row.path === path))
      if (!newPaths.length) return
      const loaded: MetadataRow[] = []
      for (let index = 0; index < newPaths.length; index += 4) {
        const batch = await Promise.all(
          newPaths.slice(index, index + 4).map(async (path) => {
            try {
              const response = await getJson<MetadataResponse>(
                `/api/metadata?file=${encodeURIComponent(path)}`,
              )
              const metadata = fieldsFromMetadata(response.metadata)
              return {
                id: path,
                path,
                name: fileName(path),
                metadata,
                original: { ...metadata },
                originalName: fileName(path),
                newFilename: fileName(path),
                bpm: response.metadata?.bpm ?? null,
                key: response.metadata?.key ?? null,
              }
            } catch {
              const metadata = fieldsFromMetadata()
              return {
                id: path,
                path,
                name: fileName(path),
                metadata,
                original: { ...metadata },
                originalName: fileName(path),
                newFilename: fileName(path),
                bpm: null,
                key: null,
              }
            }
          }),
        )
        loaded.push(...batch)
      }
      if (source !== undefined) setFolder(source)
      setRows((current) => {
        const merged = mergeMetadataRows(current, loaded)
        setResult('metadata', merged)
        return merged
      })
      setSelectedId((current) => current ?? loaded[0]?.id ?? null)
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : String(loadError)
      setError(message)
      updateProcess('error')
    }
  }

  const loadFolder = async (directory: string) => {
    try {
      const listed = await getJson<{ files?: string[] }>(
        `/api/metadata/list?dir=${encodeURIComponent(directory)}&recursive=true`,
      )
      await loadFiles(listed.files ?? [], directory)
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : String(loadError)
      setError(message)
      updateProcess('error')
    }
  }

  const chooseFolder = async () => {
    const directory = await electron.openDirectory(t('metadata.selectFolder'))
    if (directory) await loadFolder(directory)
  }

  const addFiles = async () => {
    const picked = await electron.openFiles(t('metadata.selectFolder'), true)
    const paths = Array.isArray(picked) ? picked : picked ? [picked] : []
    if (paths.length)
      await loadFiles(
        mergeUnique([], paths, (path) => path),
        null,
      )
  }

  const onDrop = async (event: React.DragEvent) => {
    event.preventDefault()
    try {
      const paths = await resolveDroppedFiles(event.dataTransfer.files)
      const expanded = await itemsFromPaths(paths, async (path) => {
        const listed = await getJson<{ files?: string[] }>(
          `/api/metadata/list?dir=${encodeURIComponent(path)}&recursive=true`,
        )
        return listed.files ?? []
      })
      const roots = new Set(expanded.flatMap((item) => (item.root ? [item.root] : [])))
      const singleFolder = roots.size === 1 && expanded.every((item) => item.root)
      await loadFiles(
        expanded.map((item) => item.path),
        singleFolder ? [...roots][0] : null,
      )
    } catch (dropError) {
      const message = dropError instanceof Error ? dropError.message : String(dropError)
      setError(message)
      updateProcess('error')
    }
  }

  const identify = async () => {
    const pending = pendingItems(
      rows,
      identified,
      (row) => row.path,
      (path) => path,
    )
    if (!pending.length || busy) return
    const controller = new AbortController()
    controllerRef.current = controller
    setBusy(true)
    setError(null)
    setProgress({ current: 0, total: pending.length, file: '' })
    updateProcess('running')
    try {
      for (let index = 0; index < pending.length; index += 1) {
        if (controller.signal.aborted) break
        const row = pending[index]
        setProgress({ current: index + 1, total: pending.length, file: row.name })
        const response = await fetch('/api/metadata/identify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filePath: row.path, preview: true }),
          signal: controller.signal,
        })
        const payload = (await response.json()) as PreviewResponse & { error?: string }
        if (!response.ok) throw new Error(payload.error || t('metadata.identifyError'))
        const metadata = fieldsFromMetadata(payload.metadata)
        setRows((current) => {
          const updated = current.map((item) =>
            item.id === row.id
              ? {
                  ...item,
                  metadata,
                  newFilename: payload.newFilename || item.name,
                }
              : item,
          )
          setResult('metadata', updated)
          return updated
        })
        setIdentified((current) => mergeUnique(current, [row.path], (path) => path))
      }
      if (!controller.signal.aborted) {
        toast.success(t('metadata.identifyDone'))
        updateProcess('done')
      }
    } catch (identifyError) {
      if (!controller.signal.aborted) {
        const message =
          identifyError instanceof Error ? identifyError.message : String(identifyError)
        setError(message)
        updateProcess('error')
      }
    } finally {
      controllerRef.current = null
      setBusy(false)
    }
  }

  const cancelIdentify = () => {
    controllerRef.current?.abort()
    controllerRef.current = null
    setBusy(false)
    updateProcess('idle')
  }

  const updateForm = (key: keyof MetadataFields, value: string) => {
    setForm((current) => ({ ...current, [key]: value }))
  }

  const save = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!selected || saving) return
    setSaving(true)
    try {
      await postJson('/api/metadata/write', {
        filePath: selected.path,
        metadata: {
          ...form,
          year: form.year ? Number(form.year) : null,
          track: form.track ? Number(form.track) : null,
        },
      })
      let nextPath = selected.path
      if (form.newFilename && form.newFilename !== selected.name) {
        const renamed = await postJson<{ newPath: string }>('/api/metadata/rename', {
          filePath: selected.path,
          newName: form.newFilename,
        })
        nextPath = renamed.newPath
      }
      const saved: MetadataRow = {
        ...selected,
        path: nextPath,
        name: fileName(nextPath),
        metadata: { ...form },
        original: { ...form },
        originalName: fileName(nextPath),
        newFilename: fileName(nextPath),
        bpm: selected.bpm,
        key: selected.key,
      }
      setRows((current) => {
        const updated = current.map((row) => (row.id === selected.id ? saved : row))
        setResult('metadata', updated)
        return updated
      })
      setSelectedId(saved.id)
      setForm(saved.metadata)
      toast.success(t('metadata.saved'))
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : String(saveError)
      setError(message)
    } finally {
      setSaving(false)
    }
  }

  const cancelForm = () => setForm(metadataFormValues(selected))
  const showSettings = error ? isApiKeyError(error) : false

  const pending = pendingItems(
    rows,
    identified,
    (row) => row.path,
    (path) => path,
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
      {dragging && <DropOverlay label={t('metadata.dropToAdd')} />}
      <section className="flex min-w-0 flex-1 flex-col">
        <header className="relative flex h-12 shrink-0 items-center justify-between border-b border-line px-6">
          <div className="flex items-center gap-3">
            <h1 className="text-[15px] font-semibold">{t('metadata.title')}</h1>
            <span className="font-mono text-[11px] text-zinc-500">
              {rows.length} {t('metadata.files')} · {pending.length} {t('metadata.pending')}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <SelectionControls selection={selection} t={t} hasRows={rows.length > 0} />
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label={t('metadata.addFolder')}
                    onClick={() => void chooseFolder()}
                  >
                    <FolderOpen />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{t('metadata.addFolder')}</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label={t('metadata.addFiles')}
                    onClick={() => void addFiles()}
                  >
                    <Plus />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{t('metadata.addFiles')}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
            {busy && (
              <Button variant="outline" size="sm" onClick={cancelIdentify}>
                <X />
                {t('metadata.cancel')}
              </Button>
            )}
            <Button size="sm" onClick={() => void identify()} disabled={busy || !pending.length}>
              <ScanSearch />
              {t('metadata.identify')}
            </Button>
          </div>
          {busy && (
            <div className="absolute inset-x-0 bottom-0 h-0.5 bg-white/10">
              <div
                className="h-full bg-brand transition-all"
                style={{
                  width: `${progress.total ? (progress.current / progress.total) * 100 : 0}%`,
                }}
              />
            </div>
          )}
        </header>
        <div className="flex h-11 shrink-0 items-center justify-between border-b border-line px-6 text-[11px] text-zinc-500">
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
          {busy && (
            <span className="font-mono text-zinc-300">
              {progress.current}/{progress.total} · {progress.file}
            </span>
          )}
        </div>
        {error && (
          <div className="flex items-center justify-between gap-3 border-b border-line px-6 py-2 text-[12px] text-red-300">
            <span className="truncate">{error}</span>
            {showSettings ? (
              <Button variant="outline" size="sm" onClick={() => setView('settings')}>
                {t('metadata.openSettings')}
              </Button>
            ) : null}
            {!showSettings && folder ? (
              <Button variant="outline" size="sm" onClick={() => void loadFolder(folder)}>
                {t('metadata.retry')}
              </Button>
            ) : null}
          </div>
        )}
        {!rows.length ? (
          <EmptyState
            title={error ?? t('metadata.chooseFolder')}
            onAction={chooseFolder}
            onDrop={onDrop}
          />
        ) : (
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
                  <th>{t('metadata.tableTrack')}</th>
                  <th className="w-32">{t('metadata.tableAlbum')}</th>
                  <th className="w-20">{t('metadata.tableYear')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => (
                  <MetadataRowView
                    key={row.id}
                    row={row}
                    index={index}
                    isPlaying={row.path === playingPath}
                    selected={row.id === selected?.id}
                    processing={busy && progress.file === row.name}
                    onSelect={() => setSelectedId(row.id)}
                    onPlay={() => {
                      setSelectedId(row.id)
                      toggle(row.path)
                    }}
                    checked={selection.selected.includes(row.id)}
                    disabled={busy && progress.file === row.name}
                    onCheck={(shiftKey) => selection.toggle(row.id, shiftKey)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <TrackInspector track={selected ? asInspectorTrack(selected) : null}>
        {selected && (
          <form onSubmit={save} className="space-y-3 pt-2">
            <MetadataField
              label={t('metadata.titleField')}
              original={selected.original.title}
              value={form.title}
              onChange={(value) => updateForm('title', value)}
            />
            <MetadataField
              label={t('metadata.artistField')}
              original={selected.original.artist}
              value={form.artist}
              onChange={(value) => updateForm('artist', value)}
            />
            <MetadataField
              label={t('metadata.albumField')}
              original={selected.original.album}
              value={form.album}
              onChange={(value) => updateForm('album', value)}
            />
            <div className="grid grid-cols-2 gap-2">
              <MetadataField
                label={t('metadata.yearField')}
                original={selected.original.year}
                value={form.year}
                onChange={(value) => updateForm('year', value)}
              />
              <MetadataField
                label={t('metadata.genreField')}
                original={selected.original.genre}
                value={form.genre}
                onChange={(value) => updateForm('genre', value)}
              />
            </div>
            <MetadataField
              label={t('metadata.trackField')}
              original={selected.original.track}
              value={form.track}
              onChange={(value) => updateForm('track', value)}
            />
            <MetadataField
              label={t('metadata.filenameField')}
              original={selected.originalName}
              value={form.newFilename ?? selected.newFilename}
              onChange={(value) => setForm((current) => ({ ...current, newFilename: value }))}
            />
            <div className="flex gap-2 pt-2">
              <Button type="submit" size="sm" className="flex-1" disabled={saving}>
                <Save />
                {t('metadata.save')}
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={cancelForm}>
                {t('metadata.cancelEdit')}
              </Button>
            </div>
          </form>
        )}
      </TrackInspector>
    </div>
  )
}

function MetadataField({
  label,
  original,
  value,
  onChange,
}: {
  label: string
  original: string
  value: string
  onChange: (value: string) => void
}) {
  return (
    <label className="block space-y-1 text-[11px]">
      <span className="flex items-center justify-between text-zinc-500">
        <span>{label}</span>
        <span className="max-w-[150px] truncate font-mono text-[10px] text-zinc-600 line-through">
          {display(original)}
        </span>
      </span>
      <Input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-7 text-[12px] text-zinc-100"
      />
    </label>
  )
}

function MetadataRowView({
  row,
  index,
  isPlaying,
  selected,
  processing,
  onSelect,
  onPlay,
  checked,
  disabled,
  onCheck,
}: {
  row: MetadataRow
  index: number
  isPlaying: boolean
  selected: boolean
  processing: boolean
  onSelect: () => void
  onPlay: () => void
  checked: boolean
  disabled: boolean
  onCheck: (shiftKey: boolean) => void
}) {
  return (
    <tr
      onClick={onSelect}
      onDoubleClick={onPlay}
      className={`h-12 cursor-pointer ${selected ? 'bg-white/[0.06]' : 'hover:bg-white/[0.04]'}`}
    >
      <td className="text-center font-mono text-[11px] text-zinc-500">
        <RowCheckbox checked={checked} disabled={disabled} label={row.name} onClick={onCheck} />
      </td>
      <td className="text-center font-mono text-[11px] text-zinc-500">
        {processing ? (
          <span className="mx-auto block size-2 rounded-full bg-brand" />
        ) : isPlaying ? (
          <AudioLines className="mx-auto size-4 text-brand" />
        ) : (
          String(index + 1).padStart(2, '0')
        )}
      </td>
      <td>
        <div className="flex items-center gap-3">
          <TrackArtwork camelotKey={row.key} path={row.path} size={30} />
          <div className="min-w-0">
            <p className="truncate text-[12px] text-zinc-200">
              {display(row.metadata.title) === '—' ? row.name : display(row.metadata.title)}
            </p>
            <p className="truncate text-[11px] text-zinc-500">{display(row.metadata.artist)}</p>
          </div>
        </div>
      </td>
      <td className="truncate text-[12px] text-zinc-300">{display(row.metadata.album)}</td>
      <td className="font-mono text-[12px] text-zinc-400">{display(row.metadata.year)}</td>
    </tr>
  )
}

function EmptyState({
  title,
  onAction,
  onDrop,
}: {
  title: string
  onAction: () => void
  onDrop: (event: React.DragEvent) => void
}) {
  return (
    <button
      type="button"
      onClick={onAction}
      onDragOver={(event) => event.preventDefault()}
      onDrop={onDrop}
      className="flex min-h-0 flex-1 cursor-pointer flex-col items-center justify-center gap-3 text-zinc-500 hover:text-zinc-300"
    >
      <FileAudio className="size-8" />
      <span className="text-[13px]">{title}</span>
    </button>
  )
}

function DropOverlay({ label }: { label: string }) {
  return (
    <div className="pointer-events-none absolute inset-3 z-20 flex items-center justify-center rounded border-2 border-dashed border-brand bg-surface-app/90 text-sm font-semibold text-brand">
      {label}
    </div>
  )
}
