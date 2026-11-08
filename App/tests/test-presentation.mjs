import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { Worker as NodeWorker } from 'node:worker_threads'
import vm from 'node:vm'
import ts from 'typescript'
import * as core from '@web-ppt/core'
import * as vue from 'vue'
import { zipSync } from 'fflate'
import { parse, compileScript } from '@vue/compiler-sfc'

const source = (path) => readFileSync(new URL(`../src/entities/office/${path}`, import.meta.url), 'utf8')
const compiled = (text) => ts.transpileModule(text, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText
function evaluate(text, imports = {}, globals = {}) {
  const exports = {}
  vm.runInNewContext(compiled(text), { exports, require: (id) => {
    if (!(id in imports)) throw new Error(`Unexpected import ${id}`)
    return imports[id]
  }, DOMException, AbortController, setTimeout, clearTimeout, URL, ...globals })
  return exports
}
const cacheModule = evaluate(source('lib/slide-cache.ts'))
const limitsModule = evaluate(source('lib/presentation-limits.ts'))
const cfbModule = evaluate(source('lib/validate-cfb.ts'), { './presentation-limits': limitsModule })
const { slideDocument } = evaluate(source('lib/slide-document.ts'))
const { PresentationEngine } = evaluate(source('lib/presentation-engine.ts'), {
  '@web-ppt/core': core, './validate-cfb': cfbModule, './presentation-limits': limitsModule,
})
const bytes = (name) => {
  const buffer = readFileSync(new URL(`fixtures/powerpoint/${name}`, import.meta.url))
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
}
const slide = (index, size = 16) => ({ index, svg: `<svg><text>Slide ${index + 1}</text>${' '.repeat(size)}</svg>`, text: `Slide ${index + 1}`, notes: 'Notes' })

test('binary PPT and PPTX are parsed and rendered directly, including every slide and embedded PPT images', async () => {
  for (const [name, source, count] of [['sample.ppt', 'ppt', 2], ['sample.pptx', 'pptx', 3], ['showcase.ppt', 'ppt', 7]]) {
    const engine = new PresentationEngine()
    const info = await engine.open(bytes(name))
    assert.equal(info.source, source)
    assert.equal(info.count, count)
    assert.ok(info.width > 0 && info.height > 0)
    let imageCount = 0
    for (let index = 0; index < count; index++) {
      const value = engine.slide(index)
      assert.match(value.svg, /^<svg/)
      assert.equal(value.index, index)
      assert.ok(value.text.length)
      imageCount += (value.svg.match(/<image /g) ?? []).length
    }
    if (name === 'showcase.ppt') assert.ok(imageCount >= 2)
    assert.throws(() => engine.slide(count), /INVALID_SLIDE/)
    engine.dispose()
    assert.throws(() => engine.slide(0), /INVALID_SLIDE/)
  }
})

test('password-protected and damaged inputs fail clearly without preventing a later valid open', async () => {
  const engine = new PresentationEngine()
  await assert.rejects(engine.open(bytes('encrypted.ppt')), (error) => error.name === 'PasswordRequiredError')
  await assert.rejects(engine.open(new ArrayBuffer(10)))
  assert.equal((await engine.open(bytes('sample.ppt'))).count, 2)
  engine.dispose()
})

// Run the actual production worker handler in a real Node worker, adapting only the browser message API.
const workerSource = `(async () => {
  const { parentPort } = await import('node:worker_threads');
  const core = await import(${JSON.stringify(import.meta.resolve('@web-ppt/core'))});
  const OriginalUint8Array = globalThis.Uint8Array;
  globalThis.Uint8Array = new Proxy(OriginalUint8Array, { construct(target, args) {
    if (typeof args[0] === 'number' && args[0] > 32 * 1024 * 1024) throw new Error('AUDIT_BLOCKED_LARGE_ALLOCATION');
    return Reflect.construct(target, args);
  } });
  const limitsExports = {};
  new Function('exports', ${JSON.stringify(compiled(source('lib/presentation-limits.ts')))})(limitsExports);
  const cfbExports = {};
  new Function('exports', 'require', ${JSON.stringify(compiled(source('lib/validate-cfb.ts')))})(cfbExports, () => limitsExports);
  const engineExports = {};
  new Function('exports', 'require', ${JSON.stringify(compiled(source('lib/presentation-engine.ts')))})(engineExports,
    (id) => id === '@web-ppt/core' ? core : id === './validate-cfb' ? cfbExports : limitsExports);
  const self = { postMessage: (value) => parentPort.postMessage(value) };
  new Function('exports', 'require', 'self', ${JSON.stringify(compiled(source('workers/presentation.worker.ts')))} )({}, () => engineExports, self);
  parentPort.on('message', (data) => self.onmessage({ data }));
})().catch((error) => { throw error });`

test('the worker/session pipeline opens both formats off-thread, caches slide requests and terminates on close/abort', async () => {
  const workers = []
  class BrowserWorker {
    constructor() {
      this.worker = new NodeWorker(workerSource, { eval: true })
      this.worker.on('message', (data) => this.onmessage?.({ data }))
      this.worker.on('error', (error) => this.onerror?.(error))
      this.messages = []
      workers.push(this)
    }
    postMessage(message, transfer) { this.messages.push(message); this.worker.postMessage(message, transfer) }
    terminate() { this.terminated = true; void this.worker.terminate() }
  }
  const { readPresentation } = evaluate(source('lib/read-presentation.ts').replaceAll('import.meta.url', "'file:///presentation-test'"),
    { './slide-cache': cacheModule, './presentation-limits': limitsModule }, { Worker: BrowserWorker })
  for (const name of ['sample.ppt', 'sample.pptx']) {
    const controller = new AbortController()
    const session = await readPresentation(new Blob([bytes(name)]), controller.signal)
    try {
      const first = await session.slide(0)
      assert.match(first.svg, /^<svg/)
      await session.slide(0)
      assert.equal(workers.at(-1).messages.filter((m) => m.type === 'slide').length, 1)
      controller.abort()
      assert.equal(workers.at(-1).terminated, true)
      await assert.rejects(session.slide(1), (error) => error.name === 'AbortError')
    } finally { session.dispose() }
  }
  const controller = new AbortController()
  const opening = readPresentation(new Blob([bytes('showcase.ppt')]), controller.signal)
  await new Promise((resolve) => setTimeout(resolve, 0))
  controller.abort()
  await assert.rejects(opening, (error) => error.name === 'AbortError')
  assert.ok(workers.every((worker) => worker.terminated))
})

test('render queue prioritizes the current slide, cancels scrolled-away thumbnails and deduplicates requests', async () => {
  const pending = new Map()
  const calls = []
  const cache = cacheModule.createSlideCache((index) => {
    calls.push(index)
    return new Promise((resolve) => pending.set(index, resolve))
  })
  const first = cache.get(0)
  const gone = new AbortController()
  const thumbnail = cache.get(1, gone.signal, false)
  const nextThumbnail = cache.get(2, undefined, false)
  const current = cache.get(3)
  const duplicate = cache.get(3)
  gone.abort()
  await assert.rejects(thumbnail, (error) => error.name === 'AbortError')
  pending.get(0)(slide(0)); await first
  assert.deepEqual(calls, [0, 3])
  pending.get(3)(slide(3)); await current; await duplicate
  assert.deepEqual(calls, [0, 3, 2])
  pending.get(2)(slide(2)); await nextThumbnail
  await cache.get(3)
  assert.equal(calls.length, 3)
  cache.dispose()
})

test('slide cache bounds entries and markup bytes, then cancels outstanding callers on disposal', async () => {
  const calls = []
  const cache = cacheModule.createSlideCache(async (index) => { calls.push(index); return slide(index) })
  for (let i = 0; i < 8; i++) await cache.get(i)
  await cache.get(0)
  assert.equal(calls.length, 9)
  cache.dispose()
  let count = 0
  const large = cacheModule.createSlideCache(async (index) => { count++; return slide(index, 3 * 1024 * 1024) })
  await large.get(0); await large.get(0)
  assert.equal(count, 2)
  large.dispose()
  const waiting = cacheModule.createSlideCache(() => new Promise(() => {}))
  const promise = waiting.get(0)
  waiting.dispose()
  await assert.rejects(promise, (error) => error.name === 'AbortError')
})

test('preview document blocks scripts and external resources while allowing local image/font blobs', () => {
  const html = slideDocument('<svg><text>Hello</text></svg>')
  assert.ok(html.startsWith('<!doctype html>'))
  for (const directive of ["default-src 'none'", 'img-src blob: data:', 'font-src blob: data:', "base-uri 'none'", "form-action 'none'"]) assert.ok(html.includes(directive))
  assert.ok(!html.includes("script-src 'unsafe-inline'"))
})

function cfbFixture(name = 'sample.ppt') {
  const data = bytes(name)
  const view = new DataView(data)
  const sector = 2 ** view.getUint16(30, true)
  const directory = view.getUint32(48, true)
  return { data, view, sector, directory, directoryOffset: (directory + 1) * sector,
    fatOffset(id) {
      const fatId = view.getUint32(76 + Math.floor(id / (sector / 4)) * 4, true)
      return (fatId + 1) * sector + (id % (sector / 4)) * 4
    } }
}

test('CFB preflight rejects cycle amplification, overlapping/out-of-file chains and forged headers before upstream parse', async () => {
  const corruptions = [
    ['directory FAT cycle (the original 512 MB allocation case)', (f) => f.view.setUint32(f.fatOffset(f.directory), f.directory, true)],
    ['stream FAT cycle', (f) => f.view.setUint32(f.fatOffset(2), 2, true)],
    ['out-of-file sector', (f) => f.view.setUint32(f.fatOffset(f.directory), f.data.byteLength / f.sector, true)],
    ['invalid sector shift', (f) => f.view.setUint16(30, 31, true)],
    ['invalid mini-sector shift', (f) => f.view.setUint16(32, 31, true)],
    ['invalid full signature', (f) => f.view.setUint8(2, 0)],
    ['cyclic DIFAT', (f) => { f.view.setUint32(68, f.directory, true); f.view.setUint32(72, 2, true) }],
    ['huge FAT declaration', (f) => f.view.setUint32(44, 0xffffffff, true)],
    ['stream larger than file', (f) => f.view.setUint32(f.directoryOffset + 128 + 120, f.data.byteLength + 1, true)],
    ['empty stream with live chain', (f) => f.view.setUint32(f.directoryOffset + 128 + 120, 0, true)],
    ['root and regular stream overlap', (f) => { f.view.setUint32(f.directoryOffset + 116, 2, true); f.view.setUint32(f.directoryOffset + 120, 4096, true) }],
  ]
  let unsafeCalls = 0
  const GuardedEngine = evaluate(source('lib/presentation-engine.ts'), {
    './validate-cfb': cfbModule, './presentation-limits': limitsModule,
    '@web-ppt/core': { ...core, parse: () => { unsafeCalls++; throw new Error('Unsafe parser reached') } },
  }).PresentationEngine
  for (const [label, mutate] of corruptions) {
    const fixture = cfbFixture()
    mutate(fixture)
    await assert.rejects(new GuardedEngine().open(fixture.data),
      (error) => error.code === 'PRESENTATION_INVALID_CFB', label)
  }
  const mini = cfbFixture('showcase.ppt')
  const firstMiniFat = mini.view.getUint32(60, true)
  mini.view.setUint32((firstMiniFat + 1) * mini.sector, 0, true)
  await assert.rejects(new GuardedEngine().open(mini.data), (error) => error.code === 'PRESENTATION_INVALID_CFB')
  assert.equal(unsafeCalls, 0, 'all malformed inputs must be blocked before the vulnerable dependency runs')
})

test('preflight accepts valid CFB v4 sectors as well as the real v3 fixtures', () => {
  const data = new ArrayBuffer(4096 * 3)
  const view = new DataView(data)
  new Uint8Array(data).set([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])
  for (const [offset, value] of [[26, 4], [28, 0xfffe], [30, 12], [32, 6]]) view.setUint16(offset, value, true)
  for (const [offset, value] of [[40, 1], [44, 1], [48, 1], [56, 4096], [60, 0xfffffffe], [68, 0xfffffffe]]) view.setUint32(offset, value, true)
  for (let i = 0; i < 109; i++) view.setUint32(76 + i * 4, i === 0 ? 0 : 0xffffffff, true)
  for (let i = 0; i < 1024; i++) view.setUint32(4096 + i * 4, i === 0 ? 0xfffffffd : i === 1 ? 0xfffffffe : 0xffffffff, true)
  const root = 8192
  view.setUint16(root, 65, true); view.setUint16(root + 64, 4, true); view.setUint8(root + 66, 5)
  view.setUint32(root + 116, 0xfffffffe, true)
  cfbModule.validatePresentationCfb(data)
})

test('mobile ZIP entry limits reject highly compressed oversized content before inflate', async () => {
  const compressed = zipSync({ 'large.bin': new Uint8Array(limitsModule.PRESENTATION_LIMITS.zip.maxEntryBytes + 1) })
  assert.ok(compressed.byteLength < 100_000)
  await assert.rejects(new PresentationEngine().open(compressed.buffer), (error) => error.reason === 'zip-entry-too-large')
})

test('oversized input is rejected before arrayBuffer and hung workers are terminated for both open and render', async () => {
  const workers = []
  class HungWorker {
    constructor() { workers.push(this) }
    postMessage(message) {
      if (this.replyToOpen && message.type === 'open') queueMicrotask(() => this.onmessage({ data: {
        id: message.id, ok: true, value: { width: 960, height: 720, count: 2, source: 'ppt' },
      } }))
    }
    terminate() { this.terminated = true }
  }
  const shortLimits = { ...limitsModule, PRESENTATION_LIMITS: { ...limitsModule.PRESENTATION_LIMITS, openTimeoutMs: 20, slideTimeoutMs: 20 } }
  const { readPresentation } = evaluate(source('lib/read-presentation.ts').replaceAll('import.meta.url', "'file:///presentation-test'"),
    { './slide-cache': cacheModule, './presentation-limits': shortLimits }, { Worker: HungWorker })
  let reads = 0
  await assert.rejects(readPresentation({ size: limitsModule.PRESENTATION_LIMITS.maxFileBytes + 1, arrayBuffer: () => { reads++; return Promise.resolve(new ArrayBuffer(0)) } }),
    (error) => error.code === 'PRESENTATION_FILE_TOO_LARGE')
  assert.equal(reads, 0); assert.equal(workers.length, 0)
  await assert.rejects(readPresentation(new Blob([bytes('sample.ppt')])), (error) => error.code === 'PRESENTATION_TIMEOUT')
  assert.equal(workers[0].terminated, true)
  HungWorker.prototype.replyToOpen = true
  const session = await readPresentation(new Blob([bytes('sample.ppt')]))
  const outcomes = await Promise.allSettled([session.slide(0), session.slide(1)])
  assert.ok(outcomes.every((outcome) => outcome.status === 'rejected' && outcome.reason.code === 'PRESENTATION_TIMEOUT'))
  assert.equal(workers.at(-1).terminated, true)
  session.dispose()
})

test('the actual worker rejects the original cyclic PPT without attempting the large allocation', async () => {
  const worker = new NodeWorker(workerSource, { eval: true })
  try {
    const bad = cfbFixture()
    bad.view.setUint32(bad.fatOffset(bad.directory), bad.directory, true)
    const response = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Worker failed to reject malformed PPT promptly')), 3000)
      worker.once('error', (error) => { clearTimeout(timer); reject(error) })
      worker.once('message', (message) => { clearTimeout(timer); resolve(message) })
      worker.postMessage({ id: 99, type: 'open', data: bad.data }, [bad.data])
    })
    assert.equal(response.ok, false)
    assert.equal(response.code, 'PRESENTATION_INVALID_CFB')
    assert.ok(!response.error.includes('AUDIT_BLOCKED_LARGE_ALLOCATION'))
  } finally { await worker.terminate() }
})

