import { ref, type ShallowRef } from 'vue'
import {
  applyAnnotations, destroyDoc, openWithPassword,
  type Annotation, type MarkTool, type PDFDocumentProxy, type PdfSource,
} from '@/entities/pdf'
import { useLibrary } from '@/entities/file'
import { toast } from '@/shared/ui'
import { errorMessage } from '@/shared/lib/error'

export const MARK_COLORS = ['#ffd400', '#3ddc84', '#ff4d4f', '#2d75ed', '#1d1d1d'] as const

interface Options {
  doc: ShallowRef<PDFDocumentProxy | null>
  source: ShallowRef<PdfSource | null>
  file: () => { id: string; name: string } | undefined
}

/** Annotation session for the open document: drawing state, undo/redo and saving into the file. */
export function useAnnotations({ doc, source, file }: Options) {
  const lib = useLibrary()
  const editing = ref(false)
  const tool = ref<MarkTool>('hand')
  const color = ref<string>(MARK_COLORS[0])
  const annots = ref<Annotation[]>([])
  const undone = ref<Annotation[]>([])
  const dirty = ref(false)
  const saving = ref(false)

  const annotsFor = (page: number) => annots.value.filter((a) => a.page === page - 1)

  function add(a: Annotation) {
    annots.value.push(a)
    undone.value = []
    dirty.value = true
  }
  function undo() {
    const a = annots.value.pop()
    if (a) undone.value.push(a)
  }
  function redo() {
    const a = undone.value.pop()
    if (a) annots.value.push(a)
  }
  function toggle() {
    editing.value = !editing.value
    tool.value = editing.value ? 'highlight' : 'hand'
  }

  async function save() {
    const src = source.value
    const f = file()
    if (!src || !f || !annots.value.length) return
    saving.value = true
    try {
      const out = await applyAnnotations(src, annots.value)
      await lib.replaceBlob(f.id, new Blob([new Uint8Array(out)], { type: 'application/pdf' }))
      // Reload from the saved bytes so the burned-in marks are rendered by pdf.js and no longer editable.
      const opened = await openWithPassword(await lib.bytesOf(f.id), f.name, src.password)
      if (opened) {
        const old = doc.value
        doc.value = opened.doc
        source.value = opened.source
        void destroyDoc(old)
      }
      annots.value = []
      undone.value = []
      dirty.value = false
      toast('Saved')
    } catch (e) {
      toast(errorMessage(e), true)
    } finally {
      saving.value = false
    }
  }

  return { editing, tool, color, annots, undone, dirty, saving, annotsFor, add, undo, redo, toggle, save }
}
