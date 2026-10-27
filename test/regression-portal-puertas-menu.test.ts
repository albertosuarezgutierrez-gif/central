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

/**
 * Las de «Herramientas» (26/10/2026): [fichero o prefijo relativo a app/, puerta]. Páginas: la puerta en `lectura`
 * justo tras la sesión, a `/inicio`. APIs: GET en `lectura`, el resto en `escritura`, 403 `SIN_ACCESO`. Un prefijo
 * acabado en `/` cubre todo lo que cuelga de él (lo que nazca ahí nace con puerta o con exención).
 */
const HERRAMIENTAS: ReadonlyArray<readonly [string, 'herramientas' | 'resumen' | 'patrimonio' | 'flota' | 'catalogo']> = [
  ['(portal)/herramientas/page.tsx', 'herramientas'],
  ['(portal)/herramientas/como-funciona/', 'herramientas'],
  ['(portal)/resumen/page.tsx', 'resumen'],
  ['(portal)/patrimonio/', 'patrimonio'],
  ['api/patrimonio/', 'patrimonio'],
  ['(portal)/flota/page.tsx', 'flota'],
  ['api/flota/', 'flota'],
  ['api/modulos/route.ts', 'catalogo'],
]

/** Las que NO llevan puerta, a propósito. Quien añada una ruta aquí tiene que decir por qué. */
const EXENTAS: Record<string, string> = {
  '(portal)/patrimonio/calendario/page.tsx': 'solo redirige al calendario único, que es quien tiene la puerta',
  '(portal)/autorizaciones/page.tsx': 'el menú NO la oculta: la muda a «Cuenta» para que el autorizado acepte o deje lo que le dieron',
  'api/autorizaciones/[id]/route.ts': 'aceptar / revocar / mantener: el autorizado acepta y RENUNCIA aquí; lo decide resolver()',
  'api/recordatorios/[id]/route.ts': 'DELETE de lo PROPIO: nadie se queda sin poder borrar un recordatorio suyo',
  'api/patrimonio/codigo-postal/route.ts': 'datos PÚBLICOS del callejero (CP → municipios), no del patrimonio: los usa cualquier formulario de dirección',
  'api/patrimonio/vias/route.ts': 'datos PÚBLICOS del callejero del Catastro, no del patrimonio: los usa cualquier formulario de dirección',
  'api/oposicion-senales-patrimonio/route.ts': 'derecho de OPOSICIÓN (RGPD): se ofrece también en Configuración; nadie se queda sin poder oponerse',
  'api/cron/patrimonio-gastos/route.ts': 'cron con CRON_SECRET, sin sesión de nadie',
}

/** La puerta de Herramientas que toca a `f`, o `null` si no cae en ninguna. */
function puertaHerramienta(f: string): string | null {
  if (f in EXENTAS) return null
  const hit = HERRAMIENTAS.find(([r]) => (r.endsWith('/') ? f.startsWith(r) : f === r))
  return hit ? hit[1] : null
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
    .filter((f) => /calendario|recordatorios|autorizaciones|herramientas|resumen|patrimonio|flota|modulos/.test(f))
  assert.ok(vigiladas.length >= 50, `el recorrido no encuentra las rutas (${vigiladas.length}): ¿se movió app/?`)
  const clasificadas = new Set([...CON_PUERTA.map(([f]) => f), ...Object.keys(EXENTAS)])
  for (const f of vigiladas) {
    assert.ok(clasificadas.has(f) || puertaHerramienta(f) !== null, `${f} no tiene puerta ni exención: clasifícala en este cepo`)
  }
  for (const f of clasificadas) assert.ok(vigiladas.includes(f), `${f} ya no existe: quítala del cepo`)
  for (const [r] of HERRAMIENTAS) assert.ok(vigiladas.some((f) => (r.endsWith('/') ? f.startsWith(r) : f === r)), `${r} ya no existe: quítala del cepo`)
})

function rutasDeHerramientas(): Array<[string, string]> {
  return ficheros(APP)
    .map((f) => relative(APP, f))
    .filter((f) => /(^|\/)(page|route)\.tsx?$/.test(f))
    .flatMap((f) => {
      const p = puertaHerramienta(f)
      return p === null || CON_PUERTA.some(([c]) => c === f) ? [] : [[f, p] as [string, string]]
    })
}

