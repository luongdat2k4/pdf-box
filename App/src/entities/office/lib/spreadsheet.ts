import * as XLSX from 'xlsx'

export type SpreadsheetBook = XLSX.WorkBook
export type SheetRange = XLSX.Range
export const ROW_HEIGHT = 34
export const COLUMN_WIDTH = 120
export const ROW_HEADER = 44
export const COLUMN_HEADER = 28

/** Cap the DOM spacer to avoid browser CSS-size limits near Excel's millionth row. */
export function scrollAxis(content: number, viewport: number, physicalOffset: number) {
  const extent = Math.min(content, 8_000_000)
  const physicalMax = Math.max(0, extent - viewport)
  const logicalMax = Math.max(0, content - viewport)
  const ratio = physicalMax > 0 ? logicalMax / physicalMax : 1
  return { extent, ratio, offset: Math.min(logicalMax, Math.max(0, physicalOffset) * ratio) }
}

export interface SheetLayout {
  sheet: XLSX.WorkSheet
  range: SheetRange | null
  rows: number
  columns: number
  offsets: number[]
  merges: SheetRange[]
  mergeEnds: number[]
}
export interface GridCell {
  key: string
  row: number
  column: number
  address: string
  text: string
  formula: string
  numeric: boolean
  left: number
  top: number
  width: number
  height: number
  rowSpan: number
  colSpan: number
}

export function parseSpreadsheet(data: ArrayBuffer): SpreadsheetBook {
  return XLSX.read(data, { type: 'array', cellStyles: true, cellHTML: false, cellFormula: true, cellText: true })
}

export function sheetLayout(sheet: XLSX.WorkSheet): SheetLayout {
  const range = sheet['!ref'] ? XLSX.utils.decode_range(sheet['!ref']) : null
  const merges = (sheet['!merges'] ?? []).filter((m) => m.s.r >= 0 && m.s.c >= 0 && m.e.r >= m.s.r && m.e.c >= m.s.c)
    .slice().sort((a, b) => a.s.r - b.s.r)
  let rows = range ? range.e.r + 1 : 20
  let columns = range ? range.e.c + 1 : 8
  for (const merge of merges) { rows = Math.max(rows, merge.e.r + 1); columns = Math.max(columns, merge.e.c + 1) }
  rows = Math.min(1_048_576, Math.max(1, rows))
  columns = Math.min(16_384, Math.max(1, columns))
  const offsets = [0]
  for (let c = 0; c < columns; c++) {
    const info = sheet['!cols']?.[c]
    const width = info?.wpx ?? (info?.wch != null ? info.wch * 7 + 12 : COLUMN_WIDTH)
    offsets.push(offsets[c]! + Math.max(64, Math.min(320, width)))
  }
  let maxEnd = -1
  const mergeEnds = merges.map((m) => (maxEnd = Math.max(maxEnd, m.e.r)))
  return { sheet, range, rows, columns, offsets, merges, mergeEnds }
}

/** First column containing this pixel offset; logarithmic even for sheets with thousands of columns. */
export function columnAt(offsets: number[], pixel: number): number {
  let low = 0
  let high = offsets.length - 2
  while (low < high) {
    const mid = Math.floor((low + high) / 2)
    if (offsets[mid + 1]! <= pixel) low = mid + 1
    else high = mid
  }
  return low
}

export function visibleRange(layout: SheetLayout, left: number, top: number, width: number, height: number, zoom: number): SheetRange {
  return {
    s: { r: Math.max(0, Math.floor(top / (ROW_HEIGHT * zoom)) - 2), c: Math.max(0, columnAt(layout.offsets, left / zoom) - 1) },
    e: { r: Math.min(layout.rows - 1, Math.ceil((top + height) / (ROW_HEIGHT * zoom)) + 2),
      c: Math.min(layout.columns - 1, columnAt(layout.offsets, (left + width) / zoom) + 1) },
  }
}

/** Query a row interval using prefix maxima so merges starting above the viewport are still included. */
function intersectingMerges(layout: SheetLayout, range: SheetRange): SheetRange[] {
  let low = 0
  let high = layout.merges.length
  while (low < high) {
    const mid = Math.floor((low + high) / 2)
    if (layout.merges[mid]!.s.r <= range.e.r) low = mid + 1
    else high = mid
  }
  const found: SheetRange[] = []
  for (let i = low - 1; i >= 0 && layout.mergeEnds[i]! >= range.s.r; i--) {
    const merge = layout.merges[i]!
    if (merge.e.r >= range.s.r && merge.e.c >= range.s.c && merge.s.c <= range.e.c) found.push(merge)
  }
  return found
}

export function cellDetails(layout: SheetLayout, row: number, column: number): GridCell {
  const merge = intersectingMerges(layout, { s: { r: row, c: column }, e: { r: row, c: column } })[0]
  return makeCell(layout, row, column, merge)
}

function makeCell(layout: SheetLayout, row: number, column: number, merge?: SheetRange): GridCell {
  const r = merge?.s.r ?? row
  const c = merge?.s.c ?? column
  const endRow = Math.min(layout.rows - 1, merge?.e.r ?? r)
  const endColumn = Math.min(layout.columns - 1, merge?.e.c ?? c)
  const address = XLSX.utils.encode_cell({ r, c })
  const cell = layout.sheet[address] as XLSX.CellObject | undefined
  return {
    key: address, row: r, column: c, address,
    text: cell ? cell.w ?? XLSX.utils.format_cell(cell) : '', formula: cell?.f ? `=${cell.f}` : '',
    numeric: cell?.t === 'n', left: layout.offsets[c]!, top: r * ROW_HEIGHT,
    width: layout.offsets[endColumn + 1]! - layout.offsets[c]!, height: (endRow - r + 1) * ROW_HEIGHT,
    rowSpan: endRow - r + 1, colSpan: endColumn - c + 1,
  }
}

/** Produces only visible cells, with one anchor per merged range rather than one element per covered cell. */
export function gridCells(layout: SheetLayout, range: SheetRange): GridCell[] {
  const merges = intersectingMerges(layout, range)
  const cells: GridCell[] = []
  const seen = new Set<string>()
  for (let r = range.s.r; r <= range.e.r; r++) {
    for (let c = range.s.c; c <= range.e.c; c++) {
      const merge = merges.find((m) => r >= m.s.r && r <= m.e.r && c >= m.s.c && c <= m.e.c)
      const row = merge?.s.r ?? r
      const column = merge?.s.c ?? c
      const key = `${row}:${column}`
      if (seen.has(key)) continue
      seen.add(key)
      cells.push(makeCell(layout, row, column, merge))
    }
  }
  return cells
}

export const columnLabel = XLSX.utils.encode_col
