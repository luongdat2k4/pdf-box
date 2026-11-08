import { parse, renderSlideToSvg, slideText, type Presentation } from '@web-ppt/core'
import type { PresentationInfo, RenderedSlide } from './presentation-protocol'
import { validatePresentationCfb } from './validate-cfb'
import { PRESENTATION_LIMITS, PresentationSafetyError } from './presentation-limits'

/** Lives in a worker. PPTX stays lazy; neither format is converted to PDF or sent to a server. */
export class PresentationEngine {
  private book: Presentation | undefined

  async open(data: ArrayBuffer): Promise<PresentationInfo> {
    this.dispose()
    validatePresentationCfb(data)
    this.book = await parse(data, { lazy: true, zip: PRESENTATION_LIMITS.zip })
    const { width, height, slides, source } = this.book
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0 || !slides.length) {
      this.dispose()
      throw new Error('EMPTY_PRESENTATION')
    }
    if (slides.length > PRESENTATION_LIMITS.maxSlides) {
      this.dispose()
      throw new PresentationSafetyError('PRESENTATION_RESOURCE_LIMIT', 'Presentation has too many slides')
    }
    return { width, height, count: slides.length, source }
  }

  slide(index: number): RenderedSlide {
    const book = this.book
    if (!book || !Number.isInteger(index) || index < 0 || index >= book.slides.length) throw new Error('INVALID_SLIDE')
    const slide = book.slides[index]!
    return {
      index,
      svg: renderSlideToSvg(book, slide, { idPrefix: `slide-${index}`, textMode: 'html', media: 'badge' }),
      text: slideText({ ...slide, notes: undefined }), notes: slide.notes ?? '',
    }
  }

  dispose() { this.book?.dispose?.(); this.book = undefined }
}
