// Guardián del grafo de código propio (scripts/grafo-codigo.mjs). `node --test` (gate `pnpm test:guardia`).
//
// Importa las funciones REALES del script: un parser reimplementado aquí pasaría mientras el de
// verdad falla. Cada `test` fija UNA decisión del extractor. Visto en rojo el 12/09/2026 rompiendo
// a propósito la resolución de barriles y el salto de statements multilínea (salida en el PR).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { extraerGrafo, resolverImport, imports, declaraciones, referencias, sinComentarios, esTest } from '../scripts/grafo-codigo.mjs'

const archivos = [
  { rel: 'packages/m/src/viva.ts', text: `// helper
export function esViva(x: number) { return x > 0 }
export const WHERE_VIVA = 'x > 0'
function privada() { return esViva(1) }
export default privada
` },
  { rel: 'packages/m/src/index.ts', text: `export { esViva,
  WHERE_VIVA } from './viva'
export * from './otro'
` },
  { rel: 'packages/m/src/otro.ts', text: `export const util = () => 1\n` },
  { rel: 'apps/a/lib/ficha.ts', text: `import { esViva, util } from '@central/m'
import viva from '@central/m/viva'
import { eur } from '@/lib/dinero'
/* esViva( en un comentario no cuenta */
export async function ficha(id: string) {
  const ok = esViva(1) // llamada
  const f = util()
  return eur(viva(ok))
}
export const Comp = () => <Ficha />
` },
  { rel: 'apps/a/lib/dinero.ts', text: `export function eur(n: number) { return n + '€' }\n` },
  { rel: 'apps/a/lib/ficha.test.ts', text: `import { ficha } from './ficha'\ntest('x', () => ficha('1'))\n` },
]
const alias = { 'apps/a': 'apps/a' }
const g = extraerGrafo(archivos, alias)
const aristas = (pred: (a: any) => boolean) => g.aristas.filter(pred).map(a => `${a.origen} -${a.tipo}-> ${a.destino}`)

test('un import relativo, uno por alias @/ y uno por @central/<pkg> resuelven a archivos del repo', () => {
  const existe = new Set(archivos.map(a => a.rel))
  assert.equal(resolverImport('./viva', 'packages/m/src/index.ts', existe), 'packages/m/src/viva.ts')
  assert.equal(resolverImport('@/lib/dinero', 'apps/a/lib/ficha.ts', existe, alias), 'apps/a/lib/dinero.ts')
  assert.equal(resolverImport('@central/m', 'apps/a/lib/ficha.ts', existe), 'packages/m/src/index.ts')
  assert.equal(resolverImport('@central/m/viva', 'apps/a/lib/ficha.ts', existe), 'packages/m/src/viva.ts')
  assert.equal(resolverImport('react', 'apps/a/lib/ficha.ts', existe), null, 'externo → null')
  assert.equal(resolverImport('./no-existe', 'apps/a/lib/ficha.ts', existe), null)
})

test('la llamada se atribuye a la FUNCIÓN de primer nivel que la contiene, y el símbolo importado por el barril apunta al archivo que lo declara', () => {
  assert.ok(aristas(a => a.origen === 'apps/a/lib/ficha.ts#ficha' && a.destino === 'packages/m/src/viva.ts#esViva' && a.tipo === 'llama').length === 1,
    `esperaba ficha → viva.ts#esViva, hay: ${aristas(a => a.origen.startsWith('apps/a/lib/ficha.ts')).join(' | ')}`)
  assert.ok(aristas(a => a.origen === 'apps/a/lib/ficha.ts#ficha' && a.destino === 'packages/m/src/otro.ts#util').length === 1, 'export * del barril también se sigue')
  assert.ok(aristas(a => a.origen === 'apps/a/lib/ficha.ts#ficha' && a.destino === 'apps/a/lib/dinero.ts#eur').length === 1)
})

test('el import por defecto resuelve al símbolo real (`export default privada`)', () => {
  assert.ok(aristas(a => a.origen === 'apps/a/lib/ficha.ts#ficha' && a.destino === 'packages/m/src/viva.ts#privada').length === 1)
})

test('un `export { a,\\n b } from` de VARIAS líneas no cuenta como uso del símbolo', () => {
  assert.deepEqual(aristas(a => a.origen.startsWith('packages/m/src/index.ts') && (a.tipo === 'llama' || a.tipo === 'usa')), [])
  const im = imports(archivos[1].text)
  assert.equal(im[0].lineaFin, 2)
})

