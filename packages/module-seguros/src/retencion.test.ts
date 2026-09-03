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
  const r = retencion(haceDias(10), 'devuelto', HOY)
  assert.equal(r.estado, 'en_plazo')
  assert.equal(r.dias, 10)
  assert.equal(r.diasParaSuspension, 20)
  assert.match(r.accion, /Aún está cubierto/)
})

test('🚨 pasado el mes la cobertura está SUSPENDIDA y es lo más urgente', () => {
  const r = retencion(haceDias(45), 'devuelto', HOY)
  assert.equal(r.estado, 'suspendida')
  assert.equal(r.diasParaSuspension, null)
  assert.equal(r.diasParaExtincion, 135)
  assert.match(r.accion, /24 horas/, 'pagar rescata la cobertura: eso es lo que se le dice')
  assert.equal(r.prioridad, 100, 'alguien circulando sin seguro va el primero')
})

test('el borde del mes cuenta como suspendida, no como en plazo', () => {
  assert.equal(retencion(haceDias(29), 'devuelto', HOY).estado, 'en_plazo')
  assert.equal(retencion(haceDias(30), 'devuelto', HOY).estado, 'suspendida')
})

test('a los 6 meses ya no se rescata: retener es póliza nueva', () => {
  const r = retencion(haceDias(200), 'devuelto', HOY)
  assert.equal(r.estado, 'extinguida')
  assert.match(r.accion, /póliza nueva/)
  assert.ok(r.prioridad < retencion(haceDias(45), 'devuelto', HOY).prioridad)
})

test('el borde de los 6 meses', () => {
  assert.equal(retencion(haceDias(179), 'devuelto', HOY).estado, 'suspendida')
  assert.equal(retencion(haceDias(180), 'devuelto', HOY).estado, 'extinguida')
})

test('🚨 sin fecha NO es «recién devuelto»: se dice y va casi el primero', () => {
  const r = retencion(null, 'devuelto', HOY)
  assert.equal(r.estado, 'sin_fecha')
  assert.equal(r.dias, null)
  assert.match(r.accion, /no se sabe/)
  // Por delante de un «en plazo»: podría ser el más viejo de la cartera.
  assert.ok(r.prioridad > retencion(haceDias(10), 'devuelto', HOY).prioridad)
})

test('una fecha ilegible se trata como ausencia, no como hoy', () => {
  assert.equal(retencion('no-es-fecha', 'devuelto', HOY).estado, 'sin_fecha')
})

// ── 🚨 «no consta cobrado» NO es «sin cobertura» ────────────────────────────
// Caso fundacional (03/09/2026): recibo de hogar de Mapfre en situación
// `pendiente`, vencido hacía 56 días, sobre una póliza EN VIGOR. La pantalla
// decía «🔴 Sin cobertura» y proponía llamar a la clienta a decírselo.

test('🚨 un recibo PENDIENTE vencido no suspende nada: queda sin confirmar', () => {
  const r = retencion(haceDias(56), 'pendiente', HOY)
  assert.equal(r.estado, 'sin_confirmar')
  assert.equal(r.dias, 56)
  assert.doesNotMatch(r.accion, /suspendid/i, 'nadie ha dicho que se devolviera')
  assert.match(r.accion, /portal/, 'lo que toca es comprobarlo, no llamar')
})

test('🚨 sin impago confirmado no hay reloj del art. 15 que contar', () => {
  // Pintar una cuenta atrás sobre un hecho que no consta es fabricar el dato.
  const r = retencion(haceDias(56), 'pendiente', HOY)
  assert.equal(r.diasParaSuspension, null)
  assert.equal(r.diasParaExtincion, null)
})

test('un pendiente recién vencido es lo normal en una domiciliación', () => {
  const r = retencion(haceDias(3), 'pendiente', HOY)
  assert.equal(r.estado, 'sin_confirmar')
  assert.match(r.accion, /Nada que hacer todavía/)
  assert.ok(
    r.prioridad < retencion(haceDias(3), 'devuelto', HOY).prioridad,
    'un cobro que aún puede estar en camino no adelanta a uno que YA falló',
  )
})

test('🚨 el impago confirmado va antes que el que solo falta por confirmar', () => {
  const confirmado = retencion(haceDias(56), 'devuelto', HOY)
  const dudoso = retencion(haceDias(56), 'pendiente', HOY)
  assert.ok(
    confirmado.prioridad > dudoso.prioridad,
    'primero se llama a quien SÍ se sabe que está sin cobertura',
  )
  // Pero un vencido sin noticias adelanta a todo lo que no corre prisa.
  assert.ok(dudoso.prioridad > retencion(haceDias(10), 'devuelto', HOY).prioridad)
})

test('un pendiente SIN fecha sigue siendo «no se sabe desde cuándo»', () => {
  assert.equal(retencion(null, 'pendiente', HOY).estado, 'sin_fecha')
})

test('el resumen separa los trabajos en vez de dar un total', () => {
  const r = resumirRetencion([
    { estado: 'suspendida', prima: 431.85 },
    { estado: 'suspendida', prima: null },
    { estado: 'en_plazo', prima: 100.15 },
    { estado: 'extinguida', prima: 200 },
    { estado: 'sin_fecha', prima: null },
    { estado: 'sin_confirmar', prima: 903.83 },
  ])
  assert.equal(r.suspendidas, 2)
  assert.equal(r.enPlazo, 1)
  assert.equal(r.extinguidas, 1)
  assert.equal(r.sinFecha, 1)
  assert.equal(r.sinConfirmar, 1)
  assert.equal(r.primaEnRiesgo, 1635.83)
  assert.equal(r.sinPrima, 2, 'el total no se presenta como completo')
})

test('🚨 un sin_confirmar NO engorda el contador de «sin cobertura»', () => {
  // Es el número sobre el que la pantalla dice «circulan sin cobertura»: si
  // cuenta dudas, vuelve a afirmar lo que no sabe.
  const r = resumirRetencion([
    { estado: 'sin_confirmar', prima: null },
    { estado: 'sin_confirmar', prima: null },
  ])
  assert.equal(r.suspendidas, 0)
  assert.equal(r.sinConfirmar, 2)
})

test('🚨 si NINGUNA informa prima, el riesgo es null y no 0,00€', () => {
  const r = resumirRetencion([{ estado: 'suspendida', prima: null }])
  assert.equal(r.primaEnRiesgo, null)
  assert.equal(r.sinPrima, 1)
})

test('lista vacía: cero de todo, que aquí sí es un dato', () => {
  const r = resumirRetencion([])
  assert.equal(r.suspendidas, 0)
  assert.equal(r.sinConfirmar, 0)
  assert.equal(r.primaEnRiesgo, null)
})
