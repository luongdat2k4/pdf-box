import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'

const compiled = ts.transpileModule(readFileSync(new URL('../src/entities/file/model/store.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText

const record = (id) => ({ id, displayName: `${id}.pdf`, addedAt: 1, isFavorite: true, lastOpenedAt: 1 })
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

test('deletion waits for native success and updates all, history and favorites together', async () => {
  let finish
  const lib = library({
    listDocuments: async () => [record('deleted'), record('kept')],
    removeDocuments: () => new Promise(resolve => { finish = resolve }),
  })
  await lib.load()
  const removal = lib.remove(['deleted'])
  assert.equal(lib.all.value.length, 2)
  finish()
  await removal
  for (const view of [lib.all, lib.recent, lib.favorites]) {
    assert.equal(view.value.length, 1)
    assert.equal(view.value[0].id, 'kept')
  }
})

test('a denied deletion retains the file and reports failure', async () => {
  const lib = library({
    listDocuments: async () => [record('kept')],
    removeDocuments: async () => { throw { code: 'NO_WRITE_PERMISSION' } },
  })
  await lib.load()
  await assert.rejects(lib.remove(['kept']), error => error.code === 'NO_WRITE_PERMISSION')
  assert.equal(lib.find('kept').id, 'kept')
})

test('a partial batch failure reloads actual results instead of restoring deleted files', async () => {
  let records = [record('deleted'), record('blocked')]
  const lib = library({
    listDocuments: async () => records,
    removeDocuments: async () => {
      records = [record('blocked')]
      throw new Error('provider refused deletion')
    },
  })
  await lib.load()
  await assert.rejects(lib.remove(['deleted', 'blocked']), /provider refused/)
  assert.equal(lib.find('deleted'), undefined)
  assert.equal(lib.find('blocked').id, 'blocked')
})

test('device deletion event removes the file while any screen is open and survives a stale load', async () => {
  let listener
  let finish
  let stopped = false
  const lib = library({
    onDocumentsRemoved: async cb => { listener = cb; return () => { stopped = true } },
    listDocuments: () => new Promise(resolve => { finish = resolve }),
  })
  lib.items.value = [{ id: 'deleted' }, { id: 'kept' }]
  const stop = await lib.watchRemovals()
  const staleLoad = lib.load()
  listener(['deleted'])
  assert.equal(lib.find('deleted'), undefined)
  finish([record('deleted'), record('kept')])
  await staleLoad
  assert.equal(lib.find('deleted'), undefined)
  assert.equal(lib.find('kept').id, 'kept')
  stop()
  assert.equal(stopped, true)
})

test('a slower, older list response cannot replace a newer library snapshot', async () => {
  let finishOld
  let calls = 0
  const lib = library({
    listDocuments: () => ++calls === 1 ? new Promise(resolve => { finishOld = resolve }) : Promise.resolve([record('new')]),
  })
  const old = lib.load()
  await lib.load()
  finishOld([record('old')])
  await old
  assert.equal(lib.find('old'), undefined)
  assert.equal(lib.find('new').id, 'new')
})
