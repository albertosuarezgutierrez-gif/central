import { test } from 'node:test'
import assert from 'node:assert/strict'
import { IDENTIDAD_CORREDOR_ID } from '@central/module-seguros-portal'
import { esIdentidadCorredor, NOMBRE_IDENTIDAD_VISTA } from './portal-modulos-corredor.ts'

const ID = '11111111-1111-4111-8111-111111111111'

test('esIdentidadCorredor: reconoce la compartida antigua y las identidades de vista por apertura', () => {
  assert.equal(esIdentidadCorredor({ identidadId: IDENTIDAD_CORREDOR_ID, nombre: null, esVistaGastada: false }), true)
  assert.equal(esIdentidadCorredor({ identidadId: ID, nombre: NOMBRE_IDENTIDAD_VISTA, esVistaGastada: true }), true)
})

test('esIdentidadCorredor: una identidad de cliente jamás se confunde (falta marca o falta enlace gastado)', () => {
  assert.equal(esIdentidadCorredor({ identidadId: ID, nombre: NOMBRE_IDENTIDAD_VISTA, esVistaGastada: false }), false)
  assert.equal(esIdentidadCorredor({ identidadId: ID, nombre: 'Corredor · Grupo ASegura', esVistaGastada: true }), false)
  assert.equal(esIdentidadCorredor({ identidadId: ID, nombre: null, esVistaGastada: true }), false)
})
