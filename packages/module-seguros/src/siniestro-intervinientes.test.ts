import test from 'node:test'
import assert from 'node:assert/strict'
import { revisarInterviniente, esTipoInterviniente } from './siniestro-intervinientes.ts'

test('siniestro-intervinientes: esTipoInterviniente solo acepta tercero/testigo', () => {
  assert.ok(esTipoInterviniente('tercero'))
  assert.ok(esTipoInterviniente('testigo'))
  assert.ok(!esTipoInterviniente('perito'))
  assert.ok(!esTipoInterviniente(null))
})

test('siniestro-intervinientes: un tercero con matrícula y compañía se acepta', () => {
  const r = revisarInterviniente({
    tipo: 'tercero',
    nombre: 'Juan Pérez',
    telefono: '600123456',
    matricula: '1234ABC',
    companiaNombre: 'Mapfre',
  })
  assert.ok(r.ok)
  if (r.ok) {
    assert.equal(r.interviniente.nombre, 'Juan Pérez')
    assert.equal(r.interviniente.matricula, '1234ABC')
    assert.equal(r.interviniente.esConductor, null)
  }
})

test('siniestro-intervinientes: un testigo NUNCA lleva datos de vehículo aunque lleguen en la petición', () => {
  const r = revisarInterviniente({
    tipo: 'testigo',
    nombre: 'María López',
    telefono: '600999888',
    matricula: '9999ZZZ',
    companiaNombre: 'no debería quedarse',
  })
  assert.ok(r.ok)
  if (r.ok) {
    assert.equal(r.interviniente.matricula, null)
    assert.equal(r.interviniente.companiaNombre, null)
    assert.equal(r.interviniente.nombre, 'María López')
  }
})

test('siniestro-intervinientes: sin ningún identificador (nombre/teléfono/matrícula) se rechaza', () => {
  const r = revisarInterviniente({ tipo: 'tercero', marcaModelo: 'Seat León' })
  assert.deepEqual(r, { ok: false, motivo: 'apunta al menos un nombre, un teléfono o una matrícula' })
})

test('siniestro-intervinientes: solo la matrícula ya basta', () => {
  const r = revisarInterviniente({ tipo: 'tercero', matricula: '1234ABC' })
  assert.ok(r.ok)
})

test('siniestro-intervinientes: tipo desconocido se rechaza', () => {
  const r = revisarInterviniente({ tipo: 'perito', nombre: 'X' })
  assert.deepEqual(r, { ok: false, motivo: 'tipo de interviniente desconocido' })
})

test('siniestro-intervinientes: esConductor solo se respeta en tercero', () => {
  const r1 = revisarInterviniente({ tipo: 'tercero', nombre: 'X', esConductor: true })
  assert.ok(r1.ok)
  if (r1.ok) assert.equal(r1.interviniente.esConductor, true)

  const r2 = revisarInterviniente({ tipo: 'testigo', nombre: 'X', esConductor: true })
  assert.ok(r2.ok)
  if (r2.ok) assert.equal(r2.interviniente.esConductor, null)
})
