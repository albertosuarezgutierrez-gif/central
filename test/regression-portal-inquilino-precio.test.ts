// Guardián de «El inquilino PIDE precio» (27/10/2026, punto 5 de docs/ESTUDIO-PATRIMONIO-MERCADO.md §7).
//
// Lo que sostiene (cada brazo con su detector sintético):
//   1. El PROPIETARIO nunca ve la petición ni la casilla: solo el flujo del inquilino (y el puente de asegura) nombra estas
//      piezas; ningún fichero de patrimonio, de la bóveda ni de plataforma las importa.
//   2. Lo que el propietario SÍ lee de asegura (peticiones abiertas por inmueble, señales) no puede casar con el origen nuevo.
//   3. Casilla de ofertas NO premarcada y APARTE: estado inicial `false`, sin `defaultChecked`; la petición no la manda al puente.
//   4. El puente lleva la identidad de la COOKIE y cinco campos escritos a mano (nada de `...x`, nada del contrato).
// Los comentarios se quitan antes de mirar.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dirname, '..')
const sinComentarios = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
const leer = (f: string) => sinComentarios(readFileSync(join(ROOT, f), 'utf8'))

const P = 'apps/asegura-portal'
const PANTALLA = `${P}/app/mi-alquiler/[contratoId]/PedirPrecioInquilino.tsx`
const PAGINA = `${P}/app/mi-alquiler/[contratoId]/page.tsx`
const LOGICA = `${P}/lib/inquilino/precio-inquilino.ts`
const PUENTE = `${P}/lib/inquilino/precio-puente.ts`
const RUTA = `${P}/app/api/inquilino/[contratoId]/pedir-precio/route.ts`
const A_REGLAS = 'apps/asegura/lib/patrimonio-inquilino-precio-reglas.ts'
const A_BD = 'apps/asegura/lib/patrimonio-inquilino-precio-portal.ts'
const A_RUTA = 'apps/asegura/app/api/portal/patrimonio/inquilino-precio/route.ts'

const ficheros = (): string[] =>
  execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
    .split('\n')
    .filter((f) => /\.(ts|tsx)$/.test(f) && !f.includes('node_modules') && !/\.test\.tsx?$/.test(f) && !f.startsWith('test/'))

/** Quién puede nombrar las piezas de la petición del inquilino. Añadir un fichero aquí es una DECISIÓN. */
const PERMITIDOS = new Set([PANTALLA, PAGINA, LOGICA, PUENTE, RUTA, `${P}/lib/inquilino/precio-inquilino-textos.ts`, A_REGLAS, A_BD, A_RUTA])
const PIEZAS = /PedirPrecioInquilino|inquilino\/precio-(inquilino|puente)|inquilino-precio|pedirPrecioInquilino|ORIGEN_INQUILINO_PRECIO|'portal:inquilino'/

export function infractores(fs: ReadonlyArray<{ f: string; src: string }>): string[] {
  return fs.filter(({ f, src }) => !PERMITIDOS.has(f) && PIEZAS.test(src)).map(({ f }) => f)
}

test('el detector muerde (brazos sintéticos)', () => {
  assert.deepEqual(infractores([{ f: `${P}/lib/patrimonio/x.ts`, src: "import { responderPedirPrecioInquilino } from '../inquilino/precio-inquilino'" }]), [`${P}/lib/patrimonio/x.ts`])
  assert.deepEqual(infractores([{ f: 'apps/plataforma/lib/y.ts', src: "where origen = 'portal:inquilino'" }]), ['apps/plataforma/lib/y.ts'])
  assert.deepEqual(infractores([{ f: PANTALLA, src: 'PedirPrecioInquilino' }]), [])
})

test('🚨 el PROPIETARIO no ve la petición: fuera del flujo del inquilino nadie nombra sus piezas', () => {
  const fs = ficheros().map((f) => ({ f, src: leer(f) }))
  assert.ok(fs.some(({ f }) => f === LOGICA), 'el cepo no ve la lógica de la petición')
  assert.deepEqual(infractores(fs), [], 'estos ficheros nombran la petición del inquilino fuera de su flujo')
})

