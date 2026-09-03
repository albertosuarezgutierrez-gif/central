// Guardián del CAPITAL ASEGURADO de hogar. `node --test`.
//
// ─── El fallo, medido en producción el 03/09/2026 ───────────────────────────
// La ficha de la póliza de hogar de Occident `GPDFS3000276` pintaba «sin dato»
// en Continente y en Contenido, y lo explicaba así:
//
//   «Ninguna garantía de vivienda trae capital: esta compañía las manda sin
//    importe propio. La suma asegurada viaja en el campo «Bien» del fichero
//    EIAC, que la ingesta todavía no guarda.»
//
// Las DOS frases eran falsas para esa póliza:
//
//  1. 11 de sus 40 coberturas SÍ traen `capital_asegurado` (desatascos 300€,
//     cerraduras 250€, RC del inmueble 176.043,86€, defensa jurídica 3.000€…).
//     Son sublímites y ninguno es continente ni contenido —eso es correcto—,
//     pero decir «esta compañía las manda sin importe propio» es falso.
//  2. El capital SÍ estaba guardado, en la copia gemela de esa misma póliza en
//     el volcado: `{"continente":"61000","contenido":"7000"}`.
//
// Y lo que lo hacía inexcusable: la pantalla YA estaba leyendo ese mismo objeto
// —de ahí sacaba «76 m² · construida en 1994 · Sale de la copia de esta misma
// póliza en el volcado»—. Cogía unos campos y no otros, y luego afirmaba que el
// dato no constaba. Un «no lo he mirado» disfrazado de «no lo hay», que es la
// regla dura de `CLAUDE.md`.
//
// Alcance medido en la BD ese día: 7 de las 19 pólizas de hogar vivas tienen
// continente y contenido en su gemela, y las 7 decían «sin dato».
//
// ─── Qué vigila este fichero ────────────────────────────────────────────────
// Que ni el módulo ni la UI vuelvan a afirmar que no hay capital sin haber
// mirado las dos fuentes, y que el capital del volcado nunca se pinte como si
// fuera el que manda hoy la compañía.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dirname, '..')
const leer = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')

const GARANTIAS = 'packages/module-seguros/src/garantias.ts'
const FICHA = 'apps/plataforma/app/(usuario)/correduria/poliza/[id]/page.tsx'
const PUERTO = 'apps/plataforma/lib/poliza-asegura.ts'
const CARTERA = 'apps/asegura/lib/cartera-poliza.ts'

test('🚨 la frase falsa NO puede volver: «esta compañía las manda sin importe propio»', () => {
  // Generalizaba de un LADO a toda la compañía. En GPDFS3000276 la compañía
  // manda 11 importes; lo que no manda es el capital de continente/contenido.
  for (const rel of [GARANTIAS, FICHA, PUERTO, CARTERA]) {
    const src = leer(rel)
    const codigo = src.split('\n').filter((l) => !l.trimStart().startsWith('//') && !l.trimStart().startsWith('*')).join('\n')
    assert.ok(
      !/las manda sin importe propio/.test(codigo),
      `${rel} vuelve a afirmar que la compañía no manda importes`,
    )
  }
})

test('🚨 «ninguna garantía trae capital» solo vale CONDICIONADO al lado y al número mirado', () => {
  const src = leer(GARANTIAS)
  // El motivo de `sin_capital` tiene que contar cuántas garantías DE ESE LADO
  // se han mirado. Un «Ninguna garantía…» a secas es la generalización que
  // produjo el fallo.
  assert.ok(
    /Ninguna de las \$\{delLado\.length\} garantías de \$\{lado\}/.test(src),
    'el motivo tiene que acotar la afirmación al lado y decir cuántas ha mirado',
  )
  // Y con una sola garantía no puede decir «las 1 garantías»: el texto lo lee Alberto.
  assert.ok(
    /La única garantía de \$\{lado\} no trae capital propio/.test(src),
    'falta la redacción en singular',
  )
  assert.ok(
    !/Ninguna garantía de \$\{lado\} trae capital:/.test(src),
    'la redacción vieja, que negaba en bloque, no puede volver',
  )
  // Y tiene que decir explícitamente que no habla de las demás garantías.
  assert.ok(
    /de las demás garantías de la póliza esto no dice nada/.test(src),
    'el motivo tiene que declarar que no afirma nada de las otras garantías',
  )
})

test('🚨 la ficha tiene que PINTAR el estado `del_volcado`, no dejarlo caer en «sin dato»', () => {
  const src = leer(FICHA)
  assert.ok(/case 'del_volcado':/.test(src), 'la ficha no pinta el capital del volcado')
  // Y con su procedencia visible: sin el rótulo, 61.000€ de 2026 se lee como
  // el capital de hoy, que es peor que un hueco.
  assert.ok(/del volcado histórico/.test(src), 'falta el rótulo de procedencia en la tarjeta')
  assert.ok(/\{c\.motivo\}/.test(src), 'el motivo del capital del volcado tiene que salir en pantalla')
})

