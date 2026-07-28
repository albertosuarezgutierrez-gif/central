// Tests del coste REAL de adquisición. Aquí se decide si una subasta es negocio,
// así que cada partida va cubierta. `node --test`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { calcularCoste, deposito, LANZAMIENTO_ESTIMADO } from '../src/costes.ts'
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
