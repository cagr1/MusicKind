import * as React from 'react'

export interface ActiveProcess {
  processId: string | null
  view: string | null
  name: string | null
  current: number
  total: number
  file: string | null
  status: 'idle' | 'running' | 'paused' | 'done' | 'error'
}

interface ProcessContextValue {
  active: ActiveProcess
  results: Record<string, unknown>
  setActive: (process: Partial<ActiveProcess>) => void
  setResult: (view: string, result: unknown) => void
}

const IDLE: ActiveProcess = {
  processId: null,
  view: null,
  name: null,
  current: 0,
  total: 0,
  file: null,
  status: 'idle',
}

const ProcessContext = React.createContext<ProcessContextValue | null>(null)

export function ProcessProvider({ children }: { children: React.ReactNode }) {
  const [active, setActiveState] = React.useState<ActiveProcess>(IDLE)
  const [results, setResults] = React.useState<Record<string, unknown>>({})
  const setActive = React.useCallback((process: Partial<ActiveProcess>) => {
    setActiveState((current) => ({ ...current, ...process }))
  }, [])
  const setResult = React.useCallback((view: string, result: unknown) => {
    setResults((current) => ({ ...current, [view]: result }))
  }, [])
  const value = React.useMemo(
    () => ({ active, results, setActive, setResult }),
    [active, results, setActive, setResult],
  )
  return <ProcessContext.Provider value={value}>{children}</ProcessContext.Provider>
}

export function useProcess(): ProcessContextValue {
  const context = React.useContext(ProcessContext)
  if (!context) throw new Error('useProcess must be used within ProcessProvider')
  return context
}
