import * as React from 'react'
import { getJson } from '@/lib/api'
import { electron } from '@/lib/electron'

export type StatusState = 'ok' | 'warn' | 'error'

export interface SystemStatus {
  ffmpeg: StatusState
  python: StatusState
}

const DEFAULT_STATUS: SystemStatus = { ffmpeg: 'warn', python: 'warn' }

const SystemStatusContext = React.createContext<SystemStatus>(DEFAULT_STATUS)

export function SystemStatusProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = React.useState<SystemStatus>(DEFAULT_STATUS)

  React.useEffect(() => {
    let cancelled = false

    getJson<{ ok: boolean; installed: boolean }>('/api/ffmpeg-status')
      .then((data) => {
        if (!cancelled) setStatus((s) => ({ ...s, ffmpeg: data.installed ? 'ok' : 'error' }))
      })
      .catch(() => {
        if (!cancelled) setStatus((s) => ({ ...s, ffmpeg: 'error' }))
      })

    if (electron.isElectron) {
      electron
        .checkPython()
        .then((result) => {
          if (!cancelled) setStatus((s) => ({ ...s, python: result.found ? 'ok' : 'error' }))
        })
        .catch(() => {
          if (!cancelled) setStatus((s) => ({ ...s, python: 'error' }))
        })
    }

    return () => {
      cancelled = true
    }
  }, [])

  return <SystemStatusContext.Provider value={status}>{children}</SystemStatusContext.Provider>
}

export function useSystemStatus(): SystemStatus {
  return React.useContext(SystemStatusContext)
}
