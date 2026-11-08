/** Mobile budgets, checked before loading and again inside the worker. */
export const PRESENTATION_LIMITS = Object.freeze({
  maxFileBytes: 32 * 1024 * 1024,
  maxCfbDirectoryEntries: 4096,
  maxCfbStreamBytes: 64 * 1024 * 1024,
  maxSlides: 5000,
  openTimeoutMs: 20_000,
  slideTimeoutMs: 8_000,
  zip: { maxEntries: 4096, maxEntryBytes: 16 * 1024 * 1024, maxTotalBytes: 64 * 1024 * 1024, maxCompressionRatio: 200 },
})

export class PresentationSafetyError extends Error {
  constructor(readonly code: 'PRESENTATION_FILE_TOO_LARGE' | 'PRESENTATION_INVALID_CFB' | 'PRESENTATION_RESOURCE_LIMIT' | 'PRESENTATION_TIMEOUT', message: string) {
    super(message)
    this.name = 'PresentationSafetyError'
  }
}

export function assertPresentationSize(bytes: number) {
  if (!Number.isSafeInteger(bytes) || bytes < 0 || bytes > PRESENTATION_LIMITS.maxFileBytes) {
    throw new PresentationSafetyError('PRESENTATION_FILE_TOO_LARGE', 'Presentation exceeds the 32 MiB input limit')
  }
}
