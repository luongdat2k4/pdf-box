import { registerPlugin } from '@capacitor/core'

export interface PreviewBounds { x: number; y: number; width: number; height: number; viewportWidth: number }
export const ScanCamera = registerPlugin<{
  start(bounds: PreviewBounds): Promise<void>
  resize(bounds: PreviewBounds): Promise<void>
  capture(): Promise<{ base64: string }>
  stop(): Promise<void>
  openSettings(): Promise<void>
}>('ScanCamera')
