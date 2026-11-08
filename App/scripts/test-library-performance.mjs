import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import * as vue from 'vue'
import { parse, compileScript } from '@vue/compiler-sfc'

function evaluate(source, imports = {}, globals = {}) {
  const exports = {}
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  vm.runInNewContext(compiled, { exports, require: (id) => {
    if (!(id in imports)) throw new Error(`Unexpected import: ${id}`)
    return imports[id]
  }, setTimeout, clearTimeout, ...globals })
  return exports
}
function load(path, imports) {
  return evaluate(readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8'), imports)
}
const windowing = load('shared/lib/virtual-window.ts')
const search = load('entities/file/lib/search-files.ts')
const { useFileSearch } = load('entities/file/model/use-file-search.ts', { vue, '../lib/search-files': search })
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const file = (id, name = `Document ${id}.pdf`) => ({ id: String(id), name, kind: 'pdf', mime: 'application/pdf' })

test('virtual range stays bounded for 50,000 files, including deep scroll and shrinking lists', () => {
  for (const top of [0, 64_000, 3_200_000]) {
    const range = windowing.virtualWindow(50_000, 64, top, 640)
    assert.ok(range.end - range.start <= 20)
    assert.ok(range.start >= 0 && range.end <= 50_000)
  }
  const small = windowing.virtualWindow(3, 64, 3_200_000, 640)
  assert.equal(small.start, 0)
  assert.equal(small.end, 3)
  assert.equal(windowing.virtualWindow(0, 64, 1000, 640).end, 0)
})

test('search matches Vietnamese accents, extensions, MIME and multiple terms; renamed cache entries refresh', async () => {
  const files = [file(1, 'ĐỀ ÁN Kế toán.PDF'), { ...file(2, 'Budget.xlsx'), kind: 'excel', mime: 'application/vnd.ms-excel' }]
  const ids = async (query) => (await search.searchFiles(files, query, () => false)).map((f) => f.id).join(',')
  assert.equal(await ids('de an pdf'), '1')
  assert.equal(await ids('.xlsx'), '2')
  assert.equal(await ids('application/pdf'), '1')
  assert.equal(await ids('excel budget'), '2')
  files[0].name = 'Hợp đồng.pdf'
  assert.equal(await ids('de an'), '')
  assert.equal(await ids('hop dong'), '1')
})

test('search yields on large libraries and cancels obsolete work before processing later batches', async () => {
  const files = Array.from({ length: 50_000 }, (_, index) => file(index))
  let cancelled = false
  let yields = 0
  assert.equal(await search.searchFiles(files, 'document', () => cancelled, async () => { yields++; cancelled = true }), null)
  assert.equal(yields, 1)
  const matches = await search.searchFiles(files, '49999', () => false, async () => { yields++ })
  assert.equal(matches.length, 1)
  assert.equal(matches[0].id, '49999')
  assert.ok(yields > 90)
})

test('library indexes preserve type buckets on metadata updates and repeated imports keep one row per ID', async () => {
  const records = [
    { id: 'pdf', displayName: 'One.pdf', mimeType: 'application/pdf', isFavorite: false, addedAt: 2 },
    { id: 'sheet', displayName: 'Budget.xlsx', mimeType: 'application/vnd.ms-excel', isFavorite: false, addedAt: 1 },
  ]
  const api = {
    listDocuments: async () => records,
    updateDocument: async (id, patch) => ({ ...records.find((r) => r.id === id), ...patch }),
    importFromDevice: async () => ({ added: [records[0], records[0]], skipped: [] }),
    removeDocuments: async () => {},
  }
  const { useLibrary } = load('entities/file/model/store.ts', {
    vue, pinia: { defineStore: (_name, setup) => setup }, '../api/native-api': { api },
    './types': { EXT_KIND: { pdf: 'pdf' }, kindOf: (name) => name.endsWith('.pdf') ? 'pdf' : 'excel' },
  })
  const lib = useLibrary()
  await lib.load()
  const buckets = lib.byKind.value
  assert.equal(buckets.pdf.length, 1)
  assert.equal(buckets.excel.length, 1)
  await lib.toggleFavorite('pdf')
  assert.equal(lib.byKind.value, buckets)
  assert.equal(lib.find('pdf').favorite, true)
  assert.equal(lib.favorites.value.length, 1)
  await lib.rename('pdf', 'New name')
  assert.equal(lib.searchRevision.value, 1)
  assert.equal(lib.find('pdf').name, 'New name.pdf')
  await lib.importFromDevice()
  assert.equal(lib.items.value.length, 2)
  await lib.remove(['pdf'])
  assert.equal(lib.find('pdf'), undefined)
  assert.equal(lib.byKind.value.pdf.length, 0)
})

test('typing is debounced and results follow the latest query, rename, clear and disposal', async () => {
  const scope = vue.effectScope()
  const files = vue.ref([file(1, 'Hợp đồng.pdf'), file(2, 'Budget.pdf')])
  const query = vue.ref('')
  const revision = vue.ref(0)
  const state = scope.run(() => useFileSearch(() => files.value, query, () => revision.value))
  query.value = 'budget'
  assert.equal(state.searching.value, true)
  await wait(30)
  assert.equal(state.results.value.length, 0)
  query.value = 'hop dong'
  await wait(200)
  assert.equal(state.results.value[0].id, '1')
  files.value[0].name = 'Other.pdf'
  revision.value++
  await vue.nextTick()
  await wait(20)
  assert.equal(state.results.value.length, 0)
  query.value = 'budget'
  query.value = ''
  assert.equal(state.results.value.length, 0)
  assert.equal(state.searching.value, false)
  query.value = 'budget'
  scope.stop()
  await wait(180)
  assert.equal(state.results.value.length, 0)
})

test('the Vue component mounts only visible rows, updates on scroll/resize, and resets on a filter change', async () => {
  const observers = []
  const descriptor = parse(readFileSync(new URL('../src/shared/ui/VirtualList.vue', import.meta.url), 'utf8')).descriptor
  const component = evaluate(compileScript(descriptor, { id: 'virtual-test', inlineTemplate: true }).content,
    { vue, '@/shared/lib/virtual-window': windowing }, {
      requestAnimationFrame: (cb) => setTimeout(cb, 0), cancelAnimationFrame: clearTimeout,
      ResizeObserver: class {
        constructor(callback) { this.callback = callback; observers.push(this) }
        observe() {}
        disconnect() { this.disconnected = true }
      },
    }).default
  const node = (type) => ({ type, children: [], props: {}, parent: null, clientHeight: 640, scrollTop: 0 })
  const renderer = vue.createRenderer({
    createElement: node, createText: node, createComment: node,
    setText: (el, text) => { el.text = text },
    setElementText: (el, text) => { el.children = []; el.text = text },
    parentNode: (el) => el.parent,
    nextSibling: (el) => el.parent?.children[el.parent.children.indexOf(el) + 1] ?? null,
    patchProp: (el, key, _old, value) => { el.props[key] = value },
    remove(el) { if (el.parent) el.parent.children.splice(el.parent.children.indexOf(el), 1) },
    insert(el, parent, anchor) {
      if (el.parent) el.parent.children.splice(el.parent.children.indexOf(el), 1)
      el.parent = parent
      parent.children.splice(anchor ? parent.children.indexOf(anchor) : parent.children.length, 0, el)
    },
  })
  const items = vue.shallowRef(Array.from({ length: 50_000 }, (_, i) => file(i)))
  const resetKey = vue.ref('all')
  const container = node('container')
  const app = renderer.createApp({ render: () => vue.h(component, { items: items.value, resetKey: resetKey.value }, {
    default: ({ item }) => vue.h('div', { 'data-file': item.id }),
  }) })
  app.mount(container)
  await vue.nextTick()
  const viewport = container.children[0]
  const rows = () => viewport.children[0].children.filter((el) => el.props.role === 'listitem')
  assert.ok(rows().length <= 20)
  assert.equal(rows()[0].props['aria-posinset'], 1)
  viewport.scrollTop = 64_000
  viewport.props.onScrollPassive()
  await wait(10)
  await vue.nextTick()
  assert.ok(rows().length <= 20)
  assert.equal(rows()[0].props['aria-posinset'], 996)
  viewport.clientHeight = 320
  observers[0].callback()
  await vue.nextTick()
  assert.ok(rows().length <= 15)
  items.value = items.value.slice(0, 3)
  resetKey.value = 'pdf'
  await vue.nextTick()
  await vue.nextTick()
  assert.equal(viewport.scrollTop, 0)
  assert.equal(rows().length, 3)
  app.unmount()
  assert.equal(observers[0].disconnected, true)
})
