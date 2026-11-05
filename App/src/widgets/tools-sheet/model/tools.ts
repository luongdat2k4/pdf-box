import type { IconName } from '@/shared/config/icons'

export interface ToolDef {
  to: string
  label: string
  icon: IconName
  /** Tailwind text colour of the icon. */
  color: string
}

export const TOOLS: ToolDef[] = [
  { to: '/tool/scan', label: 'Scan PDF', icon: 'scan', color: 'text-emerald-500' },
  { to: '/tool/img2pdf', label: 'Image to PDF', icon: 'images', color: 'text-violet-500' },
  { to: '/tool/pdf2img', label: 'PDF to Image', icon: 'fileImage', color: 'text-teal-500' },
  { to: '/tool/doc2pdf', label: 'Word, Excel, TXT to PDF', icon: 'doc', color: 'text-sky-500' },
  { to: '/tool/merge', label: 'Merge PDF', icon: 'merge', color: 'text-primary' },
  { to: '/tool/split', label: 'Split PDF', icon: 'split', color: 'text-rose-500' },
  { to: '/tool/lock', label: 'Lock / Unlock PDF', icon: 'lock', color: 'text-amber-500' },
  { to: '/tool/delete', label: 'Delete files', icon: 'trash', color: 'text-red-500' },
]
