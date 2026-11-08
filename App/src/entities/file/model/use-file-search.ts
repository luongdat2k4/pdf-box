import { ref, shallowRef, watch, onScopeDispose, type Ref } from 'vue'
import type { FileMeta } from './types'
import { normalizeSearch, searchFiles } from '../lib/search-files'

export function useFileSearch(
  source: () => readonly FileMeta[], query: Ref<string>, revision: () => number, emptyShowsAll = false,
) {
  const results = shallowRef<readonly FileMeta[]>([])
  const searching = ref(false)
  let generation = 0
  let timer: ReturnType<typeof setTimeout> | undefined

  function schedule(delay: number) {
    const current = ++generation
    clearTimeout(timer)
    const value = query.value
    const files = source()
    if (!normalizeSearch(value)) {
      results.value = emptyShowsAll ? files : []
      searching.value = false
      return
    }
    results.value = []
    searching.value = true
    timer = setTimeout(async () => {
      const matches = await searchFiles(files, value, () => current !== generation)
      if (matches !== null) { results.value = matches; searching.value = false }
    }, delay)
  }

  watch(query, () => schedule(160), { flush: 'sync' })
  watch([source, () => source().length, revision], () => schedule(0), { immediate: true })
  onScopeDispose(() => { generation++; clearTimeout(timer) })
  return { results, searching }
}
