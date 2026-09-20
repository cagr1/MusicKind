// Data layer for the Node HTTP server (src/server.js).
//
// SSE contract found in src/server.js `runProcessWithProgress()` (~L743-850):
//   - `{ type: "progress", current, processed, total, percentage, message }`
//   - `{ type: "log", message, stream? }`
//   - `{ type: "result", results }` (only when the route passes `{ parseJsonResult: true }`)
//   - `{ type: "complete", success, processed, total, cancelled, error?, message? }`
// `ui/app.js` reads it identically in 6 places (fetch + res.body.getReader() +
// TextDecoder + split("\n") buffering a trailing partial line), e.g. L353-370
// (classifier), L903-920 (dep install), L1070-1096 (sets), L1235-1260
// (converter), L1737-1760 (bpm), L1929-1955 (stems). Cancel/pause/resume post
// `{ processId }` to /api/cancel, /api/pause, /api/resume (ui/app.js L963-1004).

import * as React from 'react'

export async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(path)
  if (!res.ok) {
    throw new Error(`GET ${path} failed: ${res.status}`)
  }
  return (await res.json()) as T
}

export async function postJson<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  })
  if (!res.ok) {
    let message = `POST ${path} failed: ${res.status}`
    try {
      const data = (await res.json()) as { error?: string }
      if (data?.error) message = data.error
    } catch {
      // Response wasn't JSON — keep the default message.
    }
    throw new Error(message)
  }
  return (await res.json()) as T
}

export interface ProgressPayload {
  current: number
  total: number
  file: string
  percentage: number
}

export interface StreamHandlers {
  onStart?: (processId: string) => void
  onProgress?: (progress: ProgressPayload) => void
  onLog?: (line: string) => void
  onResult?: (result: unknown) => void
  onError?: (message: string) => void
  onDone?: (info: { success: boolean; cancelled: boolean }) => void
}

export interface StreamProcessResult {
  processId: string
}

// Pure and unit-testable: appends a raw chunk to a pending buffer and returns
// the complete lines plus the (possibly partial) remainder, mirroring
// `buffer = lines.pop()` in ui/app.js.
export function appendChunk(buffer: string, chunk: string): { lines: string[]; buffer: string } {
  const combined = buffer + chunk
  const lines = combined.split('\n')
  const nextBuffer = lines.pop() ?? ''
  return { lines, buffer: nextBuffer }
}

// Pure and unit-testable: parses a single `data: {...}` SSE line. Returns
// null for anything else (blank lines, garbage, non-data lines).
export function parseSsePayload(line: string): Record<string, unknown> | null {
  if (!line.startsWith('data: ')) return null
  try {
    return JSON.parse(line.slice(6)) as Record<string, unknown>
  } catch {
    return null
  }
}

export function dispatchSseLine(line: string, handlers: StreamHandlers): void {
  const data = parseSsePayload(line)
  if (!data) return

  switch (data.type) {
    case 'progress': {
      handlers.onProgress?.({
        current: Number(data.processed) || 0,
        total: Number(data.total) || 0,
        file: typeof data.current === 'string' ? data.current : '',
        percentage: Number(data.percentage) || 0,
      })
      return
    }
    case 'log': {
      if (typeof data.message === 'string') handlers.onLog?.(data.message)
      return
    }
    case 'result': {
      handlers.onResult?.(data.results)
      return
    }
    case 'complete': {
      const success = Boolean(data.success)
      const cancelled = Boolean(data.cancelled)
      handlers.onDone?.({ success, cancelled })
      if (!success && !cancelled && typeof data.error === 'string') {
        handlers.onError?.(data.error)
      }
      return
    }
    default:
      return
  }
}

function makeProcessId(prefix: string): string {
  return `${prefix}-${Date.now()}`
}

export async function streamProcess(
  path: string,
  body: Record<string, unknown>,
  handlers: StreamHandlers = {},
  signal?: AbortSignal
): Promise<StreamProcessResult> {
  const processId =
    typeof body.processId === 'string' && body.processId ? body.processId : makeProcessId('proc')
  handlers.onStart?.(processId)

  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...body, processId }),
    signal,
  })

  if (!res.ok || !res.body) {
    let message = `Request failed: ${res.status}`
    try {
      const data = (await res.json()) as { error?: string }
      if (data?.error) message = data.error
    } catch {
      // ignore
    }
    handlers.onError?.(message)
    return { processId }
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    const chunkText = decoder.decode(value, { stream: true })
    const appended = appendChunk(buffer, chunkText)
    buffer = appended.buffer
    for (const line of appended.lines) {
      dispatchSseLine(line, handlers)
    }
  }

  return { processId }
}

export function cancelProcess(processId: string): Promise<{ ok: boolean; cancelled?: boolean }> {
  return postJson('/api/cancel', { processId })
}

export function pauseProcess(processId: string): Promise<{ ok: boolean }> {
  return postJson('/api/pause', { processId })
}

export function resumeProcess(processId: string): Promise<{ ok: boolean }> {
  return postJson('/api/resume', { processId })
}

export type ProcessStatus = 'idle' | 'running' | 'paused' | 'done' | 'error'

export interface ProcessStreamState {
  status: ProcessStatus
  processId: string | null
  progress: ProgressPayload | null
  logs: string[]
  result: unknown
  error: string | null
}

const INITIAL_STATE: ProcessStreamState = {
  status: 'idle',
  processId: null,
  progress: null,
  logs: [],
  result: null,
  error: null,
}

export function useProcessStream() {
  const [state, setState] = React.useState<ProcessStreamState>(INITIAL_STATE)
  const controllerRef = React.useRef<AbortController | null>(null)

  const run = React.useCallback(async (path: string, body: Record<string, unknown> = {}) => {
    const controller = new AbortController()
    controllerRef.current = controller
    setState({ ...INITIAL_STATE, status: 'running' })

    const { processId } = await streamProcess(
      path,
      body,
      {
        onStart: (id) => setState((s) => ({ ...s, processId: id })),
        onProgress: (progress) => setState((s) => ({ ...s, progress })),
        onLog: (line) => setState((s) => ({ ...s, logs: [...s.logs, line] })),
        onResult: (result) => setState((s) => ({ ...s, result })),
        onError: (error) => setState((s) => ({ ...s, status: 'error', error })),
        onDone: ({ success, cancelled }) =>
          setState((s) => (s.status === 'error' ? s : { ...s, status: cancelled ? 'idle' : success ? 'done' : 'error' })),
      },
      controller.signal
    )
    return processId
  }, [])

  const pause = React.useCallback(async () => {
    if (!state.processId) return
    await pauseProcess(state.processId)
    setState((s) => ({ ...s, status: 'paused' }))
  }, [state.processId])

  const resume = React.useCallback(async () => {
    if (!state.processId) return
    await resumeProcess(state.processId)
    setState((s) => ({ ...s, status: 'running' }))
  }, [state.processId])

  const cancel = React.useCallback(async () => {
    if (!state.processId) return
    await cancelProcess(state.processId)
    controllerRef.current?.abort()
  }, [state.processId])

  return { state, run, pause, resume, cancel }
}
