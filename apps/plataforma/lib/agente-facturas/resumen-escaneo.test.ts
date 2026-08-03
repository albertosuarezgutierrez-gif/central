import test from 'node:test'
import assert from 'node:assert/strict'
import { detalleEscaneo, recuentoFiable } from './resumen-escaneo.ts'

const vacio = { nuevas: 0, sinLeer: 0, descartados: 0, pendientes: 0 }

test('pasada limpia sin facturas: el 0 se puede afirmar', () => {
  assert.equal(detalleEscaneo(vacio), '0 facturas nuevas')
  assert.equal(recuentoFiable(vacio), true)
})

test('singular y plural', () => {
  assert.match(detalleEscaneo({ ...vacio, nuevas: 1 }), /^1 factura nueva$/)
  assert.match(detalleEscaneo({ ...vacio, nuevas: 2 }), /^2 facturas nuevas$/)
})

// El caso que motivó el módulo: sin esto, «0 facturas nuevas» tapaba correos ilegibles.
test('lo que no se pudo leer sale con aviso y desmiente el recuento', () => {
  const d = detalleEscaneo({ ...vacio, sinLeer: 2 })
  assert.match(d, /⚠️ 2 correos sin poder leer/)
  assert.match(d, /NO es «no hay facturas»/)
  assert.match(d, /etiquetados en Gmail/)
  assert.equal(recuentoFiable({ ...vacio, sinLeer: 2 }), false)
})

// 03/08/2026: el parte prometió 10 correos «etiquetados en Gmail» con la etiqueta
// sin crear. Solo se promete la cola de los que de verdad entraron en ella.
test('sin encolar ninguno: el parte NO promete cola, avisa de que falta la etiqueta', () => {
  const d = detalleEscaneo({ ...vacio, sinLeer: 10, encolados: 0 })
  assert.match(d, /NINGUNO se ha podido etiquetar/)
  assert.match(d, /Facturas\/Extraccion-fallida/)
  assert.doesNotMatch(d, /^.*\(extracción fallida; etiquetados en Gmail para reintentar\)/)
})

test('encolado parcial: dice cuántos entraron y cuántos no', () => {
  const d = detalleEscaneo({ ...vacio, sinLeer: 5, encolados: 3 })
  assert.match(d, /3 etiquetados para reintentar/)
  assert.match(d, /🔴 2 SIN encolar/)
})

test('todos encolados (o sin dato): se mantiene el parte de siempre', () => {
  assert.match(detalleEscaneo({ ...vacio, sinLeer: 2, encolados: 2 }), /etiquetados en Gmail para reintentar/)
  assert.match(detalleEscaneo({ ...vacio, sinLeer: 2 }), /etiquetados en Gmail para reintentar/)
})

test('descartado leído NO es lo mismo que sin leer: no lleva aviso', () => {
  const d = detalleEscaneo({ ...vacio, descartados: 3 })
  assert.match(d, /3 descartados \(leídos, no eran factura\)/)
  assert.doesNotMatch(d, /⚠️/)
  // Descartar con criterio sí permite afirmar que no hay facturas.
  assert.equal(recuentoFiable({ ...vacio, descartados: 3 }), true)
})

test('los pendientes por presupuesto también invalidan el recuento', () => {
  assert.match(detalleEscaneo({ ...vacio, pendientes: 5 }), /5 correos sin mirar por presupuesto/)
  assert.equal(recuentoFiable({ ...vacio, pendientes: 5 }), false)
})

test('pasada mixta: todo en el mismo parte, con el aviso primero', () => {
  const d = detalleEscaneo({ nuevas: 1, sinLeer: 2, descartados: 3, pendientes: 4 })
  assert.ok(d.indexOf('⚠️') < d.indexOf('descartados'), 'el aviso va antes que el detalle menor')
  assert.match(d, /1 factura nueva/)
  assert.match(d, /4 correos sin mirar/)
})
