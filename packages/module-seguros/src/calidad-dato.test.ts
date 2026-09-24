import test from 'node:test'
import assert from 'node:assert/strict'
import { agruparCalidad, esReglaCalidad, ORDEN_REGLAS, REGLAS_CALIDAD, type IncidenciaCalidad } from './calidad-dato.ts'

const inc = (regla: IncidenciaCalidad['regla'], clienteId = 'c1'): IncidenciaCalidad =>
  ({ regla, clienteId, cliente: 'X', polizaId: null, numeroPoliza: null, compania: null, dato: null, relacionadoId: null })

test('agrupa en el orden fijado y no pinta reglas vacías', () => {
  const g = agruparCalidad([inc('sin_nacimiento'), inc('vencida_sin_renovar'), inc('sin_nacimiento', 'c2')])
  assert.deepEqual(g.map((x) => x.regla), ['vencida_sin_renovar', 'sin_nacimiento'])
  assert.equal(g[1].filas.length, 2)
  assert.equal(g[0].queHacer, REGLAS_CALIDAD.vencida_sin_renovar.queHacer)
})

test('toda regla del catálogo está en el orden (si no, sus filas no se verían nunca)', () => {
  assert.deepEqual([...ORDEN_REGLAS].sort(), Object.keys(REGLAS_CALIDAD).sort())
})

test('esReglaCalidad rechaza lo que no es del catálogo', () => {
  assert.equal(esReglaCalidad('sin_prima'), true)
  assert.equal(esReglaCalidad('toString'), false)
  assert.equal(esReglaCalidad('otra'), false)
})
