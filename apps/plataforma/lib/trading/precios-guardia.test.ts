import test from 'node:test'
import assert from 'node:assert/strict'
import { filtrarPreciosAnomalos, resumenDescartes, contrastarFuentes, resumenDivergencias, saltoDeSaldo, detectarSuplantaciones, resumenSuplantaciones, SALTO_PRECIO_DIA_MAX } from './precios-guardia.ts'

test('el caso real del 03/08/2026: CVX a 590,17 con referencia 192,31 se descarta', () => {
  const { limpios, descartados } = filtrarPreciosAnomalos({ CVX: 590.17 }, { CVX: 192.31 })
  assert.equal(limpios.CVX, undefined)
  assert.equal(descartados.length, 1)
  assert.equal(descartados[0].simbolo, 'CVX')
  assert.ok(descartados[0].ratio! > 3)
})

test('un movimiento normal pasa intacto', () => {
  const precios = { CVX: 190.41, MSFT: 487.46, SPY: 769.79 }
  const { limpios, descartados } = filtrarPreciosAnomalos(precios, { CVX: 193.18, MSFT: 492.82, SPY: 771.24 })
  assert.deepEqual(limpios, precios)
  assert.equal(descartados.length, 0)
})

test('sin referencia NO se juzga: el precio pasa (un símbolo nuevo no tiene con qué compararse)', () => {
  const { limpios, descartados } = filtrarPreciosAnomalos({ NUEVO: 12.5 }, {})
  assert.equal(limpios.NUEVO, 12.5)
  assert.equal(descartados.length, 0)
})

test('una referencia inválida (0) tampoco juzga: no convierte un «no lo sé» en descarte', () => {
  const { limpios, descartados } = filtrarPreciosAnomalos({ X: 100 }, { X: 0 })
  assert.equal(limpios.X, 100)
  assert.equal(descartados.length, 0)
})

test('el desplome simétrico también se caza (÷2, no solo ×2)', () => {
  const { limpios, descartados } = filtrarPreciosAnomalos({ X: 45 }, { X: 190 })
  assert.equal(limpios.X, undefined)
  assert.equal(descartados.length, 1)
  assert.ok(descartados[0].ratio! < 0.5)
})

test('precios imposibles se descartan aunque no haya referencia', () => {
  const { limpios, descartados } = filtrarPreciosAnomalos({ A: 0, B: -5, C: Number.NaN }, {})
  assert.deepEqual(limpios, {})
  assert.equal(descartados.length, 3)
  assert.ok(descartados.every(d => d.referencia === null))
})

test('el umbral es el límite exacto: justo por debajo pasa, justo en el umbral no', () => {
  assert.equal(filtrarPreciosAnomalos({ X: 199 }, { X: 100 }).limpios.X, 199)
  assert.equal(filtrarPreciosAnomalos({ X: 200 }, { X: 100 }).limpios.X, undefined)
  assert.equal(SALTO_PRECIO_DIA_MAX, 2)
})

test('descartar un símbolo no arrastra a los demás de la misma pasada', () => {
  const { limpios, descartados } = filtrarPreciosAnomalos(
    { CVX: 590.17, MSFT: 487.46 },
    { CVX: 192.31, MSFT: 492.82 },
  )
  assert.deepEqual(limpios, { MSFT: 487.46 })
  assert.equal(descartados.length, 1)
})

test('resumenDescartes: cadena vacía cuando no hay nada que contar', () => {
  assert.equal(resumenDescartes([]), '')
  assert.match(resumenDescartes(filtrarPreciosAnomalos({ CVX: 590.17 }, { CVX: 192.31 }).descartados), /^1 precio\(s\) descartado\(s\): CVX 590\.17/)
})

// --- contraste con la segunda fuente ---

test('contraste: precios de acuerdo con la 2ª fuente pasan', () => {
  const { conformes, divergentes, sinContraste } = contrastarFuentes(
    { CVX: 193.18, MSFT: 487.46 },
    { CVX: 193.18, MSFT: 487.20 },
  )
  assert.deepEqual(conformes, { CVX: 193.18, MSFT: 487.46 })
  assert.equal(divergentes.length, 0)
  assert.equal(sinContraste.length, 0)
})

