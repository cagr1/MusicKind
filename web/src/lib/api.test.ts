import { act, createElement, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  appendChunk,
  dispatchSseLine,
  parseSsePayload,
  streamProcess,
  useProcessStream,
} from './api'

afterEach(() => vi.unstubAllGlobals())

describe('appendChunk', () => {
  it('buffers a line split across two chunks', () => {
    const first = appendChunk('', 'data: {"type":"log","mess')
    expect(first.lines).toEqual([])
    expect(first.buffer).toBe('data: {"type":"log","mess')

    const second = appendChunk(first.buffer, 'age":"hola"}\n')
    expect(second.lines).toEqual(['data: {"type":"log","message":"hola"}'])
    expect(second.buffer).toBe('')
  })

  it('returns multiple complete lines from a single chunk', () => {
    const { lines, buffer } = appendChunk('', 'data: {"a":1}\ndata: {"a":2}\n')
    expect(lines).toEqual(['data: {"a":1}', 'data: {"a":2}'])
    expect(buffer).toBe('')
  })
})

describe('parseSsePayload', () => {
  it('parses a [PROGRESS:X/Y] Processing: name progress line', () => {
    const line =
      'data: ' +
      JSON.stringify({
        type: 'progress',
        current: 'track.mp3',
        processed: 3,
        total: 10,
        percentage: 30,
        message: '(3/10) track.mp3',
      })
    const data = parseSsePayload(line)
    expect(data).toMatchObject({ type: 'progress', processed: 3, total: 10, current: 'track.mp3' })
  })

  it('parses a result event', () => {
    const line = 'data: ' + JSON.stringify({ type: 'result', results: [{ file: 'a.mp3' }] })
    const data = parseSsePayload(line)
    expect(data).toMatchObject({ type: 'result', results: [{ file: 'a.mp3' }] })
  })

  it('returns null for a garbage line', () => {
    expect(parseSsePayload('not an sse line')).toBeNull()
    expect(parseSsePayload('data: {not json')).toBeNull()
    expect(parseSsePayload('')).toBeNull()
  })
})

describe('dispatchSseLine', () => {
  it('maps a progress event to onProgress({current,total,file})', () => {
    const onProgress = vi.fn()
    const line =
      'data: ' +
      JSON.stringify({
        type: 'progress',
        current: 'track.mp3',
        processed: 3,
        total: 10,
        percentage: 30,
      })
    dispatchSseLine(line, { onProgress })
    expect(onProgress).toHaveBeenCalledWith({
      current: 3,
      total: 10,
      file: 'track.mp3',
      percentage: 30,
    })
  })

  it('forwards log lines', () => {
    const onLog = vi.fn()
    dispatchSseLine('data: ' + JSON.stringify({ type: 'log', message: 'hola' }), { onLog })
    expect(onLog).toHaveBeenCalledWith('hola')
  })

  it('forwards a result event', () => {
    const onResult = vi.fn()
    dispatchSseLine('data: ' + JSON.stringify({ type: 'result', results: [1, 2, 3] }), { onResult })
    expect(onResult).toHaveBeenCalledWith([1, 2, 3])
  })

  it('forwards result payloads without a results property', () => {
    const onResult = vi.fn()
    const event = { type: 'result', manifestPath: '/out/manifest.json' }
    dispatchSseLine('data: ' + JSON.stringify(event), { onResult })
    expect(onResult).toHaveBeenCalledWith(event)
  })

  it('reports a successful complete event via onDone', () => {
    const onDone = vi.fn()
    const onError = vi.fn()
    dispatchSseLine(
      'data: ' + JSON.stringify({ type: 'complete', success: true, cancelled: false }),
      {
        onDone,
        onError,
      },
    )
    expect(onDone).toHaveBeenCalledWith({ success: true, cancelled: false })
    expect(onError).not.toHaveBeenCalled()
  })

  it('reports a failed complete event via onDone and onError', () => {
    const onDone = vi.fn()
    const onError = vi.fn()
    dispatchSseLine(
      'data: ' +
        JSON.stringify({ type: 'complete', success: false, cancelled: false, error: 'boom' }),
      { onDone, onError },
    )
    expect(onDone).toHaveBeenCalledWith({ success: false, cancelled: false })
    expect(onError).toHaveBeenCalledWith('boom')
  })

  it('ignores a garbage line without throwing', () => {
    expect(() => dispatchSseLine('garbage', {})).not.toThrow()
  })
})

