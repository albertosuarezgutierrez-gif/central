// Guardián de las renovaciones VENCIDAS. `node --test` (gate en `pnpm test:guardia`).
//
// ─── Por qué existe ──────────────────────────────────────────────────────────
// Hasta el 20/09/2026 `vencimientosProximos()` consultaba
// `fechaVencimiento: { gte: hoyRef, lte: hasta }`. Una póliza que venció ayer sin
// que nadie la gestionara DEJABA DE EXISTIR para la pantalla de `/correduria`,
// para el cron de Telegram y para el contador de «Hoy» — justo cuando más urge,
// porque a partir de ahí lo que hay es una recuperación y no una renovación.
//
// Y el fallo era del tipo que este repo persigue en la regla del cepo verde: la
// urgencia `'vencida'` EXISTÍA en `@central/module-seguros`, `'vencida'` estaba
// en `URGENCIAS_ACCIONABLES` del contador y su insignia estaba montada en
// `Renovaciones.tsx`. Tres piezas correctas que **no podían ejecutarse nunca**
// desde este origen, o sea código muerto con aspecto de cobertura.
//
// Medido contra la BD ese día: 9 pólizas de Mapfre (C0058) vencidas entre el
// 05/06 y el 10/08/2026, 4.377,51 € de prima, invisibles. Más 8 con vencimiento
// de 2013-2019 y prima 0, que NO son trabajo de hoy y por eso quedan fuera de la
// lista (una anualidad de ventana) pero se DECLARAN aparte en vez de esconderse.
//
// 🧪 Estos cepos leen el FUENTE con `readFileSync` a propósito: lo que vigilan
// vive dentro de un `where` de Prisma y de un `.tsx`, donde ni `tsc` ni el build
// miran, e importar `lib/cartera.ts` arrastraría el cliente generado de Prisma —
// el job `Tests (packages + guardián)` corre SIN `prisma generate`.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dirname, '..')
const leer = (p: string) => readFileSync(join(ROOT, p), 'utf8')

const CARTERA = leer('apps/asegura/lib/cartera.ts')
const RUTA = leer('apps/asegura/app/api/operador/vencimientos/route.ts')
const SECCIONES = leer('apps/plataforma/app/(usuario)/correduria/secciones.ts')
const RENOVACIONES = leer('apps/plataforma/app/(usuario)/correduria/Renovaciones.tsx')

/** El cuerpo de `vencimientosProximos`, desde su firma hasta la función siguiente. */
function cuerpoVencimientosProximos(): string {
  const i = CARTERA.indexOf('export async function vencimientosProximos(')
  assert.notEqual(i, -1, 'vencimientosProximos ya no está en apps/asegura/lib/cartera.ts')
  const j = CARTERA.indexOf('\nexport ', i + 1)
  return CARTERA.slice(i, j === -1 ? undefined : j)
}

