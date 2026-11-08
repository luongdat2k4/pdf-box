import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import * as vue from 'vue'
import * as XLSX from 'xlsx'
import { parse, compileScript } from '@vue/compiler-sfc'

function evaluate(source, imports = {}, globals = {}) {
  const exports = {}
  vm.runInNewContext(ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { exports, require: (id) => {
    if (!(id in imports)) throw new Error(`Unexpected import ${id}`)
    return imports[id]
  }, ...globals })
  return exports
}
const src = (path) => readFileSync(new URL(`../src/entities/office/${path}`, import.meta.url), 'utf8')
const model = evaluate(src('lib/spreadsheet.ts'), { xlsx: XLSX })
const { sheetLayout, gridCells, visibleRange, cellDetails, scrollAxis, parseSpreadsheet } = model

test('real XLSX round trip preserves worksheets, formatted values, merges and cached formula results', () => {
  const book = XLSX.utils.book_new()
  const sheet = XLSX.utils.aoa_to_sheet([['BÁO CÁO', null, 'Ngày'], ['Hợp đồng', 1234.5, 45658]])
  sheet.B2.z = '#,##0.00'
  sheet.C2.z = 'yyyy-mm-dd'
  sheet.D2 = { t: 'n', v: 2469, f: 'B2*2', z: '#,##0.00' }
  sheet['!ref'] = 'A1:D2'
  sheet['!merges'] = [XLSX.utils.decode_range('A1:B1')]
  XLSX.utils.book_append_sheet(book, sheet, 'Báo cáo')
  XLSX.utils.book_append_sheet(book, {}, 'Trống')
  const parsed = parseSpreadsheet(XLSX.write(book, { type: 'array', bookType: 'xlsx' }))
  assert.equal(parsed.SheetNames.join(','), 'Báo cáo,Trống')
  const layout = sheetLayout(parsed.Sheets['Báo cáo'])
  assert.equal(cellDetails(layout, 1, 1).text, '1,234.50')
  assert.equal(cellDetails(layout, 1, 2).text, '2025-01-01')
  assert.equal(cellDetails(layout, 1, 3).formula, '=B2*2')
  assert.equal(cellDetails(layout, 1, 3).text, '2,469.00')
  assert.equal(cellDetails(layout, 0, 1).address, 'A1')
  assert.equal(cellDetails(layout, 0, 1).colSpan, 2)
  assert.equal(sheetLayout(parsed.Sheets['Trống']).range, null)
})

test('two-dimensional virtualization stays bounded for a sparse million-row sheet and reaches the last cell', () => {
  const layout = sheetLayout({ '!ref': 'A1:XFD1048576', A1: { t: 's', v: 'First' }, XFD1048576: { t: 's', v: 'Last' } })
  for (const zoom of [0.5, 1, 2]) {
    const x = scrollAxis(44 + layout.offsets.at(-1) * zoom, 390, Number.MAX_SAFE_INTEGER)
    const y = scrollAxis(28 + layout.rows * 34 * zoom, 640, Number.MAX_SAFE_INTEGER)
    assert.ok(y.extent <= 8_000_000)
    const range = visibleRange(layout, x.offset, y.offset, 346, 612, zoom)
    const cells = gridCells(layout, range)
    assert.ok(cells.length < 1000, `mounted ${cells.length} cells at zoom ${zoom}`)
    assert.ok(cells.some((cell) => cell.address === 'XFD1048576' && cell.text === 'Last'))
  }
})

test('merged cells anchored above or left of the viewport render once, preserving their full size', () => {
  const layout = sheetLayout({ '!ref': 'A1:J100', A1: { t: 's', v: '<script>text only</script>' },
    '!merges': [{ s: { r: 0, c: 0 }, e: { r: 20, c: 5 } }] })
  const cells = gridCells(layout, { s: { r: 10, c: 3 }, e: { r: 15, c: 7 } })
  const merged = cells.filter((cell) => cell.address === 'A1')
  assert.equal(merged.length, 1)
  assert.equal(merged[0].rowSpan, 21)
  assert.equal(merged[0].colSpan, 6)
  assert.equal(merged[0].text, '<script>text only</script>')
  assert.equal(cells.length, 13)
})

test('column widths, column labels and blank/formula-only cells have predictable display values', () => {
  const layout = sheetLayout({ '!ref': 'A1:AB20', '!cols': [{ wpx: 200 }, { wch: 1000 }],
    B2: { t: 'n', f: 'SUM(A2:A9)' } })
  assert.equal(layout.offsets[1], 200)
  assert.equal(layout.offsets[2], 520)
  assert.equal(model.columnAt(layout.offsets, 199), 0)
  assert.equal(model.columnAt(layout.offsets, 200), 1)
  assert.equal(model.columnLabel(27), 'AB')
  assert.equal(cellDetails(layout, 0, 0).text, '')
  assert.equal(cellDetails(layout, 1, 1).formula, '=SUM(A2:A9)')
})