test('🚨 cada página de Herramientas cierra a /inicio con su puerta en modo lectura, JUSTO tras la sesión', () => {
  const paginas = rutasDeHerramientas().filter(([f]) => f.endsWith('page.tsx'))
  assert.ok(paginas.length >= 10, `no encuentra las páginas (${paginas.length})`)
  for (const [f, puerta] of paginas) {
    const src = leer(f)
    const re = new RegExp(`if \\(!identidad\\) redirect\\('/'\\)\\n\\s*if \\(!\\(await puertaDeSesion\\('${puerta}', 'lectura'\\)\\)\\) redirect\\('/inicio'\\)`)
    assert.match(src, re, `${f}: falta la puerta '${puerta}' justo tras comprobar la sesión`)
    assert.equal(src.match(/puertaDeSesion\(/g)?.length, 1, `${f}: una sola puerta`)
  }
})

test('🚨 cada API de Herramientas: GET con puerta en lectura y escrituras en escritura, 403 SIN_ACCESO antes del cuerpo', () => {
  const apis = rutasDeHerramientas().filter(([f]) => f.endsWith('route.ts'))
  assert.ok(apis.length >= 25, `no encuentra las APIs (${apis.length})`)
  for (const [f, puerta] of apis) {
    const src = leer(f)
    const metodos = [...src.matchAll(/export async function (GET|POST|PUT|PATCH|DELETE)\b/g)]
    assert.ok(metodos.length > 0, `${f}: no hay métodos`)
    for (const m of metodos) {
      const sig = src.indexOf('\nexport ', m.index + 1)
      const cuerpo = src.slice(m.index, sig === -1 ? undefined : sig)
      const modo = m[1] === 'GET' ? 'lectura' : 'escritura'
      const re = new RegExp(`if \\(!\\(await puertaDeSesion\\('${puerta}', '${modo}'\\)\\)\\) return NextResponse\\.json\\(SIN_ACCESO, \\{ status: 403 \\}\\)`)
      const i = cuerpo.search(re)
      assert.ok(i > 0, `${f} ${m[1]}: falta la puerta '${puerta}' en modo '${modo}'`)
      const sesion = cuerpo.indexOf('requireIdentidad()')
      assert.ok(sesion > 0 && sesion < i, `${f} ${m[1]}: la puerta va después de la sesión`)
      for (const leeCuerpo of ['req.json()', 'req.formData()']) {
        const j = cuerpo.indexOf(leeCuerpo)
        assert.ok(j === -1 || i < j, `${f} ${m[1]}: la puerta va antes de ${leeCuerpo}`)
      }
      const responde = cuerpo.search(/responder\w*\(|puertos\w*\(|prisma\./)
      assert.ok(responde === -1 || i < responde, `${f} ${m[1]}: la puerta va antes de leer o escribir nada`)
    }
  }
})

test('🚨 /resumen: solo pólizas PROPIAS (vínculo) y aportadas por esta identidad; nada autorizado ni de terceros', () => {
  const src = leer('(portal)/resumen/page.tsx')
  assert.match(src, /const propias = cartera\.propias\n/)
  assert.match(src, /polizasDelResumen\(propias\)/, 'fuera las de otro tomador donde solo figura (figuraTitular)')
  assert.match(src, /where: \{ identidadId: identidad\.id, \.\.\.DECLARADA_NO_ELIMINADA \}/)
  assert.doesNotMatch(src, /cartera\.(autorizadas|intervinientes|representadas)|\.autorizadas\b/, 'el resumen NO suma lo que otros te dejan ver')
  const lib = sinComentarios(readFileSync(join(ROOT, 'apps/asegura-portal/lib/resumen-anual.ts'), 'utf8'))
  assert.match(lib, /t\.polizas\.filter\(\(p\) => p\.figuraTitular === undefined\)/)
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
  assert.match(src, /if \(puerta === 'conceder'\) return seOfrece\(esTitular\(hechos\)\)/)
  assert.match(src, /const ver = herramientasVisibles\(hechos\)\n\s*return puerta === 'herramientas' \? ver\.alguna : ver\[puerta\]/)
})
