import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'

const compiled = ts.transpileModule(readFileSync(new URL('../src/entities/file/model/store.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText
const record = (id, modifiedAt = 1, extra = {}) => ({ id, displayName: `${id}.pdf`, modifiedAt, isFavorite: true, lastPage: 3, ...extra })
const idle = { hasAccess: true, initialization: 'complete', phase: 'idle', processed: 0 }
function library(overrides = {}) {
  const listeners = {}
  const api = {
    getLibraryAccess: async () => ({ hasAccess: true, prompted: true }),
    getLibrarySnapshot: async () => ({ documents: [], revision: 0 }),
    syncLibrary: async () => idle,
    scanLibrary: async () => assert.fail('normal synchronization must not request a full scan'),
    onDocumentsChanged: async cb => { listeners.changed = cb; return () => { delete listeners.changed } },
    onLibrarySyncState: async cb => { listeners.state = cb; return () => { delete listeners.state } },
    ...overrides,
  }
  const exports = {}
  const modules = {
    vue: { ref: value => ({ value }), computed: get => ({ get value() { return get() } }) },
    pinia: { defineStore: (_name, setup) => setup },
    '../api/native-api': { api },
    './types': { EXT_KIND: { pdf: 'pdf' }, kindOf: name => name.endsWith('.pdf') ? 'pdf' : null },
  }
  vm.runInNewContext(compiled, { exports, require: id => modules[id] })
  return { lib: exports.useLibrary(), listeners, api }
}
const ids = lib => Array.from(lib.items.value, item => item.id)

test('startup subscribes before reading DB, displays saved rows before native catch-up, and starts once', async () => {
  const calls = []
  const { lib } = library({
    onDocumentsChanged: async () => { calls.push('listen'); return () => {} },
    getLibrarySnapshot: async () => { calls.push('snapshot'); return { documents: [record('saved')], revision: 1 } },
    syncLibrary: async () => { calls.push('sync'); assert.equal(lib.loaded.value, true); assert.equal(lib.find('saved').lastPage, 3); return idle },
  })
  const first = lib.start()
  assert.equal(lib.start(), first)
  await first
  assert.deepEqual(calls, ['listen', 'snapshot', 'sync', 'snapshot'])
  await lib.start()
  assert.equal(calls.length, 4)
})

test('first permission prompt is independent of indexing; cancellation allows an explicit retry', async () => {
  let prompted = false
  let picks = 0
  const { lib } = library({
    getLibraryAccess: async () => ({ hasAccess: false, prompted }),
    requestLibraryAccess: async () => { prompted = true; picks++; throw Object.assign(new Error('Cancelled'), { name: 'AbortError' }) },
    syncLibrary: async () => assert.fail('no permission'),
  })
  lib.items.value = [{ id: 'keep' }]
  await lib.syncDeviceFiles()
  await lib.syncDeviceFiles()
  assert.equal(picks, 1)
  await lib.syncDeviceFiles(true)
  assert.equal(picks, 2)
  assert.deepEqual(ids(lib), ['keep'])
})

test('concurrent refresh calls share one job; failure clears busy state and allows retry', async () => {
  let release
  let started
  const ready = new Promise(resolve => { started = resolve })
  let calls = 0
  const { lib } = library({ syncLibrary: async () => {
    calls++
    if (calls === 1) await new Promise(resolve => { release = resolve; started() })
    else throw new Error('provider offline')
    return idle
  } })
  const first = lib.syncDeviceFiles()
  assert.equal(lib.syncDeviceFiles(), first)
  await ready; release(); await first
  assert.equal(calls, 1)
  await assert.rejects(lib.syncDeviceFiles(), /provider offline/)
  assert.equal(lib.scanning.value, false)
})

test('only an explicit full rescan uses scanLibrary', async () => {
  let full = 0
  const { lib } = library({ scanLibrary: async accept => { assert.equal(accept[0], 'pdf'); full++; return idle } })
  await lib.syncDeviceFiles()
  assert.equal(full, 0)
  await lib.syncDeviceFiles(true, true)
  assert.equal(full, 1)
})

test('a full rescan requested during incremental refresh runs after the shared refresh', async () => {
  let release
  let started
  const ready = new Promise(resolve => { started = resolve })
  let full = 0
  const { lib } = library({
    syncLibrary: () => new Promise(resolve => { release = resolve; started() }),
    scanLibrary: async () => { full++; return idle },
  })
  const refreshing = lib.syncDeviceFiles()
  await ready
  const rescanning = lib.syncDeviceFiles(false, true)
  release(idle)
  await refreshing
  await rescanning
  assert.equal(full, 1)
})

test('permission revocation preserves saved rows and does not request a scan', async () => {
  const { lib } = library({ getLibraryAccess: async () => ({ hasAccess: false, prompted: true }), syncLibrary: async () => assert.fail('revoked') })
  lib.items.value = [{ id: 'keep' }]
  await lib.syncDeviceFiles()
  assert.deepEqual(ids(lib), ['keep'])
  assert.equal(lib.libraryAccess.value.hasAccess, false)
})

test('batched events insert, update, remove, reorder and reject duplicate/older revisions', async () => {
  const { lib, listeners } = library({ getLibrarySnapshot: async () => ({ documents: [record('old'), record('deleted')], revision: 1 }) })
  await lib.start()
  listeners.changed({ revision: 3, removedIds: ['deleted'], upserted: [record('new', 5), record('old', 4, { isFavorite: false, lastPage: 9 })] })
  assert.deepEqual(ids(lib), ['new', 'old'])
  assert.equal(lib.find('old').lastPage, 9)
  assert.equal(lib.find('old').favorite, false)
  listeners.changed({ revision: 2, removedIds: [], upserted: [record('deleted')] })
  assert.deepEqual(ids(lib), ['new', 'old'])
  listeners.changed({ revision: 4, removedIds: [], upserted: [record('new', 5)] })
  assert.deepEqual(ids(lib), ['new', 'old'])
})

test('events arriving during an older snapshot preserve new rows, edits and deletions without losing cached rows', async () => {
  const { lib, listeners, api } = library()
  await lib.start()
  let finish
  api.getLibrarySnapshot = () => new Promise(resolve => { finish = resolve })
  const loading = lib.load()
  listeners.changed({ revision: 5, removedIds: ['gone'], upserted: [record('new', 10), record('edited', 8, { lastPage: 7 })] })
  finish({ revision: 4, documents: [record('cached'), record('gone'), record('edited')] })
  await loading
  assert.deepEqual(ids(lib), ['new', 'edited', 'cached'])
  assert.equal(lib.find('edited').lastPage, 7)
})

test('a newer DB snapshot wins over an older event received while loading', async () => {
  const { lib, listeners, api } = library()
  await lib.start()
  let finish
  api.getLibrarySnapshot = () => new Promise(resolve => { finish = resolve })
  const loading = lib.load()
  listeners.changed({ revision: 5, removedIds: [], upserted: [record('file', 1, { lastPage: 2 })] })
  finish({ revision: 6, documents: [record('file', 2, { lastPage: 8 })] })
  await loading
  assert.equal(lib.find('file').lastPage, 8)
})

test('late observer updates cannot undo a newer native mutation response', async () => {
  const { lib, listeners } = library({
    getLibrarySnapshot: async () => ({ documents: [record('file')], revision: 1 }),
    updateDocument: async () => record('file', 1, { revision: 4, isFavorite: false }),
  })
  await lib.start()
  await lib.toggleFavorite('file')
  listeners.changed({ revision: 3, removedIds: [], upserted: [record('file')] })
  assert.equal(lib.find('file').favorite, false)
})

test('a stable identity moved back into the library may reuse its ID after a removal event', async () => {
  const { lib, listeners } = library()
  await lib.start()
  listeners.changed({ revision: 1, removedIds: [], upserted: [record('file')] })
  listeners.changed({ revision: 2, removedIds: ['file'], upserted: [] })
  listeners.changed({ revision: 3, removedIds: [], upserted: [record('file', 2, { displayName: 'moved.pdf' })] })
  assert.equal(lib.find('file').name, 'moved.pdf')
  lib.stop()
  assert.equal(listeners.changed, undefined)
  assert.equal(listeners.state, undefined)
})

test('a newer snapshot may restore a moved identity after an older removal event', async () => {
  const { lib, listeners, api } = library()
  await lib.start()
  let finish
  api.getLibrarySnapshot = () => new Promise(resolve => { finish = resolve })
  const loading = lib.load()
  listeners.changed({ revision: 5, removedIds: ['file'], upserted: [] })
  finish({ revision: 6, documents: [record('file', 2, { displayName: 'moved.pdf' })] })
  await loading
  assert.equal(lib.find('file').name, 'moved.pdf')
})

test('stopping during asynchronous listener registration removes the late handle', async () => {
  let registered
  let stopped = false
  const { lib } = library({ onDocumentsChanged: () => new Promise(resolve => { registered = resolve }) })
  const starting = lib.start()
  lib.stop()
  registered(() => { stopped = true })
  await starting
  assert.equal(stopped, true)
  assert.equal(lib.loaded.value, false)
})

test('the browser adapter does not label an old pending DB read with a newer deletion revision', async () => {
  const exports = {}
  let finish
  const mock = ts.transpileModule(readFileSync(new URL('../src/entities/file/api/mock.ts', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  vm.runInNewContext(mock, { exports, require: id => ({
    '../model/types': { kindOf: () => 'pdf' },
    './db': { listMeta: () => new Promise(resolve => { finish = resolve }), removeFile: async () => {} },
  })[id] })
  const old = exports.mockApi.getLibrarySnapshot()
  const deleted = await exports.mockApi.removeDocuments(['file'])
  finish([{ id: 'file', name: 'file.pdf', kind: 'pdf', mime: 'application/pdf' }])
  const snapshot = await old
  assert.ok(snapshot.revision < deleted.revision)
})
