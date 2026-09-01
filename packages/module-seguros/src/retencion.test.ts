import test from 'node:test'
import assert from 'node:assert/strict'
import { resumirRetencion, retencion } from './retencion.ts'

const HOY = new Date('2026-09-01T10:00:00Z')
/** Un vencimiento a N días vista del 01/09/2026. */
function haceDias(n: number): string {
  const d = new Date(HOY)
  d.setUTCDate(d.getUTCDate() - n)
  return d.toISOString().slice(0, 10)
}

test('dentro del mes: sigue cubierto y se dice cuánto queda', () => {
  const r = retencion(haceDias(10), HOY)
  assert.equal(r.estado, 'en_plazo')
  assert.equal(r.dias, 10)
  assert.equal(r.diasParaSuspension, 20)
  assert.match(r.accion, /Aún está cubierto/)
})

test('🚨 pasado el mes la cobertura está SUSPENDIDA y es lo más urgente', () => {
  const r = retencion(haceDias(45), HOY)
  assert.equal(r.estado, 'suspendida')
  assert.equal(r.diasParaSuspension, null)
  assert.equal(r.diasParaExtincion, 135)
  assert.match(r.accion, /24 horas/, 'pagar rescata la cobertura: eso es lo que se le dice')
  assert.equal(r.prioridad, 100, 'alguien circulando sin seguro va el primero')
})

test('el borde del mes cuenta como suspendida, no como en plazo', () => {
  assert.equal(retencion(haceDias(29), HOY).estado, 'en_plazo')
  assert.equal(retencion(haceDias(30), HOY).estado, 'suspendida')
})

test('a los 6 meses ya no se rescata: retener es póliza nueva', () => {
  const r = retencion(haceDias(200), HOY)
  assert.equal(r.estado, 'extinguida')
  assert.match(r.accion, /póliza nueva/)
  assert.ok(r.prioridad < retencion(haceDias(45), HOY).prioridad)
})

test('el borde de los 6 meses', () => {
  assert.equal(retencion(haceDias(179), HOY).estado, 'suspendida')
  assert.equal(retencion(haceDias(180), HOY).estado, 'extinguida')
})

test('🚨 sin fecha NO es «recién devuelto»: se dice y va casi el primero', () => {
  const r = retencion(null, HOY)
  assert.equal(r.estado, 'sin_fecha')
  assert.equal(r.dias, null)
  assert.match(r.accion, /no se sabe/)
  // Por delante de un «en plazo»: podría ser el más viejo de la cartera.
  assert.ok(r.prioridad > retencion(haceDias(10), HOY).prioridad)
})

test('una fecha ilegible se trata como ausencia, no como hoy', () => {
  assert.equal(retencion('no-es-fecha', HOY).estado, 'sin_fecha')
})

test('el resumen separa los tres trabajos en vez de dar un total', () => {
  const r = resumirRetencion([
    { estado: 'suspendida', prima: 431.85 },
    { estado: 'suspendida', prima: null },
    { estado: 'en_plazo', prima: 100.15 },
    { estado: 'extinguida', prima: 200 },
    { estado: 'sin_fecha', prima: null },
  ])
  assert.equal(r.suspendidas, 2)
  assert.equal(r.enPlazo, 1)
  assert.equal(r.extinguidas, 1)
  assert.equal(r.sinFecha, 1)
  assert.equal(r.primaEnRiesgo, 732)
  assert.equal(r.sinPrima, 2, 'el total no se presenta como completo')
})

test('🚨 si NINGUNA informa prima, el riesgo es null y no 0,00€', () => {
  const r = resumirRetencion([{ estado: 'suspendida', prima: null }])
  assert.equal(r.primaEnRiesgo, null)
  assert.equal(r.sinPrima, 1)
})

test('lista vacía: cero de todo, que aquí sí es un dato', () => {
  const r = resumirRetencion([])
  assert.equal(r.suspendidas, 0)
  assert.equal(r.primaEnRiesgo, null)
})