test('🚨 el puerto tiene que dejar pasar `del_volcado`, y solo con su motivo', () => {
  const src = leer(PUERTO)
  assert.ok(/case 'del_volcado':/.test(src), 'el puerto tira el estado nuevo y la ficha vuelve a decir «sin dato»')
  // Sin `motivo` no se acepta: es el rótulo, no un adorno.
  const bloque = src.slice(src.indexOf("case 'del_volcado':"), src.indexOf("case 'solo_sublimites':"))
  assert.ok(/motivo === null/.test(bloque), 'un capital del volcado sin rótulo no puede pintarse')
})

test('🚨 la app tiene que PASARLE la copia del volcado al módulo', () => {
  const src = leer(CARTERA)
  // El dato ya está en memoria (`datosGemela` / `datos`): si no se le pasa,
  // el módulo vuelve a ver una sola fuente y la ficha vuelve a mentir.
  assert.ok(/const datosVolcado =/.test(src), 'no se decide cuál de las dos caras es el volcado')
  assert.ok(
    /capitalesHogar\([\s\S]{0,400}?continente: datosVolcado\.continente/.test(src),
    'capitalesHogar se llama sin los capitales del volcado',
  )
  // Y no se resuelve consultando otra vez: el objeto ya estaba leído.
  assert.ok(
    /esCarteraViva\(p\) \? datosGemela : datos/.test(src),
    'la cara del volcado se elige por `esCarteraViva`, sin consulta nueva',
  )
})

test('🚨 el capital del volcado NO se cuela en `eurDeCapital`', () => {
  const src = leer(GARANTIAS)
  // `eurDeCapital` es lo que consumen el tarificador y la horquilla. Si empieza
  // a devolver el del volcado, un importe de junio de 2026 entra en un cálculo
  // de hoy sin que nadie lo haya decidido.
  const i = src.indexOf('export function eurDeCapital(')
  assert.ok(i > 0, 'no existe eurDeCapital')
  const cuerpo = src.slice(i, src.indexOf('\n}', i))
  assert.ok(!/del_volcado/.test(cuerpo), 'eurDeCapital no puede devolver el capital del volcado')
})

/* ─── Y un test de COMPORTAMIENTO, que es lo que faltaba ────────────────────
 * Todo lo de arriba lee los FUENTES con regex: vigila el cableado (que el
 * puerto no tire el estado, que la ficha lo pinte, que la app pase el objeto),
 * y eso ningún test de comportamiento lo alcanza. Pero por sí solo tiene el
 * fallo más caro que hay en un guardián: se queda VERDE mientras el módulo
 * deja de hacer el trabajo. Comprobado el 03/09/2026 — apagando la segunda
 * fuente dentro de `capitalAsegurado`, los seis tests de arriba seguían
 * pasando y solo caían los unitarios de `garantias.test.ts`.
 *
 * Así que aquí se ejecuta de verdad, con las coberturas REALES de
 * `GPDFS3000276` (las 5 del lado vivienda/mobiliario, tal cual están en
 * `seguros.poliza_coberturas`) y el objeto REAL de su gemela.
 */
// Import por ruta y no por `@central/module-seguros`: la raíz del monorepo no
// declara los paquetes como dependencia, así que el scope no resuelve aquí.
import { capitalesHogar } from '../packages/module-seguros/src/garantias.ts'

// Las 5 garantías de continente/contenido de la póliza, con su capital tal cual
// lo manda CIMA: NINGUNA trae importe. La única con capital de ese bloque es la
// RC del inmueble, y la RC no es el continente — por eso va en la lista.
const COBERTURAS_REALES = [
  { descripcion: 'Goteras procedentes de viviendas contiguas o superiores', capital: null },
  { descripcion: 'Robo del continente', capital: null },
  { descripcion: 'Robo y atraco del contenido', capital: null },
  { descripcion: 'Desperfectos al continente por robo', capital: null },
  { descripcion: 'Responsabilidad civil del inmueble', capital: 176043.86 },
]

// `datos_especificos` de la gemela `asegura_app:pol2:63`, literal.
const VOLCADO_REAL = { continente: '61000', contenido: '7000' }

test('🚨 con las coberturas y el volcado REALES, la ficha da 61.000€ y 7.000€ rotulados', () => {
  const caps = capitalesHogar(COBERTURAS_REALES, VOLCADO_REAL)

  assert.equal(caps.continente.estado, 'del_volcado')
  assert.equal(caps.contenido.estado, 'del_volcado')
  assert.equal(caps.continente.estado === 'del_volcado' && caps.continente.eur, 61000)
  assert.equal(caps.contenido.estado === 'del_volcado' && caps.contenido.eur, 7000)

  // Y con su procedencia, que es lo que impide leerlo como el capital de hoy.
  for (const c of [caps.continente, caps.contenido]) {
    assert.ok(c.estado === 'del_volcado' && c.motivo.includes('volcado histórico'))
  }
})

test('🚨 sin volcado la misma póliza NO inventa un capital, y la RC no se cuela', () => {
  const caps = capitalesHogar(COBERTURAS_REALES)
  assert.equal(caps.continente.estado, 'sin_capital')
  assert.equal(caps.contenido.estado, 'sin_capital')
  // 176.043,86 es la RC del inmueble. Que no aparezca por ningún lado.
  assert.ok(!JSON.stringify(caps).includes('176043'))
})
