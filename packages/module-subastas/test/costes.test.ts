// Tests del coste REAL de adquisición. Aquí se decide si una subasta es negocio,
// así que cada partida va cubierta. `node --test`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { calcularCoste, deposito, LANZAMIENTO_ESTIMADO, pujaMaximaParaDescuento, yieldTuristico } from '../src/costes.ts'
import type { SubastaInmueble } from '../src/types.ts'

const base: SubastaInmueble = {
  dedupeKey: 'SUB-JA-2026-1',
  fuente: 'boe',
  tipo: 'judicial',
  valorSubasta: 100000,
  tasacion: 200000,
  cargas: 0,
  cargasConocidas: true,
  situacionPosesoria: 'libre',
  ejecutado: 'fisica',
}

test('caso limpio: remate + ITP 7% + notaría + cancelación', () => {
  const c = calcularCoste(base)
  assert.equal(c.remate, 100000)
  assert.equal(c.impuestoTransmision, 7000)
  assert.equal(c.baseImponible, 100000)
  assert.equal(c.impuestoConcepto, 'ITP 7%')
  assert.equal(c.lanzamiento, 0)
  assert.equal(c.total, 108800) // 100000 + 7000 + 1200 + 600
})

test('LA TRAMPA: el ITP se calcula sobre el valor de referencia, no sobre el remate', () => {
  const c = calcularCoste({ ...base, valorReferencia: 150000 })
  assert.equal(c.baseImponible, 150000)
  assert.equal(c.impuestoTransmision, 10500) // 7% de 150.000, no de 100.000
  assert.equal(c.total, 112300)
  assert.ok(
    c.avisos.some((a) => a.includes('valor de referencia del Catastro')),
    'debe avisar de que la base imponible no es el remate',
  )
})

test('un valor de referencia por debajo del remate no cambia la base', () => {
  const c = calcularCoste({ ...base, valorReferencia: 80000 })
  assert.equal(c.baseImponible, 100000)
  assert.equal(c.impuestoTransmision, 7000)
})

test('las cargas preferentes se suman al coste', () => {
  const c = calcularCoste({ ...base, cargas: 60000 })
  assert.equal(c.cargasPreferentes, 60000)
  assert.equal(c.total, 168800)
})

test('ejecutado empresa: tributa por IVA + AJD, no por ITP', () => {
  const c = calcularCoste({ ...base, ejecutado: 'juridica' })
  assert.equal(c.impuestoTransmision, 22200) // 21% + 1,2% de 100.000
  assert.match(c.impuestoConcepto, /IVA/)
  assert.ok(c.avisos.some((a) => a.includes('empresa')))
})

test('ejecutado desconocido: se asume ITP pero se avisa', () => {
  const c = calcularCoste({ ...base, ejecutado: 'desconocido' })
  assert.equal(c.impuestoTransmision, 7000)
  assert.ok(c.avisos.some((a) => a.includes('persona física o empresa')))
})

test('inmueble ocupado: se estima el coste de lanzamiento', () => {
  const c = calcularCoste({ ...base, situacionPosesoria: 'ocupada' })
  assert.equal(c.lanzamiento, LANZAMIENTO_ESTIMADO)
  assert.equal(c.total, 108800 + LANZAMIENTO_ESTIMADO)
})

test('cargas no publicadas: avisa aunque el importe conocido sea 0', () => {
  const c = calcularCoste({ ...base, cargasConocidas: false })
  assert.equal(c.cargasPreferentes, 0)
  assert.ok(c.avisos.some((a) => a.includes('cargas NO están publicadas')))
})

test('se puede simular un remate distinto del valor de salida', () => {
  const c = calcularCoste(base, 130000)
  assert.equal(c.remate, 130000)
  assert.equal(c.impuestoTransmision, 9100)
})

test('los parámetros de coste son sobreescribibles', () => {
  const c = calcularCoste(base, null, { tipoItp: 0.06, notariaRegistro: 0, cancelacionCargas: 0 })
  assert.equal(c.impuestoTransmision, 6000)
  assert.equal(c.total, 106000)
})

test('el depósito es el 5% del valor de subasta', () => {
  assert.equal(deposito(100000), 5000)
  assert.equal(deposito(63500), 3175)
  assert.equal(deposito(null), null)
  assert.equal(deposito(0), null)
})

// ── Puja máxima para un descuento objetivo ───────────────────────────────────

test('pujaMaximaParaDescuento: invierte el coste puerta abierta, no solo el remate', () => {
  const s: SubastaInmueble = {
    dedupeKey: 'x', fuente: 'boe', tipo: 'judicial',
    valorSubasta: 100000, tramos: 2000, cargasConocidas: true, cargas: 0,
    situacionPosesoria: 'libre', ejecutado: 'fisica',
  }
  const puja = pujaMaximaParaDescuento(s, 200000, 0.25)
  assert.ok(puja != null)
  // Con la puja devuelta, el descuento real es >= 25%…
  const con = calcularCoste(s, puja!)
  assert.ok(1 - con.total / 200000 >= 0.25)
  // …y un tramo más arriba ya NO lo sería (la puja es realmente la máxima).
  const encima = calcularCoste(s, puja! + 2000)
  assert.ok(1 - encima.total / 200000 < 0.25)
  // Alineada al tramo desde el valor de salida.
  assert.equal((puja! - 100000) % 2000, 0)
})

test('pujaMaximaParaDescuento: si los costes fijos se comen el objetivo, null', () => {
  const s: SubastaInmueble = {
    dedupeKey: 'x', fuente: 'boe', tipo: 'judicial',
    valorSubasta: 100000, cargasConocidas: true, cargas: 190000,
    situacionPosesoria: 'libre', ejecutado: 'fisica',
  }
  assert.equal(pujaMaximaParaDescuento(s, 200000, 0.25), null)
})

test('pujaMaximaParaDescuento: la base imponible por valor de referencia se respeta', () => {
  // Valor de referencia ALTO: el ITP se paga sobre él aunque el remate sea bajo,
  // así que la puja máxima debe salir más baja que sin valor de referencia.
  const base: SubastaInmueble = {
    dedupeKey: 'x', fuente: 'boe', tipo: 'judicial',
    valorSubasta: 100000, cargasConocidas: true, cargas: 0,
    situacionPosesoria: 'libre', ejecutado: 'fisica',
  }
  const sinVR = pujaMaximaParaDescuento(base, 200000, 0.25)!
  const conVR = pujaMaximaParaDescuento({ ...base, valorReferencia: 180000 }, 200000, 0.25)!
  assert.ok(conVR < sinVR)
})

// ── Yield turístico por dormitorio ───────────────────────────────────────────

test('yieldTuristico: caso directo y guardas', () => {
  // 9.000€ netos/año por dormitorio × 3 dormitorios sobre 200.000€ de coste.
  const y = yieldTuristico(9000, 3, 200000)
  assert.ok(y)
  assert.equal(y!.ingresoAnual, 27000)
  assert.equal(Math.round(y!.yieldBruto * 1000), 135) // 13,5%
  assert.equal(y!.aniosRecuperacion, 7.4)
  assert.equal(yieldTuristico(0, 3, 200000), null)
  assert.equal(yieldTuristico(9000, 0, 200000), null)
})
