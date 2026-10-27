import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  CUPO_IA_ALTO_VALOR, CUPO_IA_AMPLIO, CUPO_IA_BASICO, UMBRAL_ALTO_VALOR_COMISION_CENT, UMBRAL_ALTO_VALOR_POLIZAS,
  cupoMensualIa, quedaCupoIa,
} from './cupo-ia.ts'

test('las cifras de Alberto: 10 / 60 / 500, crecientes', () => {
  assert.deepEqual([CUPO_IA_BASICO, CUPO_IA_AMPLIO, CUPO_IA_ALTO_VALOR], [10, 60, 500])
})

test('sin pólizas en vigor (0 revisado) -> básico', () => {
  assert.deepEqual(cupoMensualIa({ comisionAnualCent: null, polizasEnVigor: 0 }), { tramo: 'basico', max: CUPO_IA_BASICO, fuente: 'polizas' })
})

test('con pólizas en vigor -> amplio; justo por debajo del umbral de alto valor sigue siendo amplio', () => {
  assert.equal(cupoMensualIa({ comisionAnualCent: null, polizasEnVigor: 1 }).tramo, 'amplio')
  assert.equal(cupoMensualIa({ comisionAnualCent: null, polizasEnVigor: UMBRAL_ALTO_VALOR_POLIZAS - 1 }).max, CUPO_IA_AMPLIO)
})

test('alto valor por nº de pólizas cuando no consta la comisión', () => {
  assert.deepEqual(cupoMensualIa({ comisionAnualCent: null, polizasEnVigor: UMBRAL_ALTO_VALOR_POLIZAS }), { tramo: 'alto_valor', max: CUPO_IA_ALTO_VALOR, fuente: 'polizas' })
})

test('alto valor por comisión anual; la comisión manda sobre el nº de pólizas', () => {
  assert.deepEqual(cupoMensualIa({ comisionAnualCent: UMBRAL_ALTO_VALOR_COMISION_CENT, polizasEnVigor: 1 }), { tramo: 'alto_valor', max: CUPO_IA_ALTO_VALOR, fuente: 'comision' })
  assert.equal(cupoMensualIa({ comisionAnualCent: UMBRAL_ALTO_VALOR_COMISION_CENT - 1, polizasEnVigor: 1 }).tramo, 'amplio')
})

test('🚨 no se sabe (null) NO es 0: tramo intermedio, ni básico ni ilimitado', () => {
  const c = cupoMensualIa({ comisionAnualCent: null, polizasEnVigor: null })
  assert.deepEqual(c, { tramo: 'amplio', max: CUPO_IA_AMPLIO, fuente: 'desconocido' })
  // Un valor basura tampoco cuenta como dato.
  assert.equal(cupoMensualIa({ comisionAnualCent: Number.NaN, polizasEnVigor: Number.NaN }).fuente, 'desconocido')
  assert.equal(cupoMensualIa({ comisionAnualCent: null, polizasEnVigor: -1 }).tramo, 'amplio')
})

test('comisión 0 conocida y sin nº de pólizas: no es dato de alto valor, cae en intermedio', () => {
  assert.equal(cupoMensualIa({ comisionAnualCent: 0, polizasEnVigor: null }).tramo, 'amplio')
})

test('quedaCupoIa: la décima factura cabe con tope 10, la undécima no', () => {
  assert.equal(quedaCupoIa(9, 10), true)
  assert.equal(quedaCupoIa(10, 10), false)
  assert.equal(quedaCupoIa(0, 0), false)
})
