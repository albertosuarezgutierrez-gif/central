import { test } from 'node:test'
import assert from 'node:assert/strict'

import { leerVigenciaDeclarada } from './vigente-declarada.ts'

test('ausente: la clave no viene (o viene undefined) → no se toca la columna', () => {
  assert.deepEqual(leerVigenciaDeclarada({ primaAnual: 300 }), { tipo: 'ausente' })
  assert.deepEqual(leerVigenciaDeclarada({ vigenteDeclarada: undefined }), { tipo: 'ausente' })
  assert.deepEqual(leerVigenciaDeclarada(null), { tipo: 'ausente' })
  assert.deepEqual(leerVigenciaDeclarada([]), { tipo: 'ausente' })
})

test('los tres valores permitidos, solos', () => {
  for (const v of ['si', 'no', 'no_sabe'] as const) {
    assert.deepEqual(leerVigenciaDeclarada({ vigenteDeclarada: v }), { tipo: 'sola', valor: v })
  }
})

test('null solo = «no contestado» (borra la respuesta), no «sí»', () => {
  assert.deepEqual(leerVigenciaDeclarada({ vigenteDeclarada: null }), { tipo: 'sola', valor: null })
})

test('fuera de vocabulario → error (sin normalizar mayúsculas ni espacios)', () => {
  for (const v of ['SI', ' si', 'yes', '', 'otro', true, 0, {}]) {
    assert.deepEqual(
      leerVigenciaDeclarada({ vigenteDeclarada: v }),
      { tipo: 'error', error: 'vigente_declarada_invalida' },
      `valor ${JSON.stringify(v)}`,
    )
  }
})

test('«sí» con prima y fecha va por la vía de corrección', () => {
  assert.deepEqual(
    leerVigenciaDeclarada({ vigenteDeclarada: 'si', primaAnual: 412.5, fechaVencimiento: '2027-03-01' }),
    { tipo: 'con_cambios', valor: 'si' },
  )
})

test('«no», «no lo sé» y null no se mezclan con cambios de datos', () => {
  for (const v of ['no', 'no_sabe', null]) {
    assert.deepEqual(
      leerVigenciaDeclarada({ vigenteDeclarada: v, primaAnual: 100 }),
      { tipo: 'error', error: 'vigente_declarada_con_cambios' },
      `valor ${JSON.stringify(v)}`,
    )
  }
})
