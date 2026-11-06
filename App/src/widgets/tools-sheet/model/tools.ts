import type { MessageKey } from '@/shared/i18n'

export interface ToolDef {
  to: string
  label: MessageKey
  /** File name (without extension) in public/assets/icons/, i.e. tool-<icon>.webp */
  icon: string
}

export const TOOLS: ToolDef[] = [
  { to: '/tool/scan', label: 'tool.scan', icon: 'scan' },
  { to: '/tool/img2pdf', label: 'tool.img2pdf', icon: 'img2pdf' },
  { to: '/tool/pdf2img', label: 'tool.pdf2img', icon: 'pdf2img' },
  { to: '/tool/doc2pdf', label: 'tool.doc2pdf', icon: 'doc2pdf' },
  { to: '/tool/merge', label: 'tool.merge', icon: 'merge' },
  { to: '/tool/split', label: 'tool.split', icon: 'split' },
  { to: '/tool/lock', label: 'tool.lock', icon: 'lock' },
  { to: '/tool/delete', label: 'tool.delete', icon: 'delete' },
]
