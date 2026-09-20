import { describe, expect, it, vi } from 'vitest'
import { appendChunk, dispatchSseLine, parseSsePayload } from './api'

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
      JSON.stringify({ type: 'progress', current: 'track.mp3', processed: 3, total: 10, percentage: 30 })
    dispatchSseLine(line, { onProgress })
    expect(onProgress).toHaveBeenCalledWith({ current: 3, total: 10, file: 'track.mp3', percentage: 30 })
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

  it('reports a successful complete event via onDone', () => {
    const onDone = vi.fn()
    const onError = vi.fn()
    dispatchSseLine('data: ' + JSON.stringify({ type: 'complete', success: true, cancelled: false }), {
      onDone,
      onError,
    })
    expect(onDone).toHaveBeenCalledWith({ success: true, cancelled: false })
    expect(onError).not.toHaveBeenCalled()
  })

  it('reports a failed complete event via onDone and onError', () => {
    const onDone = vi.fn()
    const onError = vi.fn()
    dispatchSseLine(
      'data: ' + JSON.stringify({ type: 'complete', success: false, cancelled: false, error: 'boom' }),
      { onDone, onError }
    )
    expect(onDone).toHaveBeenCalledWith({ success: false, cancelled: false })
    expect(onError).toHaveBeenCalledWith('boom')
  })

  it('ignores a garbage line without throwing', () => {
    expect(() => dispatchSseLine('garbage', {})).not.toThrow()
  })
})
