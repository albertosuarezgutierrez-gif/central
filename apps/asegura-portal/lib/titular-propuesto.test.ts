import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  leerTitularParche,
  normalizarTomadorLeido,
  proponerTitular,
  titularDeLaCasilla,
} from './titular-propuesto.ts'

test('🚨 casilla sin marcar → null («no consta»), NUNCA «propio»', () => {
  assert.equal(titularDeLaCasilla(false), null)
  assert.equal(titularDeLaCasilla(true), 'empresa')
})

test('tomador empresa por CIF → se propone la pregunta con su nombre y CIF', () => {
  const tomador = normalizarTomadorLeido({ tomador: 'Transportes Ejemplo SL', cifTomador: 'ESB91234567', dni: null })
  assert.deepEqual(tomador, { tipo: 'empresa', nombre: 'Transportes Ejemplo SL', cif: 'B91234567' })
  assert.deepEqual(proponerTitular({ titularGuardado: null, tomador }), {
    tipo: 'preguntar_empresa',
    nombre: 'Transportes Ejemplo SL',
    cif: 'B91234567',
  })
})

test('empresa por el nombre, sin CIF → se propone, sin CIF', () => {
  const tomador = normalizarTomadorLeido({ tomador: 'GLOBAL 2, S.L.', cifTomador: null, dni: null })
  assert.deepEqual(proponerTitular({ titularGuardado: null, tomador }), { tipo: 'preguntar_empresa', nombre: 'GLOBAL 2, S.L.', cif: null })
})

test('persona física (DNI válido) → no se propone y su DNI no viaja', () => {
  const tomador = normalizarTomadorLeido({ tomador: 'MARIA LOPEZ RUIZ', dni: '12345678Z', cifTomador: null })
  assert.deepEqual(tomador, { tipo: 'persona' })
  assert.deepEqual(proponerTitular({ titularGuardado: null, tomador }), { tipo: 'nada', motivo: 'persona' })
})

test('sin tomador leído o ya contestado → no se pregunta', () => {
  assert.equal(normalizarTomadorLeido({ tomador: null }), null)
  assert.equal(normalizarTomadorLeido(null), null)
  assert.deepEqual(proponerTitular({ titularGuardado: null, tomador: null }), { tipo: 'nada', motivo: 'sin_tomador' })
  const empresa = { tipo: 'empresa', nombre: 'X SL', cif: null } as const
  assert.deepEqual(proponerTitular({ titularGuardado: 'empresa', tomador: empresa }), { tipo: 'nada', motivo: 'ya_contestado' })
})

test('PATCH titular: sí + rol; rol fuera de vocabulario, sin nombre o con otros campos → error', () => {
  assert.deepEqual(leerTitularParche({ primaAnual: 3 }), { tipo: 'ausente' })
  assert.deepEqual(leerTitularParche({ titularEmpresa: { nombre: ' X SL ', cif: 'b-91234567', rol: 'administrador' } }), {
    tipo: 'empresa', nombre: 'X SL', cif: 'B91234567', rol: 'administrador',
  })
  // CIF que no cuadra: no se guarda como identidad.
  assert.deepEqual(leerTitularParche({ titularEmpresa: { nombre: 'X SL', cif: 'B91234560' } }), {
    tipo: 'empresa', nombre: 'X SL', cif: null, rol: null,
  })
  assert.equal(leerTitularParche({ titularEmpresa: { nombre: 'X SL', rol: 'jefe' } }).tipo, 'error')
  assert.equal(leerTitularParche({ titularEmpresa: { nombre: '  ' } }).tipo, 'error')
  assert.equal(leerTitularParche({ titularEmpresa: { nombre: 'X SL' }, primaAnual: 3 }).tipo, 'error')
})
