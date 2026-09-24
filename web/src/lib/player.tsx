import * as React from 'react'

interface PlayerContextValue {
  audio: HTMLAudioElement | null
  path: string | null
  playing: boolean
  currentTime: number
  duration: number
  select: (path: string) => void
  toggle: (path?: string) => void
  seek: (time: number) => void
  queue: DeckTrack[]
  setQueue: (tracks: DeckTrack[]) => void
  previous: () => void
  next: () => void
  visible: boolean
}

export interface DeckTrack {
  path: string
  title: string
  artist: string
  bpm: number | null
  key: string | null
}

const PlayerContext = React.createContext<PlayerContextValue | null>(null)

export function PlayerProvider({ children }: { children: React.ReactNode }) {
  const audioRef = React.useRef<HTMLAudioElement | null>(null)
  const [audio, setAudio] = React.useState<HTMLAudioElement | null>(null)
  const [path, setPath] = React.useState<string | null>(null)
  const [playing, setPlaying] = React.useState(false)
  const [currentTime, setCurrentTime] = React.useState(0)
  const [duration, setDuration] = React.useState(0)
  const [queue, setQueue] = React.useState<DeckTrack[]>([])
  const [visible, setVisible] = React.useState(false)
  const queueRef = React.useRef(queue)
  const pathRef = React.useRef(path)
  queueRef.current = queue
  pathRef.current = path

  React.useEffect(() => {
    const element = new Audio()
    audioRef.current = element
    setAudio(element)
    const sync = () => {
      setCurrentTime(element.currentTime)
      setDuration(Number.isFinite(element.duration) ? element.duration : 0)
      setPlaying(!element.paused)
    }
    const advance = () => {
      const list = queueRef.current
      const index = list.findIndex((track) => track.path === pathRef.current)
      if (index >= 0 && index < list.length - 1) {
        const next = list[index + 1]
        element.src = `/api/audio?path=${encodeURIComponent(next.path)}`
        pathRef.current = next.path
        setPath(next.path)
        void element.play().catch(() => setPlaying(false))
      }
    }
    element.addEventListener('timeupdate', sync)
    element.addEventListener('loadedmetadata', sync)
    element.addEventListener('play', sync)
    element.addEventListener('pause', sync)
    element.addEventListener('ended', sync)
    element.addEventListener('ended', advance)
    return () => {
      element.pause()
      element.removeEventListener('timeupdate', sync)
      element.removeEventListener('loadedmetadata', sync)
      element.removeEventListener('play', sync)
      element.removeEventListener('pause', sync)
      element.removeEventListener('ended', sync)
      element.removeEventListener('ended', advance)
      element.src = ''
      audioRef.current = null
    }
  }, [])

  const select = React.useCallback(
    (nextPath: string) => {
      const element = audioRef.current
      if (!element) return
      if (path !== nextPath) {
        element.pause()
        element.src = `/api/audio?path=${encodeURIComponent(nextPath)}`
        element.load()
        setPath(nextPath)
        pathRef.current = nextPath
        setVisible(true)
        setCurrentTime(0)
        setDuration(0)
        setPlaying(false)
      }
    },
    [path],
  )

  const play = React.useCallback((element: HTMLAudioElement) => {
    void element
      .play()
      .then(() => setPlaying(true))
      .catch(() => setPlaying(false))
  }, [])

  const toggle = React.useCallback(
    (nextPath?: string) => {
      const target = nextPath ?? path
      if (!target) return
      if (target !== path) select(target)
      const element = audioRef.current
      if (!element) return
      if (target !== path) {
        play(element)
        return
      }
      if (element.paused) play(element)
      else element.pause()
    },
    [path, play, select],
  )

  const seek = React.useCallback((time: number) => {
    if (audioRef.current) audioRef.current.currentTime = Math.max(0, time)
  }, [])

  const step = React.useCallback(
    (delta: number) => {
      const list = queueRef.current
      const index = list.findIndex((track) => track.path === pathRef.current)
      const target = list[index + delta]
      if (!target) return
      const element = audioRef.current
      if (!element) return
      const resume = playing || !element.paused
      element.src = `/api/audio?path=${encodeURIComponent(target.path)}`
      element.load()
      pathRef.current = target.path
      setPath(target.path)
      setCurrentTime(0)
      setDuration(0)
      setVisible(true)
      setPlaying(false)
      if (resume) play(element)
    },
    [play, playing],
  )

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target?.matches('input, textarea, select, button, [contenteditable="true"]')) return
      if (event.code === 'Space') {
        event.preventDefault()
        toggle()
      } else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault()
        seek(
          (audioRef.current?.currentTime ?? 0) +
            (event.key === 'ArrowLeft' ? -1 : 1) * (event.shiftKey ? 30 : 5),
        )
      } else if (event.key === 'ArrowUp') {
        event.preventDefault()
        step(-1)
      } else if (event.key === 'ArrowDown') {
        event.preventDefault()
        step(1)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [toggle, seek, step])

  const value = React.useMemo(
    () => ({
      audio,
      path,
      playing,
      currentTime,
      duration,
      select,
      toggle,
      seek,
      queue,
      setQueue,
      previous: () => step(-1),
      next: () => step(1),
      visible,
    }),
    [audio, path, playing, currentTime, duration, select, toggle, seek, queue, step, visible],
  )

  return <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>
}

export function usePlayer(): PlayerContextValue {
  const context = React.useContext(PlayerContext)
  if (!context) throw new Error('usePlayer must be used within PlayerProvider')
  return context
}
