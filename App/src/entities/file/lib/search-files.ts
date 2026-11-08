import type { FileMeta } from '../model/types'

export function normalizeSearch(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[đĐ]/g, 'd').toLowerCase().trim()
}

const aliases = {
  pdf: 'pdf', word: 'word doc docx', excel: 'excel xls xlsx', ppt: 'powerpoint presentation ppt pptx',
  txt: 'text van ban txt', md: 'markdown md', image: 'image photo anh hinh',
}
const texts = new WeakMap<FileMeta, { name: string; mime: string; kind: string; text: string }>()
function textOf(file: FileMeta): string {
  const previous = texts.get(file)
  if (previous?.name === file.name && previous.mime === file.mime && previous.kind === file.kind) return previous.text
  const text = normalizeSearch(`${file.name} ${file.mime} ${aliases[file.kind]}`)
  texts.set(file, { name: file.name, mime: file.mime, kind: file.kind, text })
  return text
}

/** Yields between batches and discards cancelled work; never reads file contents to search metadata. */
export async function searchFiles(
  files: readonly FileMeta[], query: string, cancelled: () => boolean,
  yieldControl: () => Promise<void> = () => new Promise((resolve) => setTimeout(resolve, 0)),
): Promise<FileMeta[] | null> {
  const words = normalizeSearch(query).split(/\s+/).filter(Boolean)
  const matches: FileMeta[] = []
  for (let start = 0; start < files.length; start += 512) {
    if (cancelled()) return null
    const end = Math.min(files.length, start + 512)
    for (let i = start; i < end; i++) {
      const file = files[i]!
      const text = textOf(file)
      if (words.every((word) => text.includes(word))) matches.push(file)
    }
    if (end < files.length) await yieldControl()
  }
  return cancelled() ? null : matches
}
