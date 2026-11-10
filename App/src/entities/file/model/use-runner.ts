import { ref } from 'vue'
import { errorMessage } from '@/shared/lib/error'
import { toast } from '@/shared/ui'
import { preloadInterstitial, showInterstitial } from '@/shared/ads'
import { useLibrary } from './store'
import type { FileMeta } from './types'

/**
 * Shared busy/result handling for the tool screens. A finished job is a natural break, so an interstitial
 * (loaded while the user picks files) may show before the result sheet (design-note/ads-plan.md 4.4).
 */
export function useRunner() {
  void preloadInterstitial()
  const busy = ref(false)
  const progress = ref('')
  const result = ref<FileMeta[]>([])

  async function run(job: () => Promise<FileMeta[] | null>): Promise<void> {
    if (busy.value) return
    busy.value = true
    progress.value = ''
    try {
      const out = await job()
      if (out?.length) {
        await showInterstitial('tool_done')
        result.value = out
      }
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
