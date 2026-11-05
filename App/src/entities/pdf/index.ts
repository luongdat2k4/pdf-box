export { PAGE_SIZES, type PageSizeKey, type PdfSource, type MarkTool, type Rect } from './model/types'
export { openPdf, probePdf, destroyDoc, PasswordRequiredError, type PDFDocumentProxy, type PDFPageProxy } from './lib/pdfjs'
export { openWithPassword, type OpenedPdf } from './lib/open-with-password'
export { canvasToBlob, renderPage, renderToCanvas, renderThumb, pdfToImages, type PdfToImageOptions } from './lib/render'
export {
  mergePdfs, extractPages, lockPdf, unlockPdf, normalizeImage, imagesToPdf, applyAnnotations,
  type Annotation, type RasterImage,
} from './lib/ops'
export { default as PdfPage } from './ui/PdfPage.vue'
export { default as PageThumb } from './ui/PageThumb.vue'