test('la ventana de vencimientos NO puede empezar en hoy: el pasado se pierde', () => {
  const cuerpo = cuerpoVencimientosProximos()
  // El bug exacto que se arregló. Si alguien vuelve a poner `gte: hoyRef`, las
  // vencidas desaparecen otra vez de la pantalla, del cron y del contador.
  assert.ok(
    !/fechaVencimiento:\s*\{\s*gte:\s*hoyRef/.test(cuerpo),
    'vencimientosProximos vuelve a filtrar `gte: hoyRef`: una póliza vencida ayer ' +
      'desaparece de /correduria, del cron de Telegram y del contador de «Hoy»',
  )
  // Y el borde izquierdo tiene que ser una fecha calculada hacia atrás.
  assert.match(
    cuerpo,
    /fechaVencimiento:\s*\{\s*gte:\s*desde\s*,\s*lte:\s*hasta\s*\}/,
    'el rango de fechas ya no es `{ gte: desde, lte: hasta }`',
  )
})

test('el corte hacia atrás sale del vocabulario del módulo, no de un número suelto', () => {
  const cuerpo = cuerpoVencimientosProximos()
  // Una anualidad (LCS art. 22): más atrás, la fila ya no describe la anualidad
  // en curso. El valor vive en @central/module-seguros y NO se teclea aquí.
  assert.match(cuerpo, /const desde = inicioVentanaRecuperacion\(hoyRef, diasAtras\)/)
  assert.match(cuerpo, /diasAtras: number = DIAS_ANUALIDAD/)
  assert.ok(
    CARTERA.includes('inicioVentanaRecuperacion,') && CARTERA.includes('DIAS_ANUALIDAD,'),
    'cartera.ts ya no importa el corte de @central/module-seguros',
  )
})

test('las vencidas de hace años se CUENTAN aparte, no se esconden', () => {
  assert.match(
    CARTERA,
    /export async function vencidasFueraDeVentana\(/,
    'sin este recuento, las vigentes con vencimiento de hace años desaparecen sin dejar rastro',
  )
  const i = CARTERA.indexOf('export async function vencidasFueraDeVentana(')
  const cuerpo = CARTERA.slice(i, CARTERA.indexOf('\nexport ', i + 1))
  // El MISMO borde que usa la lista: si divergen, hay filas que no salen en
  // ninguna de las dos y nadie se entera.
  assert.match(cuerpo, /fechaVencimiento:\s*\{\s*lt:\s*inicioVentanaRecuperacion\(hoyRef, diasAtras\)\s*\}/)
  // Y un fallo de lectura es `null`, nunca 0 («la cartera está limpia»).
  assert.match(cuerpo, /Promise<number \| null>/)
  assert.match(cuerpo, /catch[\s\S]*?return null/)
})

test('el puerto publica la ventana y el recuento de las antiguas', () => {
  assert.match(RUTA, /vencidasFueraDeVentana/)
  assert.match(RUTA, /diasAtras: DIAS_ANUALIDAD/)
  assert.match(RUTA, /vencidasAntiguas/)
})

test('«vencida» sigue contando como trabajo de HOY en el contador', () => {
  // Ojo con el corte: el TIPO de la constante lleva su propio `]`
  // (`readonly string[]`), así que el bloque empieza en el `= [` de la asignación.
  const i = SECCIONES.indexOf('export const URGENCIAS_ACCIONABLES')
  assert.notEqual(i, -1, 'URGENCIAS_ACCIONABLES ya no está en secciones.ts')
  const abre = SECCIONES.indexOf('= [', i)
  const bloque = SECCIONES.slice(abre, SECCIONES.indexOf(']', abre))
  assert.ok(
    /'vencida'/.test(bloque),
    "sin 'vencida' en URGENCIAS_ACCIONABLES, una póliza ya vencida no suma en el badge de «Hoy»",
  )
})

test('la pantalla NO puede anunciar una vencida como «en -N días»', () => {
  assert.ok(
    !/en \$\{p\.dias\} días/.test(RENOVACIONES),
    'Renovaciones.tsx vuelve a pintar el plazo sin mirar el signo: una vencida hace 41 ' +
      'días se anuncia como «en -41 días»',
  )
  assert.match(RENOVACIONES, /descripcionDias\(p\.dias\)/)
})

test('una vencida no puede parecer una que vence dentro de 40 días', () => {
  // La insignia (que existía y no se podía pintar) y el realce de la fila.
  assert.match(RENOVACIONES, /vencida: \{ label: 'Vencida', tono: 'negativo' \}/)
  assert.match(RENOVACIONES, /const vencida = p\.dias < 0/)
  assert.ok(
    /vencida \? \{ background: 'var\(--negative-bg\)' \}/.test(RENOVACIONES),
    'la fila vencida ya no se separa visualmente del resto de la lista',
  )
})

test('las antiguas se declaran con TRES estados: no llega / no se pudo contar / N', () => {
  assert.match(RENOVACIONES, /vencidasAntiguas\?: number \| null/)
  // `undefined` (la versión desplegada de asegura no lo manda) y `null` (se
  // intentó y no se pudo) no se colapsan, y ninguno de los dos se pinta como 0.
  // El titular vive en un helper PURO (regla global: fuera del JSX), y sus tres
  // frases las prueba `secciones.test.ts` de verdad, no por regex. Aquí solo se
  // vigila que la pantalla DELEGUE en él en vez de reescribir el texto.
  const i = RENOVACIONES.indexOf('function PieAntiguas(')
  assert.notEqual(i, -1, 'PieAntiguas ya no existe: las antiguas se pintan sin sus tres estados')
  const pie = RENOVACIONES.slice(i, RENOVACIONES.indexOf('\n}', i))
  assert.match(
    pie, /textoVencidasAntiguas\(n\)/,
    'PieAntiguas ha vuelto a escribir el texto en el JSX: los tres estados dejan de estar probados',
  )
  assert.match(SECCIONES, /export function textoVencidasAntiguas\(n: number \| null \| undefined\)/)
})

test('la LISTA VACÍA también declara las antiguas: es donde más se lee «no hay nada»', () => {
  // Una lista vacía con 8 filas fuera de ventana invita a leer «la cartera está
  // al día». El pie se pinta en las TRES salidas: sin ninguna en la ventana,
  // con todas ocultas por el filtro «contactadas hace <14 días» (21/09/2026),
  // y bajo la tabla cuando sí hay filas visibles.
  const usos = RENOVACIONES.match(/<PieAntiguas n=\{datos\.vencidasAntiguas\} \/>/g) ?? []
  assert.equal(
    usos.length, 3,
    'PieAntiguas tiene que pintarse en las dos ramas de lista vacía Y bajo la tabla',
  )
})
