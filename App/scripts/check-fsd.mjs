// Verifies the Feature-Sliced Design import rules for src/. Run: npm run lint:fsd
//   1. a module may only import from layers strictly below its own (app > pages > widgets > features > entities > shared)
//   2. slices on the same layer never import each other
//   3. importing another slice goes through its public API (`@/layer/slice`), never a deep path
//   4. inside a slice use relative imports (not the slice's own public API, which risks cycles)
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve, dirname, sep } from 'node:path'

const SRC = resolve(import.meta.dirname, '..', 'src')
const LAYERS = ['app', 'pages', 'widgets', 'features', 'entities', 'shared']
const rank = (l) => LAYERS.indexOf(l)

function walk(dir) {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n)
    return statSync(p).isDirectory() ? walk(p) : /\.(ts|vue)$/.test(n) ? [p] : []
  })
}

// Where does a file live? -> { layer, slice } ; shared and app have segments instead of slices.
function locate(file) {
  const [layer, a, b] = relative(SRC, file).split(sep)
  if (layer === 'app') return { layer, slice: 'app' }
  if (layer === 'shared') return { layer, slice: a } // ui | lib | config
  return { layer, slice: a, isIndex: b === 'index.ts' && relative(SRC, file).split(sep).length === 3 }
}

const IMPORT = /(?:import|export)\s+(?:[^;'"]*?\s+from\s+)?['"]([^'"]+)['"]/g
const problems = []

for (const file of walk(SRC)) {
  const me = locate(file)
  const text = readFileSync(file, 'utf8')
  for (const m of text.matchAll(IMPORT)) {
    const spec = m[1]
    let target = null
    if (spec.startsWith('@/')) target = spec.slice(2).split('/')
    else if (spec.startsWith('.')) target = relative(SRC, resolve(dirname(file), spec)).split(sep)
    if (!target || !LAYERS.includes(target[0])) continue

    const [tLayer, tSlice, ...rest] = target
    const fail = (why) => problems.push(`${relative(SRC, file)}: "${spec}" — ${why}`)
    const sameSlice = tLayer === me.layer && (tLayer === 'app' || tSlice === me.slice)

    if (sameSlice) {
      if (spec.startsWith('@/') && tLayer !== 'app' && tLayer !== 'shared' && rest.length === 0 && !me.isIndex) {
        fail('use a relative import inside the same slice')
      }
      continue
    }
    if (rank(tLayer) < rank(me.layer)) fail(`${me.layer} must not import from the higher layer ${tLayer}`)
    else if (tLayer === me.layer && tLayer !== 'shared') fail(`slices on the ${me.layer} layer must not import each other`)
    else if (tLayer !== 'shared' && tLayer !== 'app' && rest.length > 0) fail('import the slice through its public API (index.ts)')
  }
}

if (problems.length) {
  console.error(`FSD violations (${problems.length}):\n` + problems.map((p) => '  ' + p).join('\n'))
  process.exit(1)
}
console.log(`FSD OK — ${walk(SRC).length} files checked`)
