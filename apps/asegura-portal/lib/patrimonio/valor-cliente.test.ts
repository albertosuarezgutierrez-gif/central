import { test } from 'node:test'
import assert from 'node:assert/strict'

import { contarPolizasEnVigor, valorDelGrupo, type FilaPolizaValor } from './valor-cliente.ts'

const viva = (o: Partial<FilaPolizaValor> = {}): FilaPolizaValor => ({ importRef: null, eiacXmlHash: null, estado: 'activa', sustituidaAt: null, mergedIntoPolizaId: null, ...o })

test('cuenta solo cartera EN VIGOR: no el volcado histórico, ni canceladas, ni sustituidas, ni fusionadas', () => {
  const filas = [
    viva(),
    viva({ eiacXmlHash: 'h' , importRef: 'intranet:1' }),
    viva({ importRef: 'intranet:2' }),
    viva({ estado: 'cancelada' }),
    viva({ sustituidaAt: new Date('2026-01-01') }),
    viva({ mergedIntoPolizaId: 'otra' }),
    viva({ estado: null }),
  ]
  assert.equal(contarPolizasEnVigor(filas), 2)
})

test('🚨 lectura fallida (null) = no se sabe; lista vacía = 0 revisado', () => {
  assert.deepEqual(valorDelGrupo(null), { comisionAnualCent: null, polizasEnVigor: null })
  assert.deepEqual(valorDelGrupo([]), { comisionAnualCent: null, polizasEnVigor: 0 })
  assert.equal(valorDelGrupo([viva(), viva()]).polizasEnVigor, 2)
})

test('🎁 la recompensa por recomendar solo aparece cuando es true (ausente = sin recompensa) y no toca el resto del valor', () => {
  assert.deepEqual(valorDelGrupo([], false), { comisionAnualCent: null, polizasEnVigor: 0 })
  assert.deepEqual(valorDelGrupo([], true), { comisionAnualCent: null, polizasEnVigor: 0, recompensaVigente: true })
  assert.deepEqual(valorDelGrupo(null, true), { comisionAnualCent: null, polizasEnVigor: null, recompensaVigente: true })
})