test('native content reads enforce the byte budget even when provider size is unknown or incorrect', async () => {
  let chunks = []
  let calls = 0
  const lengths = []
  const Library = { readChunk: async ({ length }) => { calls++; lengths.push(length); return chunks.shift() } }
  const native = evaluate(readFileSync(new URL('../src/entities/file/api/native.ts', import.meta.url), 'utf8'), {
    '@capacitor/core': { registerPlugin: () => Library }, '@/shared/ui': { askConfirm: async () => false }, '@/shared/i18n': { t: (key) => key },
  }, { atob, Blob }).nativeApi
  chunks = [{ data: '', eof: false, size: 1000 }]
  await assert.rejects(native.readContent('large', 8), (error) => error.code === 'CONTENT_TOO_LARGE')
  assert.equal(calls, 1)
  calls = 0; lengths.length = 0
  chunks = [
    { data: Buffer.from('123456').toString('base64'), eof: false, size: null },
    { data: Buffer.from('789012').toString('base64'), eof: false, size: null },
    { data: '', eof: true, size: null },
  ]
  await assert.rejects(native.readContent('unknown-size', 8), (error) => error.code === 'CONTENT_TOO_LARGE')
  assert.equal(calls, 2)
  assert.deepEqual(lengths, [9, 3])
  calls = 0; chunks = [{ data: '', eof: false, size: null }]
  await assert.rejects(native.readContent('no-progress', 8), /made no progress/)
  assert.equal(calls, 1)
})

