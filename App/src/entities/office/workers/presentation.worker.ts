import { PresentationEngine } from '../lib/presentation-engine'
import type { PresentationRequest, PresentationResponse } from '../lib/presentation-protocol'

const engine = new PresentationEngine()
let pending = Promise.resolve()
self.onmessage = (event: MessageEvent<PresentationRequest>) => {
  pending = pending.then(async () => {
    const request = event.data
    let response: PresentationResponse
    try {
      const value = request.type === 'open' ? await engine.open(request.data) : engine.slide(request.index)
      response = { id: request.id, ok: true, value }
    } catch (error) {
      const detail = error as { code?: string; reason?: string; name?: string }
      const resourceLimit = ['zip-entry-too-large', 'zip-total-too-large', 'zip-compression-ratio', 'zip-too-many-entries', 'zip-output-too-large'].includes(detail?.reason ?? '')
      response = { id: request.id, ok: false, error: error instanceof Error ? error.message : String(error),
        code: resourceLimit ? 'PRESENTATION_RESOURCE_LIMIT' : detail?.code ?? detail?.name ?? 'Error' }
    }
    self.postMessage(response)
  })
}
