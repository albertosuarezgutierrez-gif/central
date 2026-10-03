import test from 'node:test'
import assert from 'node:assert/strict'
import { interpretarRevision } from '../correduria-puerto.ts'

const poliza = { id: 'p1', numeroPoliza: 'A1', aseguradora: 'X', dgs: null, estado: 'activa', fechaInicio: '2025-01-01', fechaVencimiento: '2026-01-01', recibos: 2, siniestros: 0 }

test('revisión: casos con sus pólizas se leen; vacío es «ok sin casos», no error', () => {
  const r = interpretarRevision(200, { estado: 'ok', casos: [{ casoId: 'c1', numero: 'A1', motivo: 'm', abiertoAt: '2026-10-03', polizas: [poliza], polizasNoLeidas: 0 }] })
  assert.equal(r.estado === 'ok' && r.casos[0].polizas[0].recibos, 2)
  assert.deepEqual(interpretarRevision(200, { estado: 'ok', casos: [] }), { estado: 'ok', casos: [] })
})

test('revisión: lo ilegible es error (nunca «no hay casos»)', () => {
  assert.equal(interpretarRevision(200, { estado: 'ok' }).estado, 'error')
  assert.equal(interpretarRevision(200, { estado: 'ok', casos: [{ casoId: 'c1', polizas: [{ id: 'p1' }] }] }).estado, 'error')
  assert.equal(interpretarRevision(500, null).estado, 'error')
  assert.equal(interpretarRevision(401, null).estado, 'error')
  assert.equal(interpretarRevision(200, { estado: 'sin_configurar' }).estado, 'sin_configurar')
})
