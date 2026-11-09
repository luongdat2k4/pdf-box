import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'

const compiled = ts.transpileModule(readFileSync(new URL('../src/entities/file/model/store.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText
// Deliberately reverse insertion time so sorting by addedAt fails these tests.
const record = (id, modifiedAt, lastOpenedAt = null) => ({ id, modifiedAt, addedAt: 100000 - (modifiedAt ?? 0), lastOpenedAt, displayName: `${id}.pdf`, isFavorite: true })
function library(api) {
  const exports = {}
  const modules = {
    vue: { ref: value => ({ value }), computed: get => ({ get value() { return get() } }) },
    pinia: { defineStore: (_name, setup) => setup },
    '../api/native-api': { api: { getLibrarySnapshot: async () => ({ documents: await api.listDocuments(), revision: 0 }), ...api } },
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

test('history uses last opened time while the library uses original file modification time', async () => {
  const lib = library({ listDocuments: async () => [record('old', 100, 500), record('new', 200, 300)] })
  await lib.load()
  assert.deepEqual(ids(lib.all), ['new', 'old'])
  assert.deepEqual(ids(lib.recent), ['old', 'new'])
})

test('files with unknown original dates sort last regardless of database insertion time', async () => {
  const lib = library({ listDocuments: async () => [record('unknown', null), record('dated', 200)] })
  await lib.load()
  assert.deepEqual(ids(lib.all), ['dated', 'unknown'])
  assert.equal(lib.find('unknown').modifiedAt, null)
})

test('saving changed content repositions a file using its new actual modification time', async () => {
  const lib = library({
    listDocuments: async () => [record('old', 100), record('new', 200)],
    replaceContent: async () => record('old', 300),
  })
  await lib.load()
  await lib.replaceBlob('old', new Blob(['changed']))
  assert.deepEqual(ids(lib.all), ['old', 'new'])
})

test('browser imports preserve File.lastModified independently of insertion time', async () => {
  const exports = {}
  let stored
  const mock = ts.transpileModule(readFileSync(new URL('../src/entities/file/api/mock.ts', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  vm.runInNewContext(mock, { exports, File, Date, crypto, require: id => ({
    '../model/types': { kindOf: () => 'pdf' },
    './db': { putFile: async meta => { stored = meta } },
  })[id] })
  const original = new File(['pdf'], 'original.pdf', { lastModified: 1600000000000 })
  const result = await exports.mockApi.saveOutput({ name: original.name, mimeType: original.type, data: original })
  assert.equal(result.modifiedAt, original.lastModified)
  assert.equal(stored.modifiedAt, original.lastModified)
  assert.ok(result.addedAt > original.lastModified)
})
