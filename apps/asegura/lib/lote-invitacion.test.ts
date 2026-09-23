import { test } from 'node:test'
import assert from 'node:assert/strict'
import { decidirLote, paraElLote, rachaDeFallos, DIAS_SIN_REPETIR } from './lote-invitacion.ts'

const f = (clienteId: string, estado: Parameters<typeof decidirLote>[0][number]['estado'], invitadoHaceDias: number | null = null) =>
  ({ clienteId, estado, invitadoHaceDias })

test('solo se escribe a los invitables', () => {
  const d = decidirLote([f('a', 'invitable'), f('b', 'ya_entra'), f('c', 'sin_email'), f('d', 'resuelve_a_otra')])
  assert.deepEqual(d.enviar, ['a'])
  assert.deepEqual(d.fuera, { ya_entra: 1, sin_email: 1, resuelve_a_otra: 1 })
})

test('quien ya entra NO se reinvita', () => {
  assert.deepEqual(decidirLote([f('a', 'ya_entra')]).enviar, [])
})

test('no se repite a quien se invitó hace menos de la ventana', () => {
  const d = decidirLote([f('a', 'invitable', 3), f('b', 'invitable', DIAS_SIN_REPETIR), f('c', 'invitable', null)])
  assert.deepEqual(d.enviar, ['b', 'c'])
  assert.equal(d.fuera.invitado_hace_poco, 1)
})

test('no_comprobado no se colapsa con invitable', () => {
  const d = decidirLote([f('a', 'no_comprobado'), f('b', 'ilegible'), f('c', 'ambiguo')])
  assert.deepEqual(d.enviar, [])
  assert.deepEqual(d.fuera, { no_comprobado: 1, ilegible: 1, ambiguo: 1 })
})

test('un fallo de instalación para el lote; uno de ficha, no', () => {
  assert.equal(paraElLote('sin_correo_configurado'), true)
  assert.equal(paraElLote('sin_portal'), true)
  assert.equal(paraElLote('sin_email'), false)
  assert.equal(paraElLote('error_envio'), false)
})

test('el remitente sin verificar para el lote', () => {
  assert.equal(paraElLote('remitente_no_verificado'), true)
})

test('tres fallos IGUALES seguidos paran; un envío en medio rompe la racha', () => {
  assert.equal(rachaDeFallos(['error_envio', 'error_envio']), false)
  assert.equal(rachaDeFallos(['error_envio', 'error_envio', 'error_envio']), true)
  assert.equal(rachaDeFallos(['error_envio', null, 'error_envio', 'error_envio']), false)
  assert.equal(rachaDeFallos(['sin_email', 'error_envio', 'error_envio']), false)
  assert.equal(rachaDeFallos([null, null, null]), false)
})
