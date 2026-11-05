export interface ToolDef {
  to: string
  label: string
  /** File name (without extension) in public/assets/icons/, i.e. tool-<icon>.webp */
  icon: string
}

export const TOOLS: ToolDef[] = [
  { to: '/tool/scan', label: 'Scan PDF', icon: 'scan' },
  { to: '/tool/img2pdf', label: 'Image to PDF', icon: 'img2pdf' },
  { to: '/tool/pdf2img', label: 'PDF to Image', icon: 'pdf2img' },
  { to: '/tool/doc2pdf', label: 'Word, Excel, TXT to PDF', icon: 'doc2pdf' },
  { to: '/tool/merge', label: 'Merge PDF', icon: 'merge' },
  { to: '/tool/split', label: 'Split PDF', icon: 'split' },
  { to: '/tool/lock', label: 'Lock / Unlock PDF', icon: 'lock' },
  { to: '/tool/delete', label: 'Delete files', icon: 'delete' },
]
