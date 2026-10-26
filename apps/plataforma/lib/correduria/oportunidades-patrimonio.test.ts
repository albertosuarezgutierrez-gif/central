import { test } from 'node:test'
import assert from 'node:assert/strict'

import { cifraLegible, interpretarOportunidadesPatrimonio, leerSenal } from './oportunidades-patrimonio.ts'

const fila = (p: Record<string, unknown> = {}) => ({
  id: 's1', tipo: 'infraseguro', rotulo: 'Capital bajo', ramo: 'hogar', prioridad: 'alta', clienteId: 'c1', cliente: 'Ana Pérez',
  inmueble: 'Socorro 2B', cifras: { ratio: 0.62 }, permiso: 'consentido', desde: '2026-10-26', ...p,
})

test('apagado se distingue de vacío y de error: la pantalla debe decirlo', () => {
  assert.deepEqual(interpretarOportunidadesPatrimonio(200, { estado: 'apagado' }), { estado: 'apagado' })
  assert.deepEqual(interpretarOportunidadesPatrimonio(200, { estado: 'ok', senales: [] }), { estado: 'ok', senales: [] })
  assert.equal(interpretarOportunidadesPatrimonio(500, { estado: 'error', causa: 'esquema' }).estado, 'error')
  assert.equal(interpretarOportunidadesPatrimonio(404, null).estado, 'error')
  assert.equal(interpretarOportunidadesPatrimonio(200, null).estado, 'error')
})

test('una señal incompleta hace error (no se esconde)', () => {
  const r = interpretarOportunidadesPatrimonio(200, { estado: 'ok', senales: [fila(), fila({ cliente: '' })] })
  assert.equal(r.estado, 'error')
})

test('un permiso «opuesto» o desconocido no se pinta jamás', () => {
  assert.equal(leerSenal(fila({ permiso: 'opuesto' })), null)
  assert.equal(leerSenal(fila({ permiso: 'x' })), null)
  assert.ok(leerSenal(fila({ permiso: 'pedido' })))
})

test('cifraLegible: solo dice lo que hay', () => {
  assert.equal(cifraLegible({ tipo: 'infraseguro', cifras: { ratio: 0.62 } }), 'capital al 62 % del valor estimado')
  assert.equal(cifraLegible({ tipo: 'infraseguro', cifras: {} }), null)
  assert.equal(cifraLegible({ tipo: 'poliza_externa_por_vencer', cifras: { dias: 3 } }), 'vence en 3 días')
  assert.equal(cifraLegible({ tipo: 'inmueble_sin_seguro', cifras: {} }), null)
})
