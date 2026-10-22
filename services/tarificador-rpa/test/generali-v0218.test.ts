// Generali Turismos v0.2.18 (22/10/2026, prueba real: «Uso del Vehículo» ofrece dos opciones «Particular …»). Regla PURA de elección.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { SUPUESTO_USO_PARTICULAR_DIARIO, decidirUsoGenerali } from '../src/adapters/generali/reglas.ts'

const OPS = [
  'Seleccione uno',
  'Particular Ocasional (fin de semana, vacaciones o similar)',
  'Particular Diario (para ir al trabajo, al colegio u otros)',
  'TRABAJO/S. PROPIO (vendedores, representantes)',
  'S.P. Comercial',
  'ESPECIALES (autoescuela)',
]

test('v0.2.18 · uso particular con Ocasional y Diario: sin dato → Diario + supuesto declarado', () => {
  for (const f of [undefined, null]) {
    const d = decidirUsoGenerali(OPS, 'particular', f)
    assert.deepEqual(d.eleccion, { tipo: 'unica', indice: 2, porSimilitud: false })
    assert.equal(d.supuesto, SUPUESTO_USO_PARTICULAR_DIARIO)
  }
  assert.equal(SUPUESTO_USO_PARTICULAR_DIARIO, 'Uso del vehículo: Particular Diario (por defecto; revisar si es ocasional)')
})

test('v0.2.18 · usoFrecuencia del riesgo manda y no hay supuesto', () => {
  assert.deepEqual(decidirUsoGenerali(OPS, 'particular', 'ocasional'), { eleccion: { tipo: 'unica', indice: 1, porSimilitud: false }, supuesto: null })
  assert.deepEqual(decidirUsoGenerali(OPS, 'particular', 'diario'), { eleccion: { tipo: 'unica', indice: 2, porSimilitud: false }, supuesto: null })
  assert.deepEqual(decidirUsoGenerali(OPS, 'particular', 'laboral'), { eleccion: { tipo: 'unica', indice: 2, porSimilitud: false }, supuesto: null })
})

test('v0.2.18 · lógica anterior intacta: una sola «Particular», otro uso y portal raro', () => {
  assert.deepEqual(decidirUsoGenerali(['Seleccione un uso', 'PARTICULAR', 'TAXI'], 'particular').eleccion, { tipo: 'unica', indice: 1, porSimilitud: false })
  assert.equal(decidirUsoGenerali(['Seleccione un uso', 'PARTICULAR', 'TAXI'], 'particular').supuesto, null)
  assert.equal(decidirUsoGenerali(OPS, 'profesional').eleccion.tipo, 'ninguna')
  assert.equal(decidirUsoGenerali(['Particular A', 'Particular B'], 'particular').eleccion.tipo, 'varias')
})