test('un símbolo dentro de un comentario no genera arista', () => {
  assert.ok(!aristas(a => a.origen.startsWith('apps/a/lib/ficha.ts') && a.destino === 'packages/m/src/viva.ts#esViva' && a.linea === 4).length)
  assert.ok(!/esViva\(/.test(sinComentarios(archivos[3].text).split('\n')[3]))
})

test('la llamada intra-archivo cuenta y una función no se llama a sí misma por su declaración', () => {
  assert.ok(aristas(a => a.origen === 'packages/m/src/viva.ts#privada' && a.destino === 'packages/m/src/viva.ts#esViva' && a.tipo === 'llama').length === 1)
  assert.ok(!aristas(a => a.origen === a.destino).length, 'sin bucles origen === destino')
})

test('un componente JSX usado como <Ficha /> se cuenta como llamada', () => {
  const r = referencias('const x = <Ficha a={1} />', new Set(['Ficha']))
  assert.deepEqual(r, [{ nombre: 'Ficha', linea: 1, tipo: 'llama' }])
})

test('los tests se marcan (es_test) y aparecen como dependientes del archivo que prueban', () => {
  assert.equal(esTest('apps/a/lib/ficha.test.ts'), true)
  assert.equal(esTest('test/regression-x.test.ts'), true)
  assert.equal(esTest('apps/a/lib/ficha.ts'), false)
  const n = g.nodos.find(n => n.id === 'apps/a/lib/ficha.test.ts')
  assert.equal(n?.es_test, true)
  assert.ok(aristas(a => a.origen === 'apps/a/lib/ficha.test.ts' && a.destino === 'apps/a/lib/ficha.ts#ficha' && a.tipo === 'llama').length === 1)
})

test('declaraciones(): solo primer nivel; una const sin flecha ni export no es nodo', () => {
  const d = declaraciones(`const x = 5\nexport const Y = 1\nconst f = () => 2\nfunction g() {\n  const inner = () => 3\n}\nclass K {}\n`)
  assert.deepEqual(d.map(x => `${x.tipo}:${x.nombre}:${x.exportado}`), ['const:Y:true', 'funcion:f:false', 'funcion:g:false', 'clase:K:false'])
})

test('nodos: archivo + símbolos con su línea; un símbolo importado que no se declara en ningún sitio queda como tipo "simbolo"', () => {
  const n = g.nodos.find(n => n.id === 'packages/m/src/viva.ts#esViva')
  assert.equal(n?.tipo, 'funcion'); assert.equal(n?.linea, 2); assert.equal(n?.exportado, true)
  const g2 = extraerGrafo([{ rel: 'apps/a/x.ts', text: `import { nada } from './y'\nnada()\n` }, { rel: 'apps/a/y.ts', text: `export { nada } from './z'\n` }, { rel: 'apps/a/z.ts', text: `// vacío\n` }])
  const s = g2.nodos.find(n => n.nombre === 'nada')
  assert.equal(s?.tipo, 'simbolo')
})

test('un `/*` dentro de un comentario `//` NO abre un bloque que se trague código real (hallazgo del code-review, 12/09/2026)', () => {
  const t = sinComentarios(`// bajo \`/motorcycle/*\` van las motos\nexport async function marcasMoto() {}\nconst x = 1 /* bloque */ + 2\n`)
  assert.match(t.split('\n')[1], /export async function marcasMoto/)
  assert.doesNotMatch(t, /bloque/)
  assert.deepEqual(declaraciones(t).map(d => d.nombre), ['marcasMoto'])
})

test('`export { x }` local resuelve al símbolo real, incluso si `x` era un import de otro archivo', () => {
  const g3 = extraerGrafo([
    { rel: 'apps/a/lib/db.ts', text: `export const prisma = () => 1\n` },
    { rel: 'apps/a/lib/tenant.ts', text: `import { prisma } from './db'\nconst COOKIE = { a: 1 }\nexport { prisma, COOKIE as COOKIE_OPTS }\n` },
    { rel: 'apps/a/lib/uso.ts', text: `import { prisma, COOKIE_OPTS } from './tenant'\nexport const f = () => prisma() && COOKIE_OPTS\n` },
  ])
  const ids = g3.aristas.filter(a => a.origen === 'apps/a/lib/uso.ts#f').map(a => a.destino).sort()
  assert.deepEqual(ids, ['apps/a/lib/db.ts#prisma', 'apps/a/lib/tenant.ts#COOKIE'])
  assert.equal(g3.nodos.filter(n => n.tipo === 'simbolo').length, 0, 'sin símbolos fantasma')
})
