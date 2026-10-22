// Guardián del PATRIMONIO del portal (22/10/2026): un cliente NO ve los inmuebles, contratos ni gastos de otro.
// `node --test` (gate en CI vía `pnpm test:guardia`).
//
// El rol `prisma_asegura_portal` NO tiene BYPASSRLS y las tablas `portal_patrimonio_*` no tienen RLS: lo único
// que separa el patrimonio de un titular del de otro es que TODO fichero que toque `prisma.portalPatrimonio*`
// parta de `accesosPatrimonio()` (resuelto desde la cookie y `portal_vinculo`), y que ese adaptador no regale
// el nivel `total` a lo que no lo merece. La regla pura (`nivelesPatrimonio`) tiene su test en
// `packages/module-patrimonio/src/acceso.test.ts`; esto vigila lo que el puro NO puede saber (hallazgo de
// revisión del paso 2: el puro da `total` a toda ficha que reciba en `vinculadas`).
// Los comentarios se quitan antes de mirar: un cepo de texto que se satisface con un comentario no cepa nada.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dirname, '..')
const sinComentarios = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
const leer = (f: string) => sinComentarios(readFileSync(join(ROOT, f), 'utf8'))

const ACCESOS = 'apps/asegura-portal/lib/patrimonio/accesos.ts'
const LECTURA = 'apps/asegura-portal/lib/patrimonio/lectura.ts'

function cuerpo(src: string, nombre: string): string {
  const i = src.indexOf(`export async function ${nombre}(`)
  assert.ok(i >= 0, `falta ${nombre} en ${ACCESOS}`)
  const j = src.indexOf('\nexport ', i + 1)
  return src.slice(i, j < 0 ? undefined : j)
}

test('🚨 accesosPatrimonio sale de la COOKIE y de portal_vinculo de ESA identidad', () => {
  const f = cuerpo(leer(ACCESOS), 'accesosPatrimonio')
  assert.match(f, /const sesion = await getIdentidad\(\)/)
  assert.match(f, /if \(!sesion \|\| sesion\.id !== identidadId\) return new Map\(\)/)
  assert.match(f, /portalVinculo\.findMany\(\{\s*where: \{ identidadId \}/)
})

test('🚨 la vista de corredor no abre el patrimonio: ni su sesión ni sus vínculos temporales', () => {
  const f = cuerpo(leer(ACCESOS), 'accesosPatrimonio')
  assert.match(f, /if \(sesion\.corredor\) return new Map\(\)/)
  assert.match(f, /select: \{ clienteId: true, nivel: true, origen: true \}/)
  assert.match(f, /v\.origen !== 'corredor'/)
})

test('🚨 solo los vínculos que OPERAN dan «total»; y son los mismos que alimentan Dueño y autorizaciones', () => {
  const f = cuerpo(leer(ACCESOS), 'accesosPatrimonio')
  assert.match(f, /const queOperan = vinculos\.filter\(\(v\) => v\.origen !== 'corredor' && puedeAutorizar\(nivelDe\(v\.nivel\)\)\)/)
  assert.match(f, /const propias = \[\.\.\.new Set\(queOperan\.map\(\(v\) => v\.clienteId\)\)\]/)
  assert.match(f, /empresasDeFichas\(queOperan\)/)
  assert.match(f, /vinculadas: propias,/)
  // Ningún atajo con la lista cruda de vínculos.
  assert.doesNotMatch(f, /empresasDeFichas\(vinculos\)/)
  assert.doesNotMatch(f, /vinculadas: vinculos/)
})

test('🚨 autorizaciones: solo alcances de PATRIMONIO y solo las que me alcanzan A MÍ', () => {
  const src = leer(ACCESOS)
  const f = cuerpo(src, 'accesosPatrimonio')
  assert.match(src, /const ALCANCES_PATRIMONIO = \[ALCANCE_PATRIMONIO_GESTION, ALCANCE_PATRIMONIO_TOTAL\]/)
  assert.match(f, /alcance: \{ in: ALCANCES_PATRIMONIO \}/)
  assert.match(f, /\{ autorizadoIdentidadId: identidadId \}/)
  assert.match(f, /autorizadoClienteId: \{ in: propias \}/)
  // Los alcances de la bóveda NO abren el patrimonio.
  assert.doesNotMatch(src, /ALCANCES\b(?!_PATRIMONIO)/)
})

test('🚨 fichasVivas: solo fichas activas y sin fusionar llegan a la regla pura', () => {
  const f = cuerpo(leer(ACCESOS), 'accesosPatrimonio')
  assert.match(f, /prisma\.cliente\.findMany\(\{\s*where: \{ id: \{ in: candidatas \}, mergedIntoClienteId: null, activo: true \}/)
  assert.match(f, /fichasVivas: new Set\(vivas\.map\(\(f\) => f\.id\)\)/)
  assert.match(f, /return nivelesPatrimonio\(\{/)
})

test('lectura.ts es PURO: sin prisma ni sesión, y sin convertir «no se sabe» en 0', () => {
  const src = leer(LECTURA)
  assert.doesNotMatch(src, /from ['"][^'"]*(\/db|\/session|@prisma\/client)['"]/)
  assert.doesNotMatch(src, /prisma\./)
  assert.doesNotMatch(src, /\?\?\s*(0|\[\]|false|'otro')\b/)
})

// ─── Todo fichero que toque `prisma.portalPatrimonio*` pasa por `accesosPatrimonio` ─────────────────────
const USA_PATRIMONIO = /prisma\s*\.\s*portalPatrimonio[A-Z]/
const PASA_POR_ACCESOS = /\baccesosPatrimonio\(/

/** Infractores: tocan las tablas del patrimonio sin resolver antes los accesos de la sesión. */
function sinAccesos(ficheros: ReadonlyArray<{ f: string; src: string }>): string[] {
  return ficheros.filter(({ src }) => USA_PATRIMONIO.test(src) && !PASA_POR_ACCESOS.test(src)).map(({ f }) => f)
}

test('el detector de este cepo muerde (brazos sintéticos)', () => {
  assert.deepEqual(sinAccesos([{ f: 'a.ts', src: 'await prisma.portalPatrimonioInmueble.findMany({})' }]), ['a.ts'])
  assert.deepEqual(
    sinAccesos([{ f: 'b.ts', src: 'const a = await accesosPatrimonio(id); await prisma.portalPatrimonioGasto.findMany({})' }]),
    [],
  )
})

test('🚨 ningún fichero del portal toca prisma.portalPatrimonio* sin pasar por accesosPatrimonio', () => {
  const ficheros = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', 'apps/asegura-portal'], {
    cwd: ROOT,
    encoding: 'utf8',
  })
    .split('\n')
    .filter((f) => /\.(ts|tsx)$/.test(f))
    // El test de la regla pura y los propios ficheros de test no consultan.
    .filter((f) => !/\.test\.tsx?$/.test(f))
    .map((f) => ({ f, src: leer(f) }))
  assert.ok(ficheros.some(({ f }) => f === ACCESOS), 'el cepo no está viendo lib/patrimonio/accesos.ts')
  const infractores = sinAccesos(ficheros)
  assert.deepEqual(
    infractores,
    [],
    'Estos ficheros leen o escriben el PATRIMONIO sin resolver antes `accesosPatrimonio(identidadId)`. Sin RLS, ' +
      `una consulta con el titular de la URL devuelve los inmuebles de cualquiera:\n  - ${infractores.join('\n  - ')}`,
  )
})