test('🚨 lo que el propietario lee de asegura no casa con el origen del inquilino', () => {
  const reglas = leer(A_REGLAS)
  const origen = /export const ORIGEN_INQUILINO_PRECIO = '([^']+)'/.exec(reglas)?.[1]
  assert.ok(origen, 'no encuentro el origen')
  // Peticiones abiertas por inmueble (lo que lee el portal del propietario): origen EXACTO `portal:patrimonio` + inmueble.
  const pedir = leer('apps/asegura/lib/patrimonio-pedir-precio-portal.ts')
  assert.match(pedir, /o\.info_riesgo->>'origen' = \$\{ORIGEN_PORTAL_PATRIMONIO\}/)
  assert.match(pedir, /o\.info_riesgo->>'inmuebleId' is not null/)
  assert.notEqual(origen, 'portal:patrimonio')
  // Señales: prefijo `portal:patrimonio%`.
  assert.match(leer('apps/asegura/lib/patrimonio-senales.ts'), /like 'portal:patrimonio%'/)
  assert.ok(!origen.startsWith('portal:patrimonio'), 'el origen del inquilino cae en el prefijo de las señales del propietario')
  // Y la petición no lleva nada que la ate a un inmueble o contrato.
  assert.doesNotMatch(reglas.slice(reglas.indexOf('CLAVES_INFO_RIESGO'), reglas.indexOf('CLAVES_INFO_RIESGO') + 120), /inmueble|contrato|titular/i)
})

test('🚨 casilla de ofertas NO premarcada y APARTE de la petición', () => {
  const ui = leer(PANTALLA)
  assert.match(ui, /const \[ofertas, setOfertas\] = useState\(false\)/)
  assert.doesNotMatch(ui, /defaultChecked/)
  assert.match(ui, /type="checkbox" checked=\{ofertas\}/)
  // Solo el booleano estricto cuenta como «sí»; la petición no escribe nada si no se marca.
  const logica = leer(LOGICA)
  assert.match(logica, /const ofertas = b\.ofertas === true/)
  assert.match(logica, /return ofertas === true \? \{ concedido: true/)
  // El consentimiento no cruza el puente.
  assert.doesNotMatch(leer(PUENTE), /ofertas|consentimiento|versionOfertas/i)
  assert.doesNotMatch(leer(A_RUTA) + leer(A_BD), /ofertas|consent_logs/i)
})

test('🚨 el puente lleva la identidad de la COOKIE y cinco campos escritos a mano', () => {
  assert.match(leer(RUTA), /requireIdentidad\(\)/)
  assert.match(leer(RUTA), /puertosInquilino\(identidad\.id\)/)
  assert.match(leer(LOGICA), /p\.pedirPorPuente\(\{ identidadId: p\.identidadId, \.\.\.r\.solicitud \}\)/)
  assert.match(
    leer(PUENTE),
    /JSON\.stringify\(\{ identidadId: x\.identidadId, que: x\.que, nombre: x\.nombre, canal: x\.canal, contacto: x\.contacto \}\)/,
  )
  assert.doesNotMatch(leer(PUENTE), /\.\.\.x\b/)
  assert.doesNotMatch(leer(PUENTE), /console\.[a-z]+\([^)]*(nombre|contacto)/)
})

test('responsive y marca: botones ≥44 px y el responsable sale de MEDIADOR, no tecleado', () => {
  const ui = leer(PANTALLA)
  const botones = ui.split('<button').slice(1).map((b) => b.slice(0, b.indexOf('</button>')))
  assert.ok(botones.length >= 3)
  for (const b of botones) assert.match(b, /minHeight: 44/, `botón sin 44 px: ${b}`)
  assert.doesNotMatch(ui, /28823484E|CS-F\/0170|hola@grupoasegura\.es|Alberto Suárez/)
  assert.match(leer(PAGINA), /claveDgsfp: MEDIADOR\.identidad\.claveDgsfp/)
})

test('🚨 la política de privacidad publica el apartado del inquilino (y la versión de los textos subió)', async () => {
  const pagina = leer(`${P}/app/legal/privacidad/page.tsx`)
  assert.match(pagina, /^\s*<ApartadoInquilino \/>/m)
  const ap = leer(`${P}/app/legal/privacidad/ApartadoInquilino.tsx`)
  assert.match(ap, /id="inquilino"/, 'la pantalla enlaza a /legal/privacidad#inquilino')
  assert.match(ap, /art\. 6\.1\.b RGPD/)
  assert.match(ap, /6\.1\.a RGPD/)
  assert.match(ap, /Tu propietario no lo ve/)
  assert.doesNotMatch(ap, /28823484E|CS-F\/0170|hola@grupoasegura\.es/, 'los datos del mediador salen de MEDIADOR')
  const m = (await import('../packages/module-seguros/src/mediador.ts')) as Record<string, unknown>
  assert.notEqual(m.VERSION_TEXTOS_LEGALES, '2026-10-v2', 'cambió la política: sube VERSION_TEXTOS_LEGALES')
})
