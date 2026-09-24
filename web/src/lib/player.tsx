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
}

const PlayerContext = React.createContext<PlayerContextValue | null>(null)

export function PlayerProvider({ children }: { children: React.ReactNode }) {
  const audioRef = React.useRef<HTMLAudioElement | null>(null)
  const [audio, setAudio] = React.useState<HTMLAudioElement | null>(null)
  const [path, setPath] = React.useState<string | null>(null)
  const [playing, setPlaying] = React.useState(false)
  const [currentTime, setCurrentTime] = React.useState(0)
  const [duration, setDuration] = React.useState(0)

  React.useEffect(() => {
    const element = new Audio()
    audioRef.current = element
    setAudio(element)
    const sync = () => {
      setCurrentTime(element.currentTime)
      setDuration(Number.isFinite(element.duration) ? element.duration : 0)
      setPlaying(!element.paused)
    }
    element.addEventListener('timeupdate', sync)
    element.addEventListener('loadedmetadata', sync)
    element.addEventListener('play', sync)
    element.addEventListener('pause', sync)
    element.addEventListener('ended', sync)
    return () => {
      element.pause()
      element.removeEventListener('timeupdate', sync)
      element.removeEventListener('loadedmetadata', sync)
      element.removeEventListener('play', sync)
      element.removeEventListener('pause', sync)
      element.removeEventListener('ended', sync)
      element.src = ''
      audioRef.current = null
    }
  }, [])

  const select = React.useCallback((nextPath: string) => {
    const element = audioRef.current
    if (!element) return
    if (path !== nextPath) {
      element.pause()
      element.src = `/api/audio?path=${encodeURIComponent(nextPath)}`
      element.load()
      setPath(nextPath)
      setCurrentTime(0)
      setDuration(0)
      setPlaying(false)
    }
  }, [path])

  const toggle = React.useCallback((nextPath?: string) => {
    const target = nextPath ?? path
    if (!target) return
    if (target !== path) select(target)
    const element = audioRef.current
    if (!element) return
    if (target !== path) {
      void element.play().catch(() => setPlaying(false))
      return
    }
    if (element.paused) void element.play().catch(() => setPlaying(false))
    else element.pause()
  }, [path, select])

  const seek = React.useCallback((time: number) => {
    if (audioRef.current) audioRef.current.currentTime = Math.max(0, time)
  }, [])

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (event.code !== 'Space' || target?.matches('input, textarea, select, button')) return
      event.preventDefault()
      toggle()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [toggle])

  const value = React.useMemo(
    () => ({ audio, path, playing, currentTime, duration, select, toggle, seek }),
    [audio, path, playing, currentTime, duration, select, toggle, seek],
  )

  return <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>
}

export function usePlayer(): PlayerContextValue {
  const context = React.useContext(PlayerContext)
  if (!context) throw new Error('usePlayer must be used within PlayerProvider')
  return context
}
