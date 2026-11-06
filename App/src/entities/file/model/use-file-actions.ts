import { askConfirm, askText, toast } from '@/shared/ui'
import { errorMessage } from '@/shared/lib/error'
import { api } from '../api/native-api'
import { useLibrary } from './store'
import type { FileMeta } from './types'

/** User-level actions on a library file; every one reports its own success/failure toast. */
export function useFileActions() {
  const lib = useLibrary()

  async function share(f: FileMeta): Promise<void> {
    try {
      await api.shareDocument(f.id)
    } catch (e) {
      // Dismissing the share sheet is not an error.
      if ((e as Error).name !== 'AbortError') toast(errorMessage(e), true)
    }
  }

  async function saveCopy(f: FileMeta): Promise<void> {
    try {
      toast(`Saved: ${(await api.exportDocument(f.id)).where}`)
    } catch (e) {
      if ((e as Error).name !== 'AbortError') toast(errorMessage(e), true)
    }
  }

  async function rename(f: FileMeta): Promise<void> {
    const base = f.name.includes('.') ? f.name.slice(0, f.name.lastIndexOf('.')) : f.name
    const name = (await askText('Rename file', 'File name', base, 'Rename'))?.trim()
    if (name) await lib.rename(f.id, name)
  }

  async function remove(f: FileMeta): Promise<boolean> {
    const ok = await askConfirm('Delete file?', `"${f.name}" will be permanently removed from the library.`, 'Delete', true)
    if (ok) {
      await lib.remove([f.id])
      toast('Deleted')
    }
    return ok
  }

  return { share, saveCopy, rename, remove }
}
