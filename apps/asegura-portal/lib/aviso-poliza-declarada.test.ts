import test from 'node:test'
import assert from 'node:assert/strict'

import { mensajePolizaDeclarada } from './aviso-poliza-declarada.ts'

const base = { identidadId: 'i-1', compania: null, ramo: null, numeroPoliza: null, fechaVencimiento: null, clienteNombre: 'Ana Pérez' }

test('póliza: compañía y vencimiento como siempre', () => {
  const m = mensajePolizaDeclarada({ ...base, tipoDocumento: 'poliza', compania: 'MAPFRE', ramo: 'Hogar', numeroPoliza: '123', fechaVencimiento: '2027-01-02' })
  assert.match(m, /Póliza aportada por Ana Pérez: MAPFRE \(Hogar\), nº 123\./)
  assert.match(m, /Vence el 2027-01-02\./)
})

test('otro con catastral: dice que no parece póliza y no habla de compañía/vencimiento', () => {
  const m = mensajePolizaDeclarada({ ...base, tipoDocumento: 'otro', referenciaCatastral: '3679311QB5337N0004QW' })
  assert.match(m, /Documento aportado por Ana Pérez: no parece una póliza \(ficha catastral 3679311QB5337N0004QW\)\./)
  assert.ok(!/compañía sin leer|vencimiento/.test(m), m)
})

test('tipo null (no se sabe): comportamiento actual, no afirma que no sea póliza', () => {
  const m = mensajePolizaDeclarada({ ...base, tipoDocumento: null })
  assert.match(m, /Póliza aportada por/)
  assert.match(m, /compañía sin leer/)
  assert.match(m, /Sin fecha de vencimiento leída\/indicada/)
  assert.ok(!/no parece/.test(m))
})