test('contraste: el CVX del 03/08 lo habría cazado la 2ª fuente aunque la referencia fuera de ayer', () => {
  const { conformes, divergentes } = contrastarFuentes({ CVX: 590.17 }, { CVX: 193.18 })
  assert.equal(conformes.CVX, undefined)
  assert.equal(divergentes.length, 1)
  assert.ok(divergentes[0].desvio > 2)
})

test('contraste: caza el error del 10% que la guardia del ×2 deja pasar', () => {
  // 212,50 contra 193,18 real: +10%. Para la guardia del ×2 es un día movido y pasa; aquí no.
  assert.equal(filtrarPreciosAnomalos({ CVX: 212.5 }, { CVX: 193.18 }).limpios.CVX, 212.5)
  assert.equal(contrastarFuentes({ CVX: 212.5 }, { CVX: 193.18 }).divergentes.length, 1)
})

test('contraste: sin dato de la 2ª fuente NO se juzga — el precio pasa y queda anotado', () => {
  const { conformes, divergentes, sinContraste } = contrastarFuentes({ NUEVO: 12.5 }, {})
  assert.equal(conformes.NUEVO, 12.5)
  assert.equal(divergentes.length, 0)
  assert.deepEqual(sinContraste, ['NUEVO'])
})

test('contraste: el umbral es simétrico y se respeta en el borde', () => {
  assert.equal(contrastarFuentes({ X: 102 }, { X: 100 }).divergentes.length, 0)     // +2% justo
  assert.equal(contrastarFuentes({ X: 102.5 }, { X: 100 }).divergentes.length, 1)   // +2,5%
  assert.equal(contrastarFuentes({ X: 97.5 }, { X: 100 }).divergentes.length, 1)    // −2,5%
})

test('resumenDivergencias: vacío cuando no hay nada, con signo cuando lo hay', () => {
  assert.equal(resumenDivergencias([]), '')
  const txt = resumenDivergencias(contrastarFuentes({ CVX: 590.17 }, { CVX: 193.18 }).divergentes)
  assert.match(txt, /CVX 590\.17 vs 193\.18/)
})

// --- suplantación: el precio es de otra empresa ---
//
// Los tres casos son las pasadas REALES que envenenaron el corpus, con los precios tal cual quedaron
// en `trading_tesis` y los cierres verdaderos contrastados contra IBKR. La lección del PR #1189 es que
// un fixture inventado se escribe con la misma suposición equivocada que el código, así que aquí no
// hay números de adorno: si un día estos tests dejan de pasar, es que la guardia dejó de ver el bug
// que ya ocurrió tres veces.

// Payload del 17/07/2026 — primera pasada del corpus, hecha a mano: NINGÚN símbolo tenía referencia.
const PASADA_17_07 = {
  CVX: 187.38, IWM: 294.04, LLY: 1179.11, META: 393.82, MSFT: 478.14, NFLX: 1179.11,
  NVDA: 202.81, NVO: 50.32, PLTR: 132.38, QQQ: 695.33, RBLX: 51.68, SPOT: 68.95, SPY: 743.29,
}

// Cierres del 31/07/2026, que son las referencias con las que corrió la pasada del 03/08.
const REFERENCIAS_31_07 = {
  CVX: 192.31, IWM: 292.59, LLY: 1154.97, META: 539.03, MSFT: 451.10, NFLX: 73.17,
  NVDA: 195.04, NVO: 51.61, PLTR: 122.26, QQQ: 683.55, RBLX: 48.67, SPOT: 522.61, SPY: 741.69,
}

test('17/07/2026 sin referencias: el duplicado exacto LLY/NFLX cae igual (NFLX se llevó el cierre de LLY)', () => {
  const { limpios, suplantados } = detectarSuplantaciones(PASADA_17_07, {})
  assert.deepEqual(suplantados.map(s => s.simbolo).sort(), ['LLY', 'NFLX'])
  assert.equal(limpios.NFLX, undefined)
  assert.equal(limpios.LLY, undefined)
  // Los otros tres barajados de ese día (META←MSFT, MSFT←SPOT, SPOT←NFLX) NO se pueden ver sin
  // referencias: son números únicos y plausibles. Los caza el contraste con la 2ª fuente, no esto.
  assert.equal(limpios.META, 393.82)
  assert.equal(Object.keys(limpios).length, 11)
})

