import * as React from 'react'
import {
  AudioLines,
  Disc3,
  FolderOpen,
  Headphones,
  Mic2,
  Music2,
  Pause,
  Play,
  Settings as SettingsIcon,
  Split,
  FileAudio,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import {
  InspectorToggle,
  TrackInspector,
  type InspectorTrack,
} from '@/components/music/TrackInspector'
import { getJson, useProcessStream } from '@/lib/api'
import { electron, resolveDroppedFiles } from '@/lib/electron'
import { useProcess } from '@/lib/process'
import { useT } from '@/i18n/I18nProvider'
import { useView } from '@/hooks/useView'
import { usePlayer } from '@/lib/player'

export type StemLaneKey = 'original' | 'vocals' | 'instrumental'
export interface StemLaneState {
  muted: boolean
  audible: boolean
  volume: number
}
export interface StemResult {
  ok: boolean
  input: string
  files?: string[]
  vocals?: string | null
  instrumental?: string | null
  title?: string
  artist?: string
  bpm?: number | null
  key?: string | null
  error?: string
}
export const STEM_LANES: StemLaneKey[] = ['original', 'vocals', 'instrumental']

export function defaultLaneState(): Record<StemLaneKey, StemLaneState> {
  return {
    original: { muted: false, audible: false, volume: 85 },
    vocals: { muted: false, audible: true, volume: 100 },
    instrumental: { muted: false, audible: false, volume: 90 },
  }
}

export function createStemAudioController(audio: HTMLAudioElement[], initial = defaultLaneState()) {
  const state = { ...initial }
  const applyVolumes = () => {
    STEM_LANES.forEach((lane, index) => {
      const laneState = state[lane]
      audio[index].volume = !laneState.muted && laneState.audible ? laneState.volume / 100 : 0
    })
  }
  const setMute = (lane: StemLaneKey, muted: boolean) => {
    state[lane] = { ...state[lane], muted }
    applyVolumes()
  }
  const setAudible = (lane: StemLaneKey, audible: boolean, additive = false) => {
    STEM_LANES.forEach((key) => {
      state[key] = {
        ...state[key],
        audible: key === lane ? audible : additive ? state[key].audible : false,
      }
    })
    applyVolumes()
  }
  const setVolume = (lane: StemLaneKey, volume: number) => {
    state[lane] = { ...state[lane], volume: Math.max(0, Math.min(100, volume)) }
    applyVolumes()
  }
  const seek = (time: number) =>
    audio.forEach((element) => {
      element.currentTime = Math.max(0, time)
    })
  const play = () => Promise.all(audio.map((element) => element.play()))
  const pause = () => audio.forEach((element) => element.pause())
  const destroy = () => {
    pause()
    audio.forEach((element) => {
      element.src = ''
      element.load()
    })
  }
  applyVolumes()
  return { state, setMute, setAudible, setVolume, seek, play, pause, destroy }
}

export function createStemSeparationRequest(
  input: string,
  outputDir: string,
  stems: 'vocals' | 'instrumental' | 'both',
  format: 'wav' | 'mp3',
) {
  return { files: [input], outputDir, stems, format }
}

export function generatedStemLanes(result: StemResult | null) {
  return STEM_LANES.filter((lane) => lane === 'original' || Boolean(result?.[lane]))
}

function fileName(path: string) {
  return path.split(/[\\/]/).pop() ?? path
}
function formatTime(seconds: number) {
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`
}
function resultFrom(value: unknown): StemResult | null {
  const candidate = Array.isArray(value) ? value[0] : value
  return candidate && typeof candidate === 'object' ? (candidate as StemResult) : null
}

export function Stems() {
  const t = useT()
  const { setView } = useView()
  const { state, run, pause, resume, cancel } = useProcessStream()
  const { setActive } = useProcess()
  const { audio: deckAudio } = usePlayer()
  const [input, setInput] = React.useState<string | null>(null)
  const [result, setResult] = React.useState<StemResult | null>(null)
  const [outputDir, setOutputDir] = React.useState<string | null>(null)
  const [format, setFormat] = React.useState<'wav' | 'mp3'>('wav')
  const [stemChoice, setStemChoice] = React.useState<'vocals' | 'instrumental' | 'both'>('both')
  const [demucsInstalled, setDemucsInstalled] = React.useState<boolean | null>(null)
  const [metadata, setMetadata] = React.useState<InspectorTrack | null>(null)
  const [laneState, setLaneState] = React.useState(defaultLaneState)
  const [playing, setPlaying] = React.useState(false)
  const [audioReady, setAudioReady] = React.useState(false)
  const [currentTime, setCurrentTime] = React.useState(0)
  const [duration, setDuration] = React.useState(0)
  const [error, setError] = React.useState<string | null>(null)
  const controllerRef = React.useRef<ReturnType<typeof createStemAudioController> | null>(null)
  const isBusy = state.status === 'running' || state.status === 'paused'

  React.useEffect(() => {
    let cancelled = false
    void Promise.all([
      getJson<{ settings?: { defaultOutputDir?: string } }>('/api/settings'),
      getJson<{ deps?: { demucs?: boolean } }>('/api/check-deps'),
    ])
      .then(([settings, deps]) => {
        if (cancelled) return
        setOutputDir(settings.settings?.defaultOutputDir || 'output')
        setDemucsInstalled(deps.deps?.demucs === true)
      })
      .catch(() => {
        if (!cancelled) setDemucsInstalled(false)
      })
    return () => {
      cancelled = true
    }
  }, [])
  React.useEffect(() => {
    setActive({
      processId: state.processId,
      view: 'stems',
      name: t('stems.title'),
      current: state.progress?.current ?? 0,
      total: state.progress?.total ?? 0,
      file: state.progress?.file ?? null,
      status: state.status,
    })
  }, [setActive, state, t])
  React.useEffect(() => {
    if (!input) {
      setMetadata(null)
      return
    }
    let cancelled = false
    void getJson<{
      metadata?: { title?: string; artist?: string; bpm?: number | null; key?: string | null }
    }>(`/api/metadata?file=${encodeURIComponent(input)}`)
      .then(({ metadata: tags }) => {
        if (cancelled) return
        setMetadata({
          id: input,
          title: tags?.title?.trim() || fileName(input),
          artist: tags?.artist?.trim() || '—',
          bpm: tags?.bpm ?? null,
          key: tags?.key ?? null,
          path: input,
        })
      })
      .catch(() => {
        if (!cancelled)
          setMetadata({
            id: input,
            title: fileName(input),
            artist: '—',
            bpm: null,
            key: null,
            path: input,
          })
      })
    return () => {
      cancelled = true
    }
  }, [input])

  const lanePaths = React.useMemo(
    () => [input, result?.vocals ?? null, result?.instrumental ?? null],
    [input, result],
  )
  React.useEffect(() => {
    controllerRef.current?.destroy()
    setAudioReady(false)
    if (!lanePaths[0]) {
      controllerRef.current = null
      return
    }
    const audio = lanePaths.map((path) => {
      const element = new Audio()
      if (path) element.src = `/api/audio?path=${encodeURIComponent(path)}`
      element.load()
      return element
    })
    const initialLaneState = defaultLaneState()
    if (!lanePaths[1] && lanePaths[2]) {
      initialLaneState.vocals.audible = false
      initialLaneState.instrumental.audible = true
    } else if (!lanePaths[1] && !lanePaths[2]) {
      initialLaneState.original.audible = true
      initialLaneState.vocals.audible = false
    }
    setLaneState(initialLaneState)
    const controller = createStemAudioController(audio, initialLaneState)
    const sync = () => {
      setCurrentTime(audio[0].currentTime)
      setDuration(Number.isFinite(audio[0].duration) ? audio[0].duration : 0)
      setPlaying(!audio[0].paused)
    }
    audio.forEach((element) =>
      ['timeupdate', 'loadedmetadata', 'play', 'pause', 'ended'].forEach((event) =>
        element.addEventListener(event, sync),
      ),
    )
    controllerRef.current = controller
    setAudioReady(true)
    return () => {
      audio.forEach((element) =>
        ['timeupdate', 'loadedmetadata', 'play', 'pause', 'ended'].forEach((event) =>
          element.removeEventListener(event, sync),
        ),
      )
      controller.destroy()
      setAudioReady(false)
    }
  }, [lanePaths])

  React.useEffect(() => {
    const pauseStems = () => controllerRef.current?.pause()
    window.addEventListener('musickind:deck-play', pauseStems)
    return () => window.removeEventListener('musickind:deck-play', pauseStems)
  }, [])

  const chooseFile = async () => {
    const picked = await electron.openFiles(t('stems.selectFile'), false)
    const next = Array.isArray(picked) ? picked[0] : picked
    if (!next) return
    setInput(next)
    setResult(null)
    setError(null)
    setLaneState(defaultLaneState())
  }
  const onDrop = async (event: React.DragEvent) => {
    event.preventDefault()
    try {
      const files = await resolveDroppedFiles(event.dataTransfer.files)
      if (files[0]) {
        setInput(files[0])
        setResult(null)
        setError(null)
      }
    } catch (dropError) {
      setError(dropError instanceof Error ? dropError.message : String(dropError))
    }
  }
  const start = async () => {
    if (!input || !outputDir || isBusy) return
    setError(null)
    await run(
      '/api/stem-separate',
      createStemSeparationRequest(input, outputDir, stemChoice, format),
      (value) => {
        const next = resultFrom(value)
        if (!next?.ok) {
          setError(next?.error || t('stems.error'))
          return
        }
        setResult(next)
      },
    )
  }
  const togglePlay = async () => {
    const controller = controllerRef.current
    if (!controller) return
    if (playing) {
      controller.pause()
      setPlaying(false)
    } else {
      try {
        deckAudio?.pause()
        window.dispatchEvent(new Event('musickind:stems-play'))
        await controller.play()
        setPlaying(true)
      } catch {
        setError(t('stems.playbackError'))
      }
    }
  }
  const seek = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!duration) return
    const rect = event.currentTarget.getBoundingClientRect()
    controllerRef.current?.seek(((event.clientX - rect.left) / rect.width) * duration)
  }
  const updateLane = (lane: StemLaneKey, patch: Partial<StemLaneState>) => {
    setLaneState((current) => {
      const next = { ...current, [lane]: { ...current[lane], ...patch } }
      if (patch.muted !== undefined) controllerRef.current?.setMute(lane, patch.muted)
      if (patch.audible !== undefined) controllerRef.current?.setAudible(lane, patch.audible)
      if (patch.volume !== undefined) controllerRef.current?.setVolume(lane, patch.volume)
      return next
    })
  }
  const laneItems = [
    {
      key: 'original' as const,
      label: t('stems.original'),
      icon: Disc3,
      path: input,
      color: 'bg-zinc-500',
    },
    {
      key: 'vocals' as const,
      label: t('stems.vocals'),
      icon: Mic2,
      path: result?.vocals ?? null,
      color: 'bg-brand',
    },
    {
      key: 'instrumental' as const,
      label: t('stems.instrumental'),
      icon: Music2,
      path: result?.instrumental ?? null,
      color: 'bg-zinc-300',
    },
  ]
  const visibleLanes = new Set(generatedStemLanes(result))

  return (
    <div className="flex h-full min-w-0 overflow-hidden">
      <section className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="relative flex h-12 shrink-0 items-center justify-between border-b border-line px-6">
          <div className="flex items-center gap-3">
            <h1 className="text-[15px] font-semibold">{t('stems.title')}</h1>
          </div>
          <div className="flex items-center gap-2">
            <InspectorToggle />
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label={t('stems.chooseOther')}
              title={t('stems.chooseOther')}
              onClick={() => void chooseFile()}
            >
              <FileAudio />
            </Button>
            {isBusy ? (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void (state.status === 'paused' ? resume() : pause())}
                >
                  {state.status === 'paused' ? <Play /> : <Pause />}
                  {state.status === 'paused' ? t('stems.resume') : t('stems.pause')}
                </Button>
                <Button variant="outline" size="sm" onClick={() => void cancel()}>
                  <X />
                  {t('stems.cancel')}
                </Button>
              </>
            ) : null}
            <Button
              size="sm"
              onClick={() => void start()}
              disabled={!input || !outputDir || isBusy || demucsInstalled === false}
            >
              <Split />
              {t('stems.separate')}
            </Button>
          </div>
          {isBusy ? (
            <div className="absolute inset-x-0 bottom-0 h-0.5 bg-white/10">
              <div
                className="h-full bg-brand transition-all"
                style={{ width: `${state.progress?.percentage ?? 0}%` }}
              />
            </div>
          ) : null}
        </header>
        {!input && !error && demucsInstalled !== false ? (
          <EmptyState
            icon={AudioLines}
            title={t('stems.chooseFile')}
            action={t('stems.selectFile')}
            onAction={chooseFile}
            onDrop={onDrop}
          />
        ) : demucsInstalled === false && !input ? (
          <EmptyState
            icon={SettingsIcon}
            title={t('stems.demucsMissing')}
            action={t('stems.openSettings')}
            onAction={() => setView('settings')}
          />
        ) : (
          <>
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-line px-6 py-3">
              <button
                type="button"
                onClick={() => outputDir && void electron.showInFolder(outputDir)}
                title={outputDir ?? undefined}
                className="flex min-w-0 max-w-full flex-1 items-center gap-2 text-left text-[11px] text-zinc-400 hover:text-zinc-200"
              >
                <FolderOpen className="size-4" />
                <span className="whitespace-nowrap">{t('stems.destination')}:</span>
                <span className="truncate font-mono">{outputDir ? fileName(outputDir) : '—'}</span>
              </button>
              <div className="flex items-center gap-3 text-[11px] text-zinc-500">
                <span>{t('stems.format')}</span>
                <Select value={format} onValueChange={(value: 'wav' | 'mp3') => setFormat(value)}>
                  <SelectTrigger
                    size="sm"
                    aria-label={t('stems.format')}
                    className="w-24 font-mono"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="wav">WAV</SelectItem>
                    <SelectItem value="mp3">MP3</SelectItem>
                  </SelectContent>
                </Select>
                <div
                  className="flex rounded border border-line p-0.5"
                  role="group"
                  aria-label={t('stems.chooseStems')}
                  title={t('stems.processTime')}
                >
                  {(['vocals', 'instrumental', 'both'] as const).map((choice) => (
                    <button
                      key={choice}
                      type="button"
                      onClick={() => setStemChoice(choice)}
                      aria-pressed={stemChoice === choice}
                      className={`rounded px-2 py-1 ${stemChoice === choice ? 'bg-white/[0.07] text-brand' : 'text-zinc-400'}`}
                    >
                      {t(`stems.choice.${choice}`)}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            {isBusy ? (
              <div className="flex items-center justify-end gap-2 border-b border-line px-6 py-2 font-mono text-[11px] text-zinc-400">
                <span className="text-zinc-200">
                  {state.progress?.current ?? 0}/{state.progress?.total ?? 1}
                </span>
                <span className="truncate">{state.progress?.file}</span>
              </div>
            ) : null}
            {error || state.status === 'error' ? (
              <div className="mx-6 mt-4 flex items-center justify-between border border-red-500/30 bg-red-500/10 px-3 py-2 text-[12px] text-red-200">
                <span>{error || state.error || t('stems.error')}</span>
                <Button variant="outline" size="sm" onClick={() => void start()}>
                  {t('stems.retry')}
                </Button>
              </div>
            ) : null}
            <div className="min-h-0 flex-1 overflow-auto px-6 py-5">
              <div className="mb-2 flex items-center">
                <div className="flex w-44 shrink-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void togglePlay()}
                    disabled={!audioReady}
                    className="flex size-8 shrink-0 items-center justify-center rounded-full border border-line bg-surface-panel text-zinc-100 hover:border-brand hover:text-brand disabled:opacity-40"
                    aria-label={playing ? t('music.pause') : t('music.play')}
                  >
                    {playing ? (
                      <Pause className="size-3.5 fill-current" />
                    ) : (
                      <Play className="ml-0.5 size-3.5 fill-current" />
                    )}
                  </button>
                  <span className="whitespace-nowrap font-mono text-[10px] tabular-nums text-zinc-300">
                    {formatTime(currentTime)} / {formatTime(duration)}
                  </span>
                </div>
                <div className="flex min-w-0 flex-1 justify-between font-mono text-[10px] text-zinc-500">
                  <span>00:00</span>
                  <span>{formatTime(duration / 2)}</span>
                  <span>{formatTime(duration)}</span>
                </div>
              </div>
              <div className="space-y-2">
                {laneItems
                  .filter((lane) => visibleLanes.has(lane.key))
                  .map((lane) => (
                    <StemLane
                      key={lane.key}
                      lane={lane.key}
                      label={lane.label}
                      icon={lane.icon}
                      path={lane.path}
                      color={lane.color}
                      state={laneState[lane.key]}
                      active={laneState[lane.key].audible}
                      disabled={!lane.path}
                      currentTime={currentTime}
                      duration={duration}
                      onSeek={seek}
                      onUpdate={updateLane}
                      onShow={
                        lane.path
                          ? () => void electron.showInFolder(lane.path as string)
                          : undefined
                      }
                      t={t}
                    />
                  ))}
              </div>
            </div>
          </>
        )}
      </section>
      <TrackInspector track={metadata}>
        {result && (result.vocals || result.instrumental) ? (
          <div className="space-y-2 rounded border border-line bg-surface-panel p-3 text-[11px]">
            {result.vocals ? (
              <div className="flex justify-between">
                <span className="text-zinc-500">{t('stems.vocals')}</span>
                <span className="max-w-40 truncate font-mono">{fileName(result.vocals)}</span>
              </div>
            ) : null}
            {result.instrumental ? (
              <div className="flex justify-between">
                <span className="text-zinc-500">{t('stems.instrumental')}</span>
                <span className="max-w-40 truncate font-mono">{fileName(result.instrumental)}</span>
              </div>
            ) : null}
          </div>
        ) : null}
      </TrackInspector>
    </div>
  )
}

function StemLane({
  lane,
  label,
  icon: Icon,
  path,
  color,
  state,
  active,
  disabled,
  currentTime,
  duration,
  onSeek,
  onUpdate,
  onShow,
  t,
}: {
  lane: StemLaneKey
  label: string
  icon: typeof Disc3
  path: string | null
  color: string
  state: StemLaneState
  active: boolean
  disabled: boolean
  currentTime: number
  duration: number
  onSeek: (event: React.MouseEvent<HTMLDivElement>) => void
  onUpdate: (lane: StemLaneKey, patch: Partial<StemLaneState>) => void
  onShow?: () => void
  t: ReturnType<typeof useT>
}) {
  return (
    <div
      className={`flex h-[86px] overflow-hidden rounded border border-line ${active ? 'bg-white/[0.06]' : 'bg-surface-panel'}`}
    >
      <div className="flex w-44 shrink-0 flex-col justify-between border-r border-line px-3 py-2">
        <div className="flex items-center justify-between gap-2">
          <span className="flex min-w-0 items-center gap-1.5 truncate text-[11px] font-semibold uppercase tracking-wider text-zinc-300">
            <Icon className="size-3.5 shrink-0 text-zinc-500" />
            {label}
          </span>
          <button
            type="button"
            onClick={onShow}
            disabled={!onShow}
            className="text-zinc-500 hover:text-zinc-200 disabled:opacity-30"
            aria-label={t('stems.showInFolder')}
          >
            <FolderOpen className="size-3.5" />
          </button>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={(event) =>
              onUpdate(lane, { audible: event.shiftKey ? !state.audible : !active })
            }
            disabled={disabled}
            className={`flex size-5 items-center justify-center rounded ${active ? 'text-brand' : 'text-zinc-400'} disabled:opacity-30`}
            aria-label={t('stems.listenLane')}
            title={t('stems.listenLane')}
            aria-pressed={active}
          >
            <Headphones className="size-3.5" />
          </button>
          <Slider
            min={0}
            max={100}
            step={1}
            value={[state.volume]}
            onValueChange={([volume]) => onUpdate(lane, { volume })}
            aria-label={`${label} ${t('stems.volume')}`}
          />
        </div>
      </div>
      <Waveform
        path={path}
        color={color}
        currentTime={currentTime}
        duration={duration}
        onSeek={onSeek}
        t={t}
      />
    </div>
  )
}

function Waveform({
  path,
  color,
  currentTime,
  duration,
  onSeek,
  t,
}: {
  path: string | null
  color: string
  currentTime: number
  duration: number
  onSeek: (event: React.MouseEvent<HTMLDivElement>) => void
  t: ReturnType<typeof useT>
}) {
  const [peaks, setPeaks] = React.useState<number[] | null>(null)
  React.useEffect(() => {
    setPeaks(null)
    if (!path) return
    let cancelled = false
    void getJson<{ peaks: number[] }>(`/api/waveform?path=${encodeURIComponent(path)}&bins=180`)
      .then((data) => {
        if (!cancelled) setPeaks(data.peaks)
      })
      .catch(() => {
        if (!cancelled) setPeaks([])
      })
    return () => {
      cancelled = true
    }
  }, [path])
  const progress = duration ? Math.min(100, (currentTime / duration) * 100) : 0
  return (
    <div
      className="relative flex min-w-0 flex-1 cursor-pointer items-center overflow-hidden px-3"
      onClick={onSeek}
      role="slider"
      tabIndex={0}
      aria-valuenow={currentTime}
      aria-valuemin={0}
      aria-valuemax={duration || 0}
      aria-label={t('music.waveform')}
    >
      <div className="flex h-14 w-full items-center gap-px">
        {peaks?.map((peak, index) => (
          <span
            key={index}
            className={`min-w-px flex-1 rounded-sm ${color}`}
            style={{
              height: `${Math.max(4, peak * 48)}px`,
              opacity: (index / Math.max(1, peaks.length)) * 100 <= progress ? 0.95 : 0.35,
            }}
          />
        )) ?? <span className="h-px w-full bg-zinc-700" />}
      </div>
      <div
        className="pointer-events-none absolute inset-y-0 w-px bg-brand"
        style={{ left: `calc(${progress}% + 12px)` }}
      />
    </div>
  )
}

function EmptyState({
  icon: Icon,
  title,
  action,
  onAction,
  onDrop,
}: {
  icon: typeof AudioLines
  title: string
  action: string
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
      className="flex min-h-0 flex-1 cursor-pointer flex-col items-center justify-center gap-3 border-2 border-dashed border-zinc-800 p-8 text-center hover:border-zinc-700"
    >
      <span className="flex size-12 items-center justify-center rounded-full border border-dashed border-zinc-700 text-brand">
        <Icon className="size-5" />
      </span>
      <span className="text-[15px] font-semibold text-zinc-200">{title}</span>
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
    </div>
  )
}
