/* eslint-disable @typescript-eslint/no-explicit-any */
// PIN temporal: alta y reset lo marcan; el cambio propio exige 4 dígitos no triviales, distinto del actual y libre en el taller.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { hashPin, verificarPin } from '@central/core-identity/pin'
import { altaUsuario, cambiarMiPin, ErrorPersonal, resetPinUsuario } from '../lib/personal.ts'
import { montar, T } from './_escenario.ts'

test('alta y reset dejan debe_cambiar_pin = true', async () => {
  const m = montar()
  const a = await m.conTaller(T, (tx: any) => altaUsuario(tx, T, { nombre: 'Rosa', rol: 'recepcion' }))
  assert.equal(m.bd.filas('usuarioTaller').find((u) => u.id === a.id).debeCambiarPin, true)
  await m.conTaller(T, (tx: any) => tx.usuarioTaller.update({ where: { id: a.id }, data: { debeCambiarPin: false } }))
  await m.conTaller(T, (tx: any) => resetPinUsuario(tx, T, a.id))
  assert.equal(m.bd.filas('usuarioTaller').find((u) => u.id === a.id).debeCambiarPin, true)
})

test('cambio propio: guarda el hash nuevo y apaga la marca; PIN triviales, repetidos o del temporal se rechazan', async () => {
  const m = montar()
  const ya = m.bd.sembrar('usuarioTaller', { tallerId: T, nombre: 'Otro', rol: 'recepcion', pinHash: await hashPin('4826') })
  const yo = m.bd.sembrar('usuarioTaller', { tallerId: T, nombre: 'Yo', rol: 'mecanico', pinHash: await hashPin('7391'), debeCambiarPin: true })
  const cambiar = (pinNuevo: string) => m.conTaller(T, (tx: any) => cambiarMiPin(tx, { tallerId: T, usuarioId: yo.id, pinNuevo }))
  await assert.rejects(cambiar('1234'), ErrorPersonal)
  await assert.rejects(cambiar('12'), /4 dígitos/)
  await assert.rejects(cambiar('4826'), /ya está en uso/)
  await assert.rejects(cambiar('7391'), /distinto del temporal/)
  assert.equal(m.bd.filas('usuarioTaller').find((u) => u.id === yo.id).debeCambiarPin, true, 'nada cambia si falla')
  await cambiar('9152')
  const f = m.bd.filas('usuarioTaller').find((u) => u.id === yo.id)
  assert.equal(f.debeCambiarPin, false)
  assert.ok(await verificarPin('9152', f.pinHash))
  assert.equal(m.bd.filas('usuarioTaller').find((u) => u.id === ya.id).debeCambiarPin ?? false, false)
})
