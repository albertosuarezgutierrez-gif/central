import { test } from 'node:test'
import assert from 'node:assert/strict'
import { decidirFicha, esDocumentoDeSeguro, fechaLlamada, mismoNombre, proximoVencimiento, ramoOportunidad } from './oportunidad-documento-reglas.ts'

const HOY = new Date('2026-09-29T10:00:00Z')

test('🪤 un vencimiento pasado se corre al año siguiente (la póliza se renueva)', () => {
  assert.equal(proximoVencimiento('2025-03-15', HOY), '2027-03-15')
  assert.equal(proximoVencimiento('2025-12-01', HOY), '2026-12-01')
  assert.equal(proximoVencimiento('2026-11-20', HOY), '2026-11-20')
  assert.equal(proximoVencimiento('2024-02-29', HOY), '2027-02-28')
  assert.equal(proximoVencimiento(null, HOY), null)
  assert.equal(proximoVencimiento('no', HOY), null)
})

test('🪤 la llamada es 45 días antes; si ya pasó o no hay fecha, mañana', () => {
  assert.equal(fechaLlamada('2026-12-31', HOY), '2026-11-16')
  assert.equal(fechaLlamada('2026-10-20', HOY), '2026-09-30')
  assert.equal(fechaLlamada(null, HOY), '2026-09-30')
})

test('ramo desconocido = otros; documento sin datos de seguro no abre nada', () => {
  assert.equal(ramoOportunidad('auto'), 'auto')
  assert.equal(ramoOportunidad(null), 'otros')
  assert.equal(esDocumentoDeSeguro({}), false)
  assert.equal(esDocumentoDeSeguro({ compania: 'Mapfre' }), true)
  assert.equal(esDocumentoDeSeguro({ primaAnual: 0 }), false)
})

test('🪤 mismo nombre sin orden; el padre no es el hijo', () => {
  assert.equal(mismoNombre('PIÑA FRANCO MANUEL ANTONIO', 'Manuel Antonio Piña Franco'), true)
  assert.equal(mismoNombre('Manuel Piña', 'Manuel Antonio Piña Franco'), true)
  assert.equal(mismoNombre('Manuel Piña Ruiz', 'Manuel Antonio Piña Franco'), false)
  assert.equal(mismoNombre('Manuel', 'Manuel Antonio Piña Franco'), false)
})

const base = { clienteSube: 'yo', nombreFicha: 'Manuel Antonio Piña Franco', dniFicha: '12345678Z', tomador: 'PIÑA FRANCO MANUEL ANTONIO', dniDocumento: null, coincidencias: null }

test('🪤 decidir ficha: por DNI primero; dos DNI distintos nunca se funden', () => {
  assert.deepEqual(decidirFicha({ ...base, dniDocumento: '12.345.678-z' }), { tipo: 'ficha', clienteId: 'yo', porque: 'dni_ficha' })
  assert.deepEqual(decidirFicha({ ...base, dniDocumento: '87654321X', coincidencias: [{ id: 'otro', activo: true }] }), { tipo: 'ficha', clienteId: 'otro', porque: 'dni_cartera' })
  // Mismo nombre, pero la ficha tiene OTRO DNI: es otra persona → lead.
  assert.deepEqual(decidirFicha({ ...base, dniDocumento: '87654321X', coincidencias: [] }), { tipo: 'lead' })
  // Ficha sin DNI y mismo nombre: es ella.
  assert.deepEqual(decidirFicha({ ...base, dniFicha: null, dniDocumento: '87654321X', coincidencias: [] }), { tipo: 'ficha', clienteId: 'yo', porque: 'nombre' })
})

test('decidir ficha sin DNI en el documento: por nombre; otra persona = lead', () => {
  assert.deepEqual(decidirFicha(base), { tipo: 'ficha', clienteId: 'yo', porque: 'nombre' })
  assert.deepEqual(decidirFicha({ ...base, tomador: 'María López García' }), { tipo: 'lead' })
  assert.deepEqual(decidirFicha({ ...base, tomador: null }), { tipo: 'ficha', clienteId: 'yo', porque: 'sin_tomador' })
  assert.deepEqual(decidirFicha({ ...base, clienteSube: null, tomador: null }), { tipo: 'sin_persona' })
  assert.deepEqual(decidirFicha({ ...base, clienteSube: null }), { tipo: 'lead' })
})
