// Los 8 remates REALES capturados por `capturarResultados` hasta el 20/08/2026
// (tabla `subastas`, `resultado='con_pujas'`). Son el fixture a propósito: si
// mañana el parser del certificado empieza a leer mal, estos números dejan de
// cuadrar y el test lo canta. `node --test`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { calibracionAdjudicaciones } from '../src/adjudicaciones.ts'
import { MIN_MUESTRA_REMATE, remateEsperado, revisarTecho } from '../src/remate.ts'
import type { ResultadoConcluido } from '../src/adjudicaciones.ts'

const r = (provincia: string, valorSubasta: number, importeAdjudicacion: number): ResultadoConcluido => ({
  provincia, valorSubasta, importeAdjudicacion, resultado: 'con_pujas',
})

const REALES: ResultadoConcluido[] = [
  r('Sevilla', 169885.16, 129112.6),   // Charolistas 4 — 76% del tipo
  r('Sevilla', 165000, 669900),        // Carlos Cañal 28-A (centro) — 406%
  r('Sevilla', 739210.43, 325252.4),   // Dos Hermanas, Lope de Vega 9 — 44%
  r('Sevilla', 77746.93, 161712.72),   // Avda. Pedro Romero 2 — 208%
  r('Huelva', 210029.44, 126017.7),    // Punta Umbría, tipo F — 60%
  r('Huelva', 420800, 277728),         // Punta Umbría, Bulevar del Agua — 66%
  r('Asturias', 102697.88, 55456.65),  // Oviedo, Celestino Mendizábal — 54%
  r('Cádiz', 275206, 170627.72),       // El Puerto, Virgen de los Milagros — 62%
]

const CALIBRACION = calibracionAdjudicaciones(REALES)
const global = CALIBRACION.find((z) => z.provincia === '(todas)')!

test('la muestra real: 8 remates, ninguno desierto, mediana global del 64% del tipo', () => {
  assert.equal(global.muestra, 8)
  assert.equal(global.adjudicadas, 8)
  assert.equal(global.desiertas, 0)
  assert.equal(Math.round(global.ratioMediano! * 100), 64)
})

test('remateEsperado: sin muestra suficiente NO estima — dice cuántos casos faltan', () => {
  const vacio = remateEsperado(200000, 'Sevilla', [])
  assert.equal(vacio.importe, null)
  assert.equal(vacio.base, null)
  assert.match(vacio.lectura, /Todavía no hemos visto ningún remate/)

  // Dos remates no bastan: el umbral es explícito, no una casualidad del corpus.
  const flojo = calibracionAdjudicaciones(REALES.slice(4, 6)) // los dos de Huelva
  assert.equal(remateEsperado(200000, 'Lugo', flojo).importe, null)
  assert.ok(MIN_MUESTRA_REMATE > 2)
})

test('remateEsperado: usa la muestra de SU provincia y cae al agregado si no llega', () => {
  // Huelva tiene 2 remates: por debajo del mínimo → agregado global (64%).
  const huelva = remateEsperado(300000, 'Huelva', CALIBRACION)
  assert.equal(huelva.base, 'global')
  assert.equal(Math.round(huelva.importe!), Math.round(300000 * global.ratioMediano!))

  // Sevilla tiene 4: manda su propia mediana, que es MUY distinta de la global
  // (dos remates de centro a 2x y 4x el tipo la tiran hacia arriba).
  const sevilla = remateEsperado(200000, 'Sevilla', CALIBRACION)
  assert.equal(sevilla.base, 'provincia')
  assert.equal(sevilla.muestra, 4)
  assert.ok(sevilla.ratio! > 1, 'en Sevilla la mediana real supera el tipo de salida')
  assert.match(sevilla.lectura, /4 remates reales/)
})

test('revisarTecho: EL CASO REAL de Dos Hermanas — techo por encima del tipo con mercado orientativo', () => {
  // tipo 739.210,43€ y un «techo» de 887.052,43€ salido de la mediana del
  // municipio: no es una puja agresiva, es un número sin fundamento.
  const v = revisarTecho({
    techo: 887052.43,
    valorSubasta: 739210.43,
    valorOrientativo: true,
    remate: remateEsperado(739210.43, 'Sevilla', CALIBRACION),
  })
  assert.equal(v.fiable, false)
  assert.match(v.motivo!, /por encima del propio tipo/)
  assert.match(v.aviso!, /Techo no fiable/)
})

test('revisarTecho: por encima del tipo con valor de mercado PROPIO sí es legítimo', () => {
  // Carlos Cañal se remató a 4x el tipo: pagar por encima del tipo no es un
  // error en sí. Lo que lo invalida es que el valor de mercado sea orientativo.
  const v = revisarTecho({
    techo: 300000,
    valorSubasta: 165000,
    valorOrientativo: false,
    remate: remateEsperado(165000, 'Sevilla', CALIBRACION),
  })
  assert.equal(v.fiable, true)
  assert.equal(v.motivo, null)
})

test('revisarTecho: avisa cuando el techo se queda corto frente al remate esperado', () => {
  // Nuestro techo en Carlos Cañal fue 113.971€ sobre un tipo de 165.000€: por
  // debajo de lo que la muestra de Sevilla dice que se paga → no competiríamos.
  const corto = revisarTecho({
    techo: 113971,
    valorSubasta: 165000,
    valorOrientativo: false,
    remate: remateEsperado(165000, 'Sevilla', CALIBRACION),
  })
  assert.equal(corto.fiable, true)
  assert.match(corto.aviso!, /probablemente NO ganes/)

  const holgado = revisarTecho({
    techo: 500000,
    valorSubasta: 165000,
    valorOrientativo: false,
    remate: remateEsperado(165000, 'Sevilla', CALIBRACION),
  })
  assert.match(holgado.aviso!, /por encima del remate esperado/)
})

test('revisarTecho: sin techo no se calla — enseña el remate esperado', () => {
  const v = revisarTecho({
    techo: null,
    valorSubasta: 210029.44,
    valorOrientativo: false,
    remate: remateEsperado(210029.44, 'Huelva', CALIBRACION),
  })
  assert.equal(v.fiable, false)
  assert.match(v.motivo!, /No hay valor de mercado/)
  assert.match(v.aviso!, /se remata de mediana/)
})

test('formato español del dinero en todo lo que se enseña', () => {
  const v = remateEsperado(200000, 'Huelva', CALIBRACION)
  assert.match(v.lectura, /\d{1,3}(\.\d{3})*,\d{2}€/)
  assert.doesNotMatch(v.lectura, /€\d/)
})
