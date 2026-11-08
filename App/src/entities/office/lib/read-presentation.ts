import { createSlideCache } from './slide-cache'
import type { PresentationInfo, PresentationRequest, PresentationResponse, RenderedSlide } from './presentation-protocol'
import { assertPresentationSize, PRESENTATION_LIMITS, PresentationSafetyError } from './presentation-limits'

export interface PresentationSession extends PresentationInfo {
  slide(index: number, signal?: AbortSignal, priority?: boolean): Promise<RenderedSlide>
  dispose(): void
}

export async function readPresentation(blob: Blob, signal?: AbortSignal): Promise<PresentationSession> {
  signal?.throwIfAborted()
  assertPresentationSize(blob.size)
  const data = await blob.arrayBuffer()
  signal?.throwIfAborted()
  assertPresentationSize(data.byteLength)
  // Keep the worker alive: it owns the parsed deck and embedded image/font blob URLs.
  const worker = new Worker(new URL('../workers/presentation.worker.ts', import.meta.url), { type: 'module' })
  let sequence = 0
  let closed = false
  const calls = new Map<number, { resolve(value: PresentationInfo | RenderedSlide): void; reject(error: unknown): void; timer: ReturnType<typeof setTimeout> }>()
  const cache = createSlideCache((index) => request({ type: 'slide', index }) as Promise<RenderedSlide>)
  const dispose = (error: unknown = new DOMException('Cancelled', 'AbortError')) => {
    if (closed) return
    closed = true
    cache.dispose(error); worker.terminate(); signal?.removeEventListener('abort', onAbort)
    for (const call of calls.values()) { clearTimeout(call.timer); call.reject(error) }
    calls.clear()
  }
  const onAbort = () => dispose()
  signal?.addEventListener('abort', onAbort, { once: true })
  worker.onmessage = (event: MessageEvent<PresentationResponse>) => {
    const response = event.data
    const call = calls.get(response.id)
    if (!call) return
    calls.delete(response.id)
    clearTimeout(call.timer)
    if (response.ok) call.resolve(response.value)
    else call.reject(Object.assign(new Error(response.error), { code: response.code }))
  }
  worker.onerror = () => dispose(new Error('PRESENTATION_WORKER_ERROR'))
  worker.onmessageerror = () => dispose(new Error('PRESENTATION_WORKER_ERROR'))

  function request(command: { type: 'open'; data: ArrayBuffer } | { type: 'slide'; index: number }) {
    if (closed) return Promise.reject(new DOMException('Cancelled', 'AbortError'))
    const id = ++sequence
    return new Promise<PresentationInfo | RenderedSlide>((resolve, reject) => {
      const timer = setTimeout(() => {
        if (calls.has(id)) dispose(new PresentationSafetyError('PRESENTATION_TIMEOUT', 'Presentation worker timed out'))
      }, command.type === 'open' ? PRESENTATION_LIMITS.openTimeoutMs : PRESENTATION_LIMITS.slideTimeoutMs)
      calls.set(id, { resolve, reject, timer })
      const message: PresentationRequest = { id, ...command }
      try { worker.postMessage(message, command.type === 'open' ? [command.data] : []) }
      catch (error) { clearTimeout(timer); calls.delete(id); reject(error) }
    })
  }
  try {
    const info = await request({ type: 'open', data }) as PresentationInfo
    signal?.throwIfAborted()
    return { ...info, slide: cache.get, dispose: () => dispose() }
  } catch (error) { dispose(error); throw error }
}
