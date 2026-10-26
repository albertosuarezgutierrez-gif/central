// Cepo de las PUERTAS de servidor del portal (26/10/2026): lo que el menú no ofrece a un autorizado puro tampoco se
// abre escribiendo la URL a mano. La regla es UNA (`puertaAbierta()` de `menu-visible.ts`, con su test puro); aquí se
// vigila que cada ruta la llame, en el sitio y con el modo que toca, y que ninguna ruta nueva del calendario o de los
// accesos nazca sin clasificar (puerta o exención con su porqué).
// Los comentarios se quitan antes de mirar: un cepo de texto que se satisface con un comentario no cepa nada.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOT = join(import.meta.dirname, '..')
const APP = join(ROOT, 'apps/asegura-portal/app')
const sinComentarios = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
const leer = (f: string) => sinComentarios(readFileSync(join(APP, f), 'utf8'))

/** Las rutas con puerta: [fichero relativo a app/, puerta, modo]. */
const CON_PUERTA: ReadonlyArray<readonly [string, 'calendario' | 'conceder', 'lectura' | 'escritura']> = [
  ['(portal)/herramientas/calendario/page.tsx', 'calendario', 'lectura'],
  ['api/recordatorios/route.ts', 'calendario', 'escritura'],
  ['api/autorizaciones/route.ts', 'conceder', 'escritura'],
]

/** Las que NO llevan puerta, a propósito. Quien añada una ruta aquí tiene que decir por qué. */
const EXENTAS: Record<string, string> = {
  '(portal)/patrimonio/calendario/page.tsx': 'solo redirige al calendario único, que es quien tiene la puerta',
  '(portal)/autorizaciones/page.tsx': 'el menú NO la oculta: la muda a «Cuenta» para que el autorizado acepte o deje lo que le dieron',
  'api/autorizaciones/[id]/route.ts': 'aceptar / revocar / mantener: el autorizado acepta y RENUNCIA aquí; lo decide resolver()',
  'api/recordatorios/[id]/route.ts': 'DELETE de lo PROPIO: nadie se queda sin poder borrar un recordatorio suyo',
}

function ficheros(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n)
    return statSync(p).isDirectory() ? ficheros(p) : [p]
  })
}

test('🚨 toda ruta del calendario, los recordatorios y los accesos está clasificada (puerta o exención)', () => {
  const vigiladas = ficheros(APP)
    .map((f) => relative(APP, f))
    .filter((f) => /(^|\/)(page|route)\.tsx?$/.test(f))
    .filter((f) => /calendario|recordatorios|autorizaciones/.test(f))
  assert.ok(vigiladas.length >= 6, `el recorrido no encuentra las rutas (${vigiladas.length}): ¿se movió app/?`)
  const clasificadas = new Set([...CON_PUERTA.map(([f]) => f), ...Object.keys(EXENTAS)])
  for (const f of vigiladas) assert.ok(clasificadas.has(f), `${f} no tiene puerta ni exención: clasifícala en este cepo`)
  for (const f of clasificadas) assert.ok(vigiladas.includes(f), `${f} ya no existe: quítala del cepo`)
})

test('🚨 la página del calendario cierra a /inicio con la puerta en modo lectura, ANTES de leer nada', () => {
  const src = leer('(portal)/herramientas/calendario/page.tsx')
  const puerta = src.search(/if \(!\(await puertaDeSesion\('calendario', 'lectura'\)\)\) redirect\('\/inicio'\)/)
  assert.ok(puerta > 0, 'falta la puerta del calendario')
  assert.ok(src.indexOf('getIdentidad()') < puerta, 'la puerta va después de comprobar la sesión')
  assert.ok(puerta < src.indexOf('Promise.allSettled('), 'la puerta va antes de la primera lectura')
})

test('🚨 cada escritura con puerta devuelve 403 SIN_ACCESO antes de leer el cuerpo', () => {
  for (const [f, puerta, modo] of CON_PUERTA.filter(([, , m]) => m === 'escritura')) {
    const src = leer(f)
    const metodos = [...src.matchAll(/export async function (POST|PUT|PATCH|DELETE)\b/g)]
    assert.ok(metodos.length > 0, `${f}: no hay escrituras`)
    for (const m of metodos) {
      const cuerpo = src.slice(m.index, src.indexOf('\nexport ', m.index + 1) === -1 ? undefined : src.indexOf('\nexport ', m.index + 1))
      const re = new RegExp(`if \\(!\\(await puertaDeSesion\\('${puerta}', '${modo}'\\)\\)\\) return NextResponse\\.json\\(SIN_ACCESO, \\{ status: 403 \\}\\)`)
      const i = cuerpo.search(re)
      assert.ok(i > 0, `${f} ${m[1]}: falta la puerta '${puerta}' en modo '${modo}'`)
      assert.ok(cuerpo.indexOf('requireIdentidad()') < i, `${f} ${m[1]}: la puerta va después de la sesión`)
      const json = cuerpo.indexOf('req.json()')
      assert.ok(json === -1 || i < json, `${f} ${m[1]}: la puerta va antes de leer el cuerpo`)
    }
  }
})

test('🚨 la puerta no copia la regla: lee los hechos del menú y decide puertaAbierta(); lectura caída = desconocidos', () => {
  const src = sinComentarios(readFileSync(join(ROOT, 'apps/asegura-portal/lib/puertas-portal.ts'), 'utf8'))
  assert.match(src, /menu = await menuDeSesion\(\)/)
  assert.match(src, /puertaAbierta\(menu === null \? HECHOS_DESCONOCIDOS : menu\.hechos, puerta, modo\)/)
  assert.doesNotMatch(src, /esTitular|herramientasVisibles|contactosVisibles|prisma/, 'la regla vive en menu-visible.ts, no aquí')
  assert.match(src, /error: 'sin_acceso',\s*mensaje: '/, 'misma forma de error que el portal: { error, mensaje }')
})

test('🚨 la regla pura: escritura con los null tomados como «no», lectura igual que el menú', () => {
  const src = sinComentarios(readFileSync(join(ROOT, 'packages/module-seguros-portal/src/menu-visible.ts'), 'utf8'))
  assert.match(src, /const hechos = modo === 'escritura' \? sinDudas\(h\) : h/)
  assert.match(src, /if \(puerta === 'calendario'\) return herramientasVisibles\(hechos\)\.calendario/)
  assert.match(src, /return seOfrece\(esTitular\(hechos\)\)/)
})
