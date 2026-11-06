import { toast } from '@/shared/ui'
import { api } from '../api/native-api'
import { openRoute } from '../lib/open-route'
import { useLibrary } from './store'

/**
 * Opens files other apps hand to us ("Open with"). The native side has already imported the file; here it is added
 * to the library list and shown in the matching viewer. `open` is called with the route to navigate to.
 * Returns an unsubscribe function.
 */
export async function openedFiles(open: (route: string) => void): Promise<() => void> {
  const lib = useLibrary()
  return api.onDocumentOpened(async (e) => {
    if (e.error) return void toast(e.error, true)
    if (!lib.loaded) await lib.load()
    const meta = e.document ? lib.adopt(e.document) : null
    if (!meta) {
      // Not a type we can show; drop the row the native side created for it.
      if (e.document) void lib.remove([e.document.id])
      return void toast(e.skipped.length ? `Unsupported: ${e.skipped.join(', ')}` : 'This file type is not supported', true)
    }
    await lib.touch(meta.id)
    open(openRoute(meta))
  })
}