test('mobile viewer mounts one preview, handles navigation/zoom/swipe, virtualizes thousands of thumbnails and saves progress', async () => {
  const observers = []
  const virtualWindow = evaluate(readFileSync(new URL('../src/shared/lib/virtual-window.ts', import.meta.url), 'utf8'))
  const imports = { vue: { ...vue, vModelSelect: {}, vModelText: {} },
    '@/shared/i18n': { t: (key, values = {}) => `${key}${values.page ? ` ${values.page}` : ''}` },
    '../lib/slide-document': { slideDocument }, '@/shared/lib/virtual-window': virtualWindow,
    '../lib/presentation-error': { presentationError: (_error, fallback) => fallback } }
  const globals = { requestAnimationFrame: (callback) => setTimeout(callback, 0), cancelAnimationFrame: clearTimeout,
    HTMLInputElement: class {}, HTMLSelectElement: class {}, ResizeObserver: class {
      constructor(callback) { this.callback = callback; observers.push(this) }
      observe() {}
      disconnect() { this.disconnected = true }
    } }
  const compile = (text, extra) => evaluate(compileScript(parse(text).descriptor, { id: 'presentation-test', inlineTemplate: true }).content,
    { ...imports, ...extra }, globals).default
  const Ic = { render: () => vue.h('i') }
  const VirtualList = compile(readFileSync(new URL('../src/shared/ui/VirtualList.vue', import.meta.url), 'utf8'))
  const Thumbnail = compile(source('ui/PresentationThumbnail.vue'), { '@/shared/ui': { Ic } })
  const Viewer = compile(source('ui/PresentationViewer.vue'), { '@/shared/ui': { Ic, VirtualList }, './PresentationThumbnail.vue': { default: Thumbnail } })
  const element = (type) => ({ type, props: {}, children: [], parent: null, clientWidth: 390, clientHeight: 500,
    scrollLeft: 0, scrollTop: 0, focus() {} })
  const renderer = vue.createRenderer({ createElement: element, createText: element, createComment: element,
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
  const calls = []
  const saved = []
  const session = { width: 1280, height: 720, count: 5000, source: 'pptx',
    slide: async (index) => { calls.push(index); return slide(index) } }
  const root = element('container')
  const app = renderer.createApp({ render: () => vue.h(Viewer, { session, fileId: 'original-file', onProgress: (value) => saved.push(value) }) })
  app.mount(root)
  const flush = async () => { for (let i = 0; i < 5; i++) await vue.nextTick() }
  const all = () => {
    const result = []
    const visit = (el) => { result.push(el); el.children.forEach(visit) }
    visit(root); return result
  }
  const find = (predicate) => all().find(predicate)
  await flush()
  assert.deepEqual(calls, [0])
  assert.equal(all().filter((el) => el.type === 'iframe').length, 1)
  assert.equal(find((el) => el.type === 'iframe').props.sandbox, 'allow-same-origin')
  const stage = () => find((el) => el.props['aria-label'] === 'slides.canvas')
  stage().props.onPointerdown({ clientX: 250, clientY: 100 })
  stage().props.onPointerup({ clientX: 100, clientY: 100 })
  await flush()
  assert.equal(calls.at(-1), 1)
  find((el) => el.type === 'select').props['onUpdate:modelValue'](2)
  await flush()
  assert.equal(calls.length, 2, 'zoom must not parse or render again')
  const input = find((el) => el.type === 'input')
  input.props['onUpdate:modelValue'](5000)
  input.props.onChange()
  await flush()
  assert.equal(calls.at(-1), 4999)
  find((el) => el.props['aria-label'] === 'slides.list' && el.type === 'button').props.onClick()
  await flush()
  const visible = all().filter((el) => el.props.role === 'listitem')
  assert.ok(visible.length <= 15)
  assert.ok(visible.some((el) => el.props['aria-posinset'] === 5000))
  assert.ok(calls.length < 20)
  find((el) => el.props['aria-label'] === 'slides.close').props.onClick()
  await flush()
  assert.equal(all().filter((el) => el.type === 'iframe').length, 1)
  find((el) => el.props['aria-label'] === 'slides.text').props.onClick()
  await flush()
  assert.ok(find((el) => el.text === 'Slide 5000'))
  app.unmount()
  assert.equal(saved.at(-1).id, 'original-file')
  assert.equal(saved.at(-1).page, 4999)
  assert.equal(saved.at(-1).zoom, 2)
  assert.ok(observers.every((observer) => observer.disconnected))
})
