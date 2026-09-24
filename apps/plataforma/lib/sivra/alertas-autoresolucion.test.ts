import { test } from 'node:test'
import assert from 'node:assert/strict'
import { decidirAutoResolucion, detalleAutoResolucion, clave, TIPOS_AUTORESOLUBLES } from './alertas-autoresolucion.ts'

const A = (id: string, extra: Partial<{ tipo: string; property_id: string | null; fecha_ref: string | null }> = {}) => ({
  id, tipo: 'precio_revertido', property_id: 'prop_luxury_busto', fecha_ref: '2027-06-01', ...extra,
})
const COMPROBABLES = new Set(['prop_luxury_busto', 'prop_house_sevillana'])

test('cierra la alerta cuyo problema ya no se da', () => {
  const d = decidirAutoResolucion({
    abiertas: [A('a1')], hitsActuales: new Set(), pisosComprobables: COMPROBABLES,
  })
  assert.deepEqual(d.resolver, ['a1'])
  assert.equal(d.retenidas.length, 0)
})

test('NO cierra la que sigue ocurriendo', () => {
  const d = decidirAutoResolucion({
    abiertas: [A('a1')],
    hitsActuales: new Set([clave('prop_luxury_busto', '2027-06-01')]),
    pisosComprobables: COMPROBABLES,
  })
  assert.deepEqual(d.resolver, [])
  assert.match(d.retenidas[0].motivo, /sigue ocurriendo/)
})

test('🚨 NO cierra la de un piso que hoy no se ha podido leer — el caso que lo justifica todo', () => {
  // Sin esta guarda, el dia que falle el snapshot de un piso su ausencia de `hitsActuales` se
  // leeria como «ya no pasa» y se cerrarian en silencio TODAS sus alertas vivas.
  const d = decidirAutoResolucion({
    abiertas: [A('a1', { property_id: 'prop_duplex_center' })],
    hitsActuales: new Set(), pisosComprobables: COMPROBABLES,
  })
  assert.deepEqual(d.resolver, [])
  assert.match(d.retenidas[0].motivo, /no se ha podido leer/)
})

test('no toca tipos que no se re-evaluan enteros en cada pasada', () => {
  const d = decidirAutoResolucion({
    abiertas: [A('a1', { tipo: 'calibracion_percentil' })],
    hitsActuales: new Set(), pisosComprobables: COMPROBABLES,
  })
  assert.deepEqual(d.resolver, [])
  assert.match(d.retenidas[0].motivo, /no se re-evalúa/)
})

test('sin fecha_ref no hay condicion que recomprobar: se deja a mano', () => {
  const d = decidirAutoResolucion({
    abiertas: [A('a1', { fecha_ref: null })],
    hitsActuales: new Set(), pisosComprobables: COMPROBABLES,
  })
  assert.deepEqual(d.resolver, [])
  assert.match(d.retenidas[0].motivo, /sin piso o sin fecha/)
})

test('sin property_id tampoco', () => {
  const d = decidirAutoResolucion({
    abiertas: [A('a1', { property_id: null })],
    hitsActuales: new Set(), pisosComprobables: COMPROBABLES,
  })
  assert.deepEqual(d.resolver, [])
})

test('caso real del 04/09: 54 abiertas, 51 ya cuadran, 3 siguen', () => {
  // Fechas UNICAS a proposito: con fechas repetidas dos alertas comparten clave y el recuento
  // deja de medir lo que dice medir (me paso al escribir este test).
  const abiertas = Array.from({ length: 54 }, (_, k) => {
    const d = new Date(Date.UTC(2027, 5, 1) + k * 86400000).toISOString().slice(0, 10)
    return A(`a${k}`, { fecha_ref: d })
  })
  // las 3 ultimas siguen descuadradas
  const hits = new Set(abiertas.slice(51).map(a => clave(a.property_id!, a.fecha_ref!)))
  const d = decidirAutoResolucion({ abiertas, hitsActuales: hits, pisosComprobables: COMPROBABLES })
  assert.equal(d.resolver.length, 51)
  assert.equal(d.retenidas.length, 3)
})

test('el parte separa lo cerrado de lo que no se ha podido comprobar', () => {
  const txt = detalleAutoResolucion({
    resolver: ['a', 'b'],
    retenidas: [{ id: 'c', motivo: 'hoy no se ha podido leer el precio vivo de ese piso' },
                { id: 'd', motivo: 'sigue ocurriendo' }],
  })
  assert.match(String(txt), /2 alerta\(s\) cerrada\(s\)/)
  assert.match(String(txt), /1 sin poder comprobar/)
  assert.doesNotMatch(String(txt), /sigue ocurriendo/)
})

test('pasada tranquila: sin cierres ni huecos, el parte calla', () => {
  assert.equal(detalleAutoResolucion({ resolver: [], retenidas: [{ id: 'x', motivo: 'sigue ocurriendo' }] }), null)
})

test('precio_revertido es auto-resoluble; los diagnosticos de calibracion NO', () => {
  assert.ok(TIPOS_AUTORESOLUBLES.has('precio_revertido'))
  assert.ok(!TIPOS_AUTORESOLUBLES.has('calibracion_percentil'))
  assert.ok(!TIPOS_AUTORESOLUBLES.has('recorrido_insuficiente'))
})