test('viewer switches sheets, preserves sheet position, freezes panes, zooms and selects cells with keyboard', async () => {
  const observers = []
  // Native v-model DOM directives are supplied by Vue in the app; state is driven directly in this renderer.
  const imports = { vue: { ...vue, vModelCheckbox: {}, vModelSelect: {} }, '../lib/spreadsheet': model,
    '@/shared/i18n': { t: (key) => key }, '@/shared/ui': { Ic: { render: () => vue.h('i') } } }
  const compile = (path, extra = {}) => evaluate(compileScript(parse(src(path)).descriptor,
    { id: path, inlineTemplate: true }).content, { ...imports, ...extra }, {
      requestAnimationFrame: (callback) => setTimeout(callback, 0), cancelAnimationFrame: clearTimeout,
      ResizeObserver: class {
        constructor(callback) { this.callback = callback; observers.push(this) }
        observe() {}
        disconnect() { this.disconnected = true }
      },
    }).default
  const Cells = compile('ui/SpreadsheetCells.vue')
  const Viewer = compile('ui/SpreadsheetViewer.vue', { './SpreadsheetCells.vue': { default: Cells } })
  const makeNode = (type) => ({ type, props: {}, children: [], parent: null, clientWidth: 390, clientHeight: 500,
    scrollLeft: 0, scrollTop: 0, focus() {} })
  const renderer = vue.createRenderer({
    createElement: makeNode, createText: makeNode, createComment: makeNode,
    setText: (el, value) => { el.text = value }, setElementText: (el, value) => { el.children = []; el.text = value },
    parentNode: (el) => el.parent, nextSibling: (el) => el.parent?.children[el.parent.children.indexOf(el) + 1] ?? null,
    patchProp: (el, key, _previous, value) => { el.props[key] = value },
    remove(el) { if (el.parent) el.parent.children.splice(el.parent.children.indexOf(el), 1) },
    insert(el, parent, anchor) {
      if (el.parent) el.parent.children.splice(el.parent.children.indexOf(el), 1)
      el.parent = parent
      parent.children.splice(anchor ? parent.children.indexOf(anchor) : parent.children.length, 0, el)
    },
  })
  const book = { SheetNames: ['First', 'Second', 'Hidden'], Sheets: {
    First: { '!ref': 'A1:ZZ10000', A1: { t: 's', v: 'Header' }, B1: { t: 's', v: 'Full value' } },
    Second: { '!ref': 'C4:D8', C4: { t: 's', v: 'Second sheet' } }, Hidden: {},
  }, Workbook: { Sheets: [{ name: 'Hidden', Hidden: 1 }] } }
  const root = makeNode('container')
  const app = renderer.createApp({ render: () => vue.h(Viewer, { book }) })
  app.mount(root)
  const flush = async () => { await vue.nextTick(); await vue.nextTick(); await vue.nextTick() }
  await flush()
  const all = () => {
    const nodes = []
    const visit = (el) => { nodes.push(el); el.children.forEach(visit) }
    visit(root)
    return nodes
  }
  const find = (predicate) => all().find(predicate)
  const grid = () => find((el) => el.props.role === 'grid')
  const tabs = () => all().filter((el) => el.props.role === 'tab')
  assert.equal(tabs().length, 2)
  assert.ok(all().filter((el) => el.props.role === 'gridcell').length < 200)
  await grid().props.onKeydown({ key: 'ArrowRight', preventDefault() {} })
  await flush()
  assert.ok(find((el) => el.props.role === 'gridcell' && el.props['aria-colindex'] === 2 && el.props['aria-selected']))
  const checks = all().filter((el) => el.type === 'input')
  checks[0].props['onUpdate:modelValue'](true)
  checks[1].props['onUpdate:modelValue'](true)
  await flush()
  grid().scrollLeft = 1200; grid().scrollTop = 3400
  grid().props.onScrollPassive()
  await new Promise((resolve) => setTimeout(resolve, 5)); await flush()
  const zoom = find((el) => el.type === 'select')
  zoom.props['onUpdate:modelValue'](150)
  await flush()
  assert.equal(grid().scrollTop, 5100)
  assert.ok(all().filter((el) => el.props.role === 'gridcell').length < 250)
  await tabs()[1].props.onClick()
  await flush()
  assert.equal(grid().props['aria-label'], 'Second')
  assert.ok(find((el) => el.props.role === 'gridcell' && el.props['aria-label']?.startsWith('C4:') && el.props['aria-selected']))
  await tabs()[0].props.onClick()
  await flush()
  assert.equal(grid().scrollTop, 5100)
  app.unmount()
  assert.equal(observers[0].disconnected, true)
})
