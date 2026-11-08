import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'

const compiled = ts.transpileModule(readFileSync(new URL('../src/entities/file/model/store.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText

function library(api) {
  const exports = {}
  const modules = {
    vue: { ref: (value) => ({ value }), computed: (get) => ({ get value() { return get() } }) },
    pinia: { defineStore: (_name, setup) => setup },
    '../api/native-api': { api },
    './types': { EXT_KIND: { pdf: 'pdf' }, kindOf: (name) => name.endsWith('.pdf') ? 'pdf' : null },
  }
  vm.runInNewContext(compiled, { exports, require: (id) => modules[id] })
  return exports.useLibrary()
}

test('first Home entry requests access then scans and loads external records', async () => {
  const calls = []
  const lib = library({
    getLibraryAccess: async () => ({ hasAccess: false, prompted: false }),
    requestLibraryAccess: async () => {
      calls.push('pick')
      return { hasAccess: true, prompted: true }
    },
    scanLibrary: async (accept) => { assert.equal(accept[0], 'pdf'); calls.push('scan') },
    listDocuments: async () => {
      calls.push('list')
      return [{ id: 'original-id', displayName: 'phone.pdf', sizeBytes: 42, isFavorite: true, lastPage: 3 }]
    },
  })
  await lib.syncDeviceFiles()
  assert.deepEqual(calls, ['pick', 'scan', 'list'])
  assert.equal(lib.items.value[0].id, 'original-id')
  assert.equal(lib.items.value[0].favorite, true)
  assert.equal(lib.items.value[0].lastPage, 3)
  assert.equal(lib.scanning.value, false)
})

test('cancelled access can be retried manually without prompting on every entry', async () => {
  let prompted = false
  let picks = 0
  const lib = library({
    getLibraryAccess: async () => ({ hasAccess: false, prompted }),
    requestLibraryAccess: async () => {
      prompted = true
      picks++
      throw Object.assign(new Error('Cancelled'), { name: 'AbortError' })
    },
    scanLibrary: async () => assert.fail('must not scan without access'),
  })
  await lib.syncDeviceFiles()
  await lib.syncDeviceFiles()
  assert.equal(picks, 1)
  await lib.syncDeviceFiles(true)
  assert.equal(picks, 2)
  assert.equal(lib.scanning.value, false)
})

test('concurrent entry and resume share one scan; failure clears busy state and permits retry', async () => {
  let scans = 0
  let release
  let started
  const scanStarted = new Promise((resolve) => { started = resolve })
  const lib = library({
    getLibraryAccess: async () => ({ hasAccess: true, prompted: true }),
    requestLibraryAccess: async () => assert.fail('must reuse persisted access'),
    scanLibrary: async () => {
      scans++
      if (scans === 1) await new Promise((resolve) => { release = resolve; started() })
      else throw new Error('provider offline')
    },
    listDocuments: async () => [],
  })
  const first = lib.syncDeviceFiles()
  assert.equal(lib.syncDeviceFiles(), first)
  await scanStarted
  release()
  await first
  assert.equal(scans, 1)
  await assert.rejects(lib.syncDeviceFiles(), /provider offline/)
  assert.equal(lib.scanning.value, false)
})

test('lost permission preserves the current library and waits for manual access', async () => {
  const lib = library({
    getLibraryAccess: async () => ({ hasAccess: false, prompted: true }),
    requestLibraryAccess: async () => assert.fail('must wait for the access button'),
    scanLibrary: async () => assert.fail('must not scan a revoked grant'),
  })
  lib.items.value = [{ id: 'keep' }]
  await lib.syncDeviceFiles()
  assert.equal(lib.items.value[0].id, 'keep')
  assert.equal(lib.libraryAccess.value.hasAccess, false)
  assert.equal(lib.scanning.value, false)
})

test('returning from system Settings without granting access never starts a scan', async () => {
  let prompted = false
  const lib = library({
    getLibraryAccess: async () => ({ hasAccess: false, prompted }),
    requestLibraryAccess: async () => {
      prompted = true
      return { hasAccess: false, prompted: true }
    },
    scanLibrary: async () => assert.fail('no grant, no scan'),
  })
  await lib.syncDeviceFiles()
  assert.equal(lib.libraryAccess.value.hasAccess, false)
  assert.equal(lib.scanning.value, false)
})