function sseResponse(lines: string[]) {
  const encoder = new TextEncoder()
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(lines.join('')))
      controller.close()
    },
  })
  return new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } })
}

describe('streamProcess', () => {
  it('flushes a final partial line and uses a UUID process id', async () => {
    const onStart = vi.fn()
    const onDone = vi.fn()
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          sseResponse([
            'data: {"type":"progress","processed":1,"total":1,"current":"song.mp3","message":"song"}\n',
            'data: {"type":"complete","success":true,"cancelled":false}',
          ]),
        ),
    )
    await streamProcess('/api/test', {}, { onStart, onDone })
    expect(onStart).toHaveBeenCalledWith(expect.stringMatching(/^[0-9a-f-]{36}$/))
    expect(onDone).toHaveBeenCalledOnce()
  })

  it('reports fetch failures through the error callback', async () => {
    const onError = vi.fn()
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    await streamProcess('/api/test', {}, { onError })
    expect(onError).toHaveBeenCalledWith('offline')
  })

  it('uses the JSON error message for a non-200 response', async () => {
    const onError = vi.fn()
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: 'No se pudo analizar' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    )

    await streamProcess('/api/test', {}, { onError })

    expect(onError).toHaveBeenCalledWith('No se pudo analizar')
  })
})

describe('useProcessStream', () => {
  it('exposes the terminal state after a simulated stream', async () => {
    const controls: {
      run?: ReturnType<typeof useProcessStream>['run']
      state?: ReturnType<typeof useProcessStream>['state']
    } = {}
    function Harness() {
      const value = useProcessStream()
      controls.run = value.run
      controls.state = value.state
      return null
    }
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          sseResponse(['data: {"type":"complete","success":true,"cancelled":false}\n']),
        ),
    )
    const root = createRoot(document.createElement('div'))
    await act(async () => {
      root.render(createElement(Harness))
    })
    await act(async () => {
      await controls.run?.('/api/test')
    })
    expect(controls.state?.status).toBe('done')
    root.unmount()
  })

  it('posts cancel and returns to idle after a cancelled completion', async () => {
    const controls: {
      run?: ReturnType<typeof useProcessStream>['run']
      cancel?: ReturnType<typeof useProcessStream>['cancel']
      state?: ReturnType<typeof useProcessStream>['state']
    } = {}
    let streamController: ReadableStreamDefaultController<Uint8Array> | undefined
    const encoder = new TextEncoder()
    const fetchMock = vi.fn((path: string) => {
      if (path === '/api/cancel') {
        return Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 }))
      }
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          streamController = controller
        },
      })
      return Promise.resolve(
        new Response(body, {
          status: 200,
          headers: { 'Content-Type': 'text/event-stream' },
        }),
      )
    })

    function Harness() {
      const value = useProcessStream()
      controls.run = value.run
      controls.cancel = value.cancel
      controls.state = value.state
      return null
    }

    vi.stubGlobal('fetch', fetchMock)
    const root = createRoot(document.createElement('div'))
    await act(async () => {
      root.render(createElement(Harness))
    })
    let runPromise: Promise<string> | undefined
    await act(async () => {
      runPromise = controls.run?.('/api/test')
      await Promise.resolve()
    })
    await act(async () => {
      await controls.cancel?.()
      streamController?.enqueue(
        encoder.encode('data: {"type":"complete","success":false,"cancelled":true}\n'),
      )
      streamController?.close()
      await runPromise
    })

    expect(fetchMock).toHaveBeenCalledWith('/api/cancel', expect.anything())
    expect(controls.state?.status).toBe('idle')
    root.unmount()
  })

  it('aborts the stream when the hook unmounts', async () => {
    let signal: AbortSignal | undefined
    vi.stubGlobal(
      'fetch',
      vi.fn((_path: string, options?: RequestInit) => {
        signal = options?.signal ?? undefined
        return new Promise<Response>(() => undefined)
      }),
    )

    function Harness() {
      const { run } = useProcessStream()
      useEffect(() => {
        void run('/api/test')
      }, [run])
      return null
    }

    const root = createRoot(document.createElement('div'))
    await act(async () => {
      root.render(createElement(Harness))
      await Promise.resolve()
    })
    root.unmount()

    expect(signal?.aborted).toBe(true)
  })
})