test('03/08/2026: LLY con el cierre de CVX y META con el de LLY se cazan por cruce de referencias', () => {
  const pasada = {
    CVX: 193.18, IWM: 296.23, LLY: 193.18, META: 1121.09, MSFT: 487.58, NFLX: 73.33,
    NVDA: 206.68, NVO: 47.09, PLTR: 125.86, QQQ: 700.06, RBLX: 36.67, SPOT: 486.16, SPY: 757.67,
  }
  const { limpios, suplantados } = detectarSuplantaciones(pasada, REFERENCIAS_31_07)
  const caidos = suplantados.map(s => s.simbolo).sort()
  // CVX y LLY comparten número → duplicado; META cuadra con la referencia de LLY y no con la suya.
  assert.deepEqual(caidos, ['CVX', 'LLY', 'META'])
  assert.equal(suplantados.find(s => s.simbolo === 'META')!.culpable, 'LLY')
  assert.equal(limpios.META, undefined)
  // Y lo que NO puede caer: los movimientos REALES y gordos de ese día siguen su camino.
  assert.equal(limpios.MSFT, 487.58)   // +8,1% real sobre su referencia
  assert.equal(limpios.RBLX, 36.67)    // −24,7% real
  assert.equal(limpios.NVO, 47.09)     // −8,8% real, a un 3,25% de la referencia de RBLX: se salva por poco
})

test('04/08/2026: NFLX se llevó el precio de PLTR — mismo número, los dos fuera', () => {
  const { limpios, suplantados } = detectarSuplantaciones(
    { NFLX: 162.61, PLTR: 162.61, META: 587.77 },
    { NFLX: 73.33, PLTR: 125.86, META: 1121.09 },
  )
  assert.deepEqual(suplantados.map(s => s.simbolo).sort(), ['NFLX', 'PLTR'])
  assert.equal(limpios.NFLX, undefined)
  assert.equal(limpios.PLTR, undefined)   // PLTR traía SU precio bueno: es el coste aceptado de vetar el par
})

test('sin referencia propia no se juzga: un símbolo que se estrena pasa aunque coincida con otro', () => {
  const { limpios, suplantados } = detectarSuplantaciones(
    { NUEVO: 192.5, CVX: 193.4 },
    { CVX: 192.31 },   // NUEVO no tiene referencia; CVX cuadra con la suya
  )
  assert.equal(suplantados.length, 0)
  assert.equal(limpios.NUEVO, 192.5)
})

test('una pasada sana no dispara nada', () => {
  const pasada = { CVX: 190.41, LLY: 1116.84, META: 587.77, NFLX: 73.57 }
  const { limpios, suplantados } = detectarSuplantaciones(pasada, { CVX: 193.18, LLY: 1121.36, META: 590.24, NFLX: 73.33 })
  assert.equal(suplantados.length, 0)
  assert.deepEqual(limpios, pasada)
})

test('resumenSuplantaciones: vacío cuando no hay nada, nombra al culpable cuando lo hay', () => {
  assert.equal(resumenSuplantaciones([]), '')
  const { suplantados } = detectarSuplantaciones({ LLY: 193.18 }, { LLY: 1154.97, CVX: 192.31 })
  assert.match(resumenSuplantaciones(suplantados), /LLY 193\.18 .*CVX/)
})

// --- salto del NAV ---

test('NAV: sin saldo anterior no se avisa (es el primero, no un salto)', () => {
  assert.deepEqual(saltoDeSaldo(10_000, null), { avisa: false, variacion: null })
  assert.deepEqual(saltoDeSaldo(10_000, 0), { avisa: false, variacion: null })
})

test('NAV: una variación normal de mercado no molesta', () => {
  const r = saltoDeSaldo(10_300, 10_000)
  assert.equal(r.avisa, false)
  assert.ok(Math.abs(r.variacion! - 0.03) < 1e-9)
})

test('NAV: un cero de más se avisa (es lo que multiplicaría el tamaño de las compras)', () => {
  const r = saltoDeSaldo(100_000, 10_000)
  assert.equal(r.avisa, true)
  assert.equal(r.variacion, 9)
})

test('NAV: también avisa a la baja (retirada real o lectura rota — Alberto decide cuál)', () => {
  const r = saltoDeSaldo(5_000, 10_000)
  assert.equal(r.avisa, true)
  assert.equal(r.variacion, -0.5)
})
