import type { IconName } from '@/shared/config/icons'

export interface ToolDef {
  to: string
  label: string
  desc: string
  icon: IconName
  color: string
}

export const TOOLS: ToolDef[] = [
  { to: '/tool/merge', label: 'Merge PDF', desc: 'Combine files into one', icon: 'merge', color: 'bg-blue-50 text-blue-600' },
  { to: '/tool/split', label: 'Split PDF', desc: 'Extract chosen pages', icon: 'split', color: 'bg-rose-50 text-rose-500' },
  { to: '/tool/lock', label: 'Lock / Unlock', desc: 'Password-protect a PDF', icon: 'lock', color: 'bg-amber-50 text-amber-600' },
  { to: '/tool/img2pdf', label: 'Image to PDF', desc: 'Pick a page size', icon: 'images', color: 'bg-purple-50 text-purple-500' },
  { to: '/tool/pdf2img', label: 'PDF to Image', desc: 'Export pages as JPEG', icon: 'fileImage', color: 'bg-teal-50 text-teal-600' },
  { to: '/tool/doc2pdf', label: 'Doc to PDF', desc: 'Word, Excel, TXT, MD', icon: 'doc', color: 'bg-sky-50 text-sky-600' },
  { to: '/tool/scan', label: 'Scan', desc: 'Camera to PDF', icon: 'scan', color: 'bg-emerald-50 text-emerald-600' },
  { to: '/tool/delete', label: 'Delete files', desc: 'Remove from library', icon: 'trash', color: 'bg-red-50 text-red-500' },
]
