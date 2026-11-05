import { ref } from 'vue'
import { errorMessage } from '@/shared/lib/error'
import { toast } from '@/shared/ui'
import { useLibrary } from './store'
import type { FileMeta } from './types'

/** Shared busy/result handling for the tool screens. */
export function useRunner() {
  const busy = ref(false)
  const progress = ref('')
  const result = ref<FileMeta[]>([])

  async function run(job: () => Promise<FileMeta[] | null>): Promise<void> {
    if (busy.value) return
    busy.value = true
    progress.value = ''
    try {
      const out = await job()
      if (out?.length) result.value = out
    } catch (e) {
      console.error(e)
      toast(errorMessage(e), true)
    } finally {
      busy.value = false
      progress.value = ''
    }
  }

  return { busy, progress, result, run }
}

export async function savePdf(name: string, bytes: Uint8Array): Promise<FileMeta> {
  const copy = new Uint8Array(bytes) // detach from pdf-lib's internal buffer
  return useLibrary().addBlob(name.toLowerCase().endsWith('.pdf') ? name : `${name}.pdf`, new Blob([copy], { type: 'application/pdf' }))
}
