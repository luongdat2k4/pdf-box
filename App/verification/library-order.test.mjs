import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'

const compiled = ts.transpileModule(readFileSync(new URL('../src/entities/file/model/store.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText
const record = (id, addedAt, lastOpenedAt = null) => ({ id, addedAt, lastOpenedAt, displayName: `${id}.pdf`, isFavorite: true })
function library(api) {
  const exports = {}
  const modules = {
    vue: { ref: value => ({ value }), computed: get => ({ get value() { return get() } }) },
    pinia: { defineStore: (_name, setup) => setup },
    '../api/native-api': { api },
    './types': { EXT_KIND: { pdf: 'pdf' }, kindOf: name => name.endsWith('.pdf') ? 'pdf' : null },
  }
  vm.runInNewContext(compiled, { exports, require: id => modules[id] })
  return exports.useLibrary()
}
const ids = view => Array.from(view.value, file => file.id)

test('unordered imports and repeated imports keep all library lists newest first', async () => {
  const lib = library({
    listDocuments: async () => [record('middle', 200), record('new', 400)],
    importFromDevice: async () => ({ added: [record('old', 100), record('recent', 300), record('middle', 200)], skipped: [] }),
  })
  await lib.load()
  assert.deepEqual(ids(lib.all), ['new', 'middle'])
  await lib.importFromDevice()
  for (const view of [lib.all, lib.favorites, lib.pdfs]) {
    assert.deepEqual(ids(view), ['new', 'recent', 'middle', 'old'])
  }
  await lib.importFromDevice()
  assert.deepEqual(ids(lib.all), ['new', 'recent', 'middle', 'old'])
})

test('files received from another app and delayed saves are inserted at their chronological position', async () => {
  const lib = library({
    listDocuments: async () => [record('new', 400), record('old', 100)],
    saveOutput: async () => record('saved', 200),
  })
  await lib.load()
  lib.adopt(record('opened', 300))
  await lib.addBlob('saved.pdf', new Blob(['pdf']))
  assert.deepEqual(ids(lib.all), ['new', 'opened', 'saved', 'old'])
})

test('history uses last opened time while the library uses time added', async () => {
  const lib = library({ listDocuments: async () => [record('old', 100, 500), record('new', 200, 300)] })
  await lib.load()
  assert.deepEqual(ids(lib.all), ['new', 'old'])
  assert.deepEqual(ids(lib.recent), ['old', 'new'])
})
