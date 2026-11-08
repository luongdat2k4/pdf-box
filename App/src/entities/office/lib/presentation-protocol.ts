export interface PresentationInfo {
  width: number
  height: number
  count: number
  source: 'ppt' | 'pptx'
}
export interface RenderedSlide {
  index: number
  svg: string
  text: string
  notes: string
}
export type PresentationRequest =
  | { id: number; type: 'open'; data: ArrayBuffer }
  | { id: number; type: 'slide'; index: number }
export type PresentationResponse =
  | { id: number; ok: true; value: PresentationInfo | RenderedSlide }
  | { id: number; ok: false; error: string; code: string }
