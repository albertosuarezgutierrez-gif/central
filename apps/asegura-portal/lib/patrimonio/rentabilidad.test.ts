import { test } from 'node:test'
import assert from 'node:assert/strict'

import { primasDeEnlaces, periodoDeAnio } from './rentabilidad.ts'
import type { PolizaVisible } from './seguros-inmueble-api.ts'

const HOY = '2026-10-24'
const P = { desde: '2026-01-01', hasta: '2026-10-24' }
const poliza = (x: Partial<PolizaVisible> = {}): PolizaVisible => ({
  tipo: 'cartera', id: 'p1', compania: 'Mapfre', ramo: 'hogar', ubicacion: null, referenciaCatastral: null,
  vence: '2027-03-01', vigente: true, costeAnualCent: 36_000, desde: '2026-03-01', ...x,
})
const enlace = (x: Record<string, unknown> = {}) => ({ id: 'e1', inmuebleId: 'i1', polizaId: 'p1', polizaDeclaradaId: null, estado: 'confirmado', origen: 'manual', ...x })

test('periodo: año en curso hasta hoy; años pasados enteros; fuera de rango o texto raro → el actual', () => {
  assert.deepEqual(periodoDeAnio(undefined, HOY), { anio: 2026, desde: '2026-01-01', hasta: HOY, enCurso: true })
  assert.deepEqual(periodoDeAnio('2024', HOY), { anio: 2024, desde: '2024-01-01', hasta: '2024-12-31', enCurso: false })
  for (const malo of ['2019', '2027', 'abc', '2024; drop', ['2024'], null]) assert.equal(periodoDeAnio(malo, HOY).anio, 2026, String(malo))
  assert.throws(() => periodoDeAnio('2024', 'ayer'), /hoy_invalido/)
})

test('primas: la de la póliza enlazada con su anualidad (efecto → vencimiento)', () => {
  assert.deepEqual(primasDeEnlaces([enlace()], [poliza()], P), [{ inmuebleId: 'i1', primaAnual: 36_000, desde: '2026-03-01', hasta: '2027-03-01' }])
  // Declarada sin efecto: la anualidad que termina en su vencimiento.
  const dec = poliza({ tipo: 'declarada', id: 'd1', desde: null })
  assert.deepEqual(primasDeEnlaces([enlace({ polizaId: null, polizaDeclaradaId: 'd1' })], [dec], P), [{ inmuebleId: 'i1', primaAnual: 36_000, desde: '2026-03-01', hasta: '2027-03-01' }])
})

test('🚨 prima que no consta, póliza que no veo o sin vencimiento: prima null sobre TODO el periodo (nunca 0 €)', () => {
  const todo = { inmuebleId: 'i1', primaAnual: null, desde: '2026-01-01', hasta: '2026-10-25' }
  assert.deepEqual(primasDeEnlaces([enlace()], [poliza({ costeAnualCent: null })], P), [todo])
  assert.deepEqual(primasDeEnlaces([enlace()], [], P), [todo], 'la enlazó otra persona y no la veo')
  assert.deepEqual(primasDeEnlaces([enlace()], [poliza({ vence: null })], P), [todo])
})

test('🚨 lectura ilegible → null (el puro avisa seguros_sin_leer); los «No es este» y los archivados no cuentan', () => {
  assert.equal(primasDeEnlaces([enlace()], null, P), null)
  assert.deepEqual(primasDeEnlaces([enlace({ estado: 'rechazado' })], [poliza()], P), [])
  assert.deepEqual(primasDeEnlaces([], [poliza()], P), [])
})
