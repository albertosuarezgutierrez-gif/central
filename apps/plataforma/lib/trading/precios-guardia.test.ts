import test from 'node:test'
import assert from 'node:assert/strict'
import { filtrarPreciosAnomalos, resumenDescartes, contrastarFuentes, resumenDivergencias, saltoDeSaldo, SALTO_PRECIO_DIA_MAX } from './precios-guardia.ts'

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
