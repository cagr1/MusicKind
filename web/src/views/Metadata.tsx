import * as React from 'react'
import { AudioLines, FileAudio, FolderOpen, Plus, Save, ScanSearch, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { TrackArtwork } from '@/components/music/TrackArtwork'
import {
  InspectorToggle,
  TrackInspector,
  type InspectorTrack,
} from '@/components/music/TrackInspector'
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
import { sortRows, useSort } from '@/lib/sort'
import { SortableHeader } from '@/components/music/SortableHeader'

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
  identifyError?: string
  matchType?: 'exact' | 'fingerprint' | 'original'
  identifyCover?: string
  identifyIsrc?: string
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
  matchType?: 'exact' | 'fingerprint' | 'original'
  identification?: { cover?: string; isrc?: string }
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

export function metadataHasUnsavedChanges(row: MetadataRow): boolean {
  return (
    metadataNeedsRename(row) ||
    (['title', 'artist', 'album', 'year', 'genre', 'track'] as const).some(
      (field) => row.metadata[field] !== row.original[field],
    )
  )
}

export function metadataRowsToSave(rows: MetadataRow[], editedIds: string[] = []): MetadataRow[] {
  const edited = new Set(editedIds)
  return rows.filter(
    (row) => metadataHasUnsavedChanges(row) && (row.matchType !== 'original' || edited.has(row.id)),
  )
}

export function metadataRowsToReview(rows: MetadataRow[], editedIds: string[] = []): MetadataRow[] {
  const edited = new Set(editedIds)
  return rows.filter(
    (row) => metadataHasUnsavedChanges(row) && row.matchType === 'original' && !edited.has(row.id),
  )
}

export function savedMetadataRow(
  row: MetadataRow,
  metadata = row.metadata,
  newPath = row.path,
): MetadataRow {
  const name = fileName(newPath)
  return {
    ...row,
    path: newPath,
    name,
    metadata: { ...metadata },
    original: { ...metadata },
    originalName: name,
    newFilename: name,
    identifyError: undefined,
    matchType: undefined,
  }
}

export async function saveMetadataBatch(
  rows: MetadataRow[],
  saveRow: (row: MetadataRow) => Promise<MetadataRow>,
  onSaved: (row: MetadataRow) => void,
  onError: (row: MetadataRow, error: string) => void,
  editedIds: string[] = [],
): Promise<{ saved: number; errors: number }> {
  let saved = 0
  let errors = 0
  for (const row of metadataRowsToSave(rows, editedIds)) {
    try {
      onSaved(await saveRow(row))
      saved += 1
    } catch (error) {
      onError(row, error instanceof Error ? error.message : String(error))
      errors += 1
    }
  }
  return { saved, errors }
}

async function writeAndRenameRow(row: MetadataRow, metadata: MetadataFields): Promise<MetadataRow> {
  await postJson('/api/metadata/write', {
    filePath: row.path,
    metadata: {
      ...metadata,
      year: metadata.year ? Number(metadata.year) : null,
      track: metadata.track ? Number(metadata.track) : null,
    },
  })
  let nextPath = row.path
  const requestedName = metadata.newFilename ?? row.newFilename
  if (requestedName && requestedName !== row.name) {
    const renamed = await postJson<{ newPath: string }>('/api/metadata/rename', {
      filePath: row.path,
      newName: requestedName,
    })
    nextPath = renamed.newPath
  }
  return savedMetadataRow(row, metadata, nextPath)
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
  const { sort, toggleSort } = useSort()
  const visibleRows = React.useMemo(
    () =>
      sortRows(rows, sort, {
        track: (row) => row.metadata.title || row.name,
        artist: (row) => row.metadata.artist,
        album: (row) => row.metadata.album,
        year: (row) => row.metadata.year,
      }),
    [rows, sort],
  )
  const [selectedId, setSelectedId] = React.useState<string | null>(null)
  const [form, setForm] = React.useState<MetadataFields>(metadataFormValues(null))
  const [error, setError] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [rowErrors, setRowErrors] = React.useState<Record<string, string>>({})
  const [editedIds, setEditedIds] = React.useState<string[]>([])
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
        visibleRows.map((row) => ({
          path: row.path,
          title: display(row.metadata.title) === '—' ? row.name : display(row.metadata.title),
          artist: display(row.metadata.artist),
          bpm: row.bpm ?? null,
          key: row.key ?? null,
        })),
      ),
    [setQueue, visibleRows],
  )
  const undoSnapshot = React.useRef<{ rows: MetadataRow[]; identified: string[] } | null>(null)
  const selection = useRowSelection({
    items: visibleRows,
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
    let identifiedCount = 0
    let failedCount = 0
    try {
      for (let index = 0; index < pending.length; index += 1) {
        if (controller.signal.aborted) break
        const row = pending[index]
        setProgress({ current: index + 1, total: pending.length, file: row.name })
        let response: Response
        let payload: PreviewResponse & { error?: string }
        try {
          response = await fetch('/api/metadata/identify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filePath: row.path, preview: true }),
            signal: controller.signal,
          })
          payload = (await response.json()) as PreviewResponse & { error?: string }
        } catch (requestError) {
          if (controller.signal.aborted) break
          const reason = requestError instanceof Error ? requestError.message : String(requestError)
          failedCount += 1
          setRows((current) => {
            const updated = current.map((item) =>
              item.id === row.id ? { ...item, identifyError: reason } : item,
            )
            setResult('metadata', updated)
            return updated
          })
          continue
        }
        if (!response.ok) {
          const reason = payload.error || t('metadata.identifyError')
          failedCount += 1
          setRows((current) => {
            const updated = current.map((item) =>
              item.id === row.id ? { ...item, identifyError: reason } : item,
            )
            setResult('metadata', updated)
            return updated
          })
          continue
        }
        const metadata = fieldsFromMetadata(payload.metadata)
        setRows((current) => {
          const updated = current.map((item) =>
            item.id === row.id
              ? {
                  ...item,
                  metadata,
                  newFilename: payload.newFilename || item.name,
                  identifyError: undefined,
                  matchType: payload.matchType || 'exact',
                  identifyCover: payload.identification?.cover || undefined,
                  identifyIsrc: payload.identification?.isrc || undefined,
                }
              : item,
          )
          setResult('metadata', updated)
          return updated
        })
        setIdentified((current) => mergeUnique(current, [row.path], (path) => path))
        identifiedCount += 1
      }
      if (!controller.signal.aborted) {
        toast.success(
          t('metadata.identifySummary')
            .replace('{identified}', String(identifiedCount))
            .replace('{failed}', String(failedCount)),
        )
        updateProcess(failedCount ? 'error' : 'done')
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
    if (selected) setEditedIds((current) => mergeUnique(current, [selected.id], (id) => id))
  }

  const save = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!selected || saving) return
    setSaving(true)
    try {
      const saved = await writeAndRenameRow(selected, form)
      setRows((current) => {
        const updated = current.map((row) => (row.id === selected.id ? saved : row))
        setResult('metadata', updated)
        return updated
      })
      setSelectedId(saved.id)
      setForm(saved.metadata)
      setEditedIds((current) => current.filter((id) => id !== selected.id))
      setRowErrors((current) => {
        const next = { ...current }
        delete next[selected.id]
        return next
      })
      toast.success(t('metadata.saved'))
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : String(saveError)
      setError(message)
    } finally {
      setSaving(false)
    }
  }

  const saveAll = async () => {
    if (saving || busy) return
    const rowsToSave = rows.map((row) =>
      row.id === selected?.id
        ? { ...row, metadata: { ...form }, newFilename: form.newFilename ?? row.newFilename }
        : row,
    )
    const targets = metadataRowsToSave(rowsToSave, editedIds)
    const reviewCount = metadataRowsToReview(rowsToSave, editedIds).length
    if (!targets.length) return
    setSaving(true)
    const summary = await saveMetadataBatch(
      rowsToSave,
      (row) => writeAndRenameRow(row, row.metadata),
      (saved) => {
        setRows((current) => {
          const updated = current.map((item) => (item.id === saved.id ? saved : item))
          setResult('metadata', updated)
          return updated
        })
        setRowErrors((current) => {
          const next = { ...current }
          delete next[saved.id]
          return next
        })
        setEditedIds((current) => current.filter((id) => id !== saved.id))
      },
      (failed, message) => setRowErrors((current) => ({ ...current, [failed.id]: message })),
      editedIds,
    )
    setSaving(false)
    toast.success(
      t('metadata.saveSummary')
        .replace('{saved}', String(summary.saved))
        .replace('{errors}', String(summary.errors))
        .replace('{review}', String(reviewCount)),
    )
  }

  const cancelForm = () => setForm(metadataFormValues(selected))
  const showSettings = error ? isApiKeyError(error) : false

  const pending = pendingItems(
    rows,
    identified,
    (row) => row.path,
    (path) => path,
  )
  const rowsWithDraft = rows.map((row) =>
    row.id === selected?.id
      ? { ...row, metadata: { ...form }, newFilename: form.newFilename ?? row.newFilename }
      : row,
  )
  const saveableRows = metadataRowsToSave(rowsWithDraft, editedIds)

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
            <span className="whitespace-nowrap truncate font-mono text-[11px] text-zinc-500">
              {rows.length} {t('metadata.files')} · {pending.length} {t('metadata.pending')}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {!busy && !saving && saveableRows.length > 0 && (
              <Button size="sm" onClick={() => void saveAll()}>
                <Save />
                {t('metadata.saveChanges').replace('{count}', String(saveableRows.length))}
              </Button>
            )}
            <InspectorToggle />
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
            <Button
              className="max-[1099px]:size-8 max-[1099px]:gap-0 max-[1099px]:px-2 max-[1099px]:text-[0px] [&_svg]:size-4"
              size="sm"
              onClick={() => void identify()}
              disabled={busy || !pending.length}
            >
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
          <div className="@container min-h-0 flex-1 overflow-auto px-6 pt-0 pb-2">
            <table className="w-full min-w-[760px] table-fixed text-left">
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
                    {t('metadata.tableTrack')}
                  </SortableHeader>
                  <SortableHeader
                    className="w-40 @max-[600px]:hidden"
                    sort={sort}
                    sortKey="artist"
                    onSort={toggleSort}
                  >
                    {t('common.artist')}
                  </SortableHeader>
                  <SortableHeader
                    className="w-32 @max-[680px]:hidden"
                    sort={sort}
                    sortKey="album"
                    onSort={toggleSort}
                  >
                    {t('metadata.tableAlbum')}
                  </SortableHeader>
                  <SortableHeader
                    className="w-20 @max-[680px]:hidden"
                    sort={sort}
                    sortKey="year"
                    onSort={toggleSort}
                  >
                    {t('metadata.tableYear')}
                  </SortableHeader>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((row, index) => (
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
                    identifyLabel={t('metadata.notIdentified')}
                    originalLabel={t('metadata.originalMatchShort')}
                    unsavedLabel={t('metadata.unsaved')}
                    rowError={rowErrors[row.id]}
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
            {selected.identifyError && (
              <p role="status" className="text-[11px] text-amber-400">
                {t('metadata.notIdentified')}: {selected.identifyError}
              </p>
            )}
            {rowErrors[selected.id] && (
              <p role="alert" className="text-[11px] text-red-300">
                {rowErrors[selected.id]}
              </p>
            )}
            {metadataHasUnsavedChanges(
              rowsWithDraft.find((row) => row.id === selected.id) ?? selected,
            ) && (
              <p role="status" className="text-[11px] text-amber-400">
                {t('metadata.unsaved')}
              </p>
            )}
            {selected.matchType === 'original' && (
              <p role="status" className="text-[11px] text-brand">
                {t('metadata.originalMatch')}
              </p>
            )}
            {selected.identifyCover && (
              <img
                src={selected.identifyCover}
                alt={t('metadata.originalArtwork')}
                className="size-20 rounded border border-line object-cover"
              />
            )}
            {selected.identifyIsrc && (
              <p className="text-[11px] text-zinc-400">ISRC: {selected.identifyIsrc}</p>
            )}
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
              onChange={(value) => updateForm('newFilename', value)}
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
  identifyLabel,
  originalLabel,
  unsavedLabel,
  rowError,
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
  identifyLabel: string
  originalLabel: string
  unsavedLabel: string
  rowError?: string
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
            <p
              className="truncate text-[12px] text-zinc-200"
              title={display(row.metadata.title) === '—' ? row.name : display(row.metadata.title)}
            >
              {display(row.metadata.title) === '—' ? row.name : display(row.metadata.title)}
            </p>
            {(row.identifyError ||
              row.matchType === 'original' ||
              metadataHasUnsavedChanges(row) ||
              rowError) && (
              <p
                className={`truncate text-[10px] ${row.identifyError || rowError || metadataHasUnsavedChanges(row) ? 'text-amber-400' : 'text-brand'}`}
                title={rowError || row.identifyError || undefined}
              >
                {rowError ||
                  (row.identifyError
                    ? `${identifyLabel}: ${row.identifyError}`
                    : row.matchType === 'original'
                      ? originalLabel
                      : unsavedLabel)}
              </p>
            )}
            <p className="hidden truncate text-[11px] text-zinc-500 @max-[600px]:block">
              {display(row.metadata.artist)}
            </p>
          </div>
        </div>
      </td>
      <td
        className={`w-40 truncate pr-2 text-[12px] @max-[600px]:hidden ${row.metadata.artist?.trim() ? 'text-zinc-300' : 'text-zinc-600'}`}
        title={row.metadata.artist?.trim() || undefined}
      >
        {display(row.metadata.artist)}
      </td>
      <td className="truncate text-[12px] text-zinc-300 @max-[680px]:hidden">
        {display(row.metadata.album)}
      </td>
      <td className="font-mono text-[12px] text-zinc-400 @max-[680px]:hidden">
        {display(row.metadata.year)}
      </td>
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
