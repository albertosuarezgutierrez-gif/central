import { test } from 'node:test'
import assert from 'node:assert/strict'
import { siguientePaso, type EntradaSiguientePaso } from './siguiente-paso.ts'

const base: EntradaSiguientePaso = { recibosDevueltos: 0, proximo: null, cotizacionesVivas: 0, ramosVivos: [] }
const proximo = { polizaId: 'p1', vencimiento: '2026-11-15', limiteAviso: '2026-10-16', diasHastaLimiteAviso: 20, enPlazo: true }

test('un recibo devuelto manda sobre todo lo demás', () => {
  const r = siguientePaso({ ...base, recibosDevueltos: 2, proximo, ramosVivos: ['auto'] })
  assert.equal(r?.tono, 'urgente')
  assert.deepEqual(r?.accion, { tipo: 'llamar' })
})

test('devueltos null NO dispara la llamada (no se ha leído)', () => {
  assert.equal(siguientePaso({ ...base, recibosDevueltos: null }), null)
})

test('vence en preaviso sin presupuesto → retarificar esa póliza', () => {
  const r = siguientePaso({ ...base, proximo })
  assert.deepEqual(r?.accion, { tipo: 'retarificar', polizaId: 'p1' })
  assert.match(r!.texto, /no hay presupuesto/)
})

test('con presupuesto desconocido sugiere mirar precio pero NO afirma que no haya', () => {
  const r = siguientePaso({ ...base, proximo, cotizacionesVivas: null })
  assert.equal(r?.accion.tipo, 'retarificar')
  assert.doesNotMatch(r!.texto, /no hay presupuesto/)
})

test('con presupuesto vivo no insiste en la renovación', () => {
  assert.equal(siguientePaso({ ...base, proximo, cotizacionesVivas: 1 }), null)
})

test('fuera del preaviso o lejos no sale', () => {
  assert.equal(siguientePaso({ ...base, proximo: { ...proximo, enPlazo: false } }), null)
  assert.equal(siguientePaso({ ...base, proximo: { ...proximo, diasHastaLimiteAviso: 90 } }), null)
})

test('auto sin hogar → venta cruzada; con hogar no', () => {
  assert.equal(siguientePaso({ ...base, ramosVivos: ['auto'] })?.accion.tipo, 'hogar')
  assert.equal(siguientePaso({ ...base, ramosVivos: ['moto', 'hogar'] }), null)
  assert.equal(siguientePaso({ ...base, ramosVivos: ['vida'] }), null)
})
