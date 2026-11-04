/* eslint-disable @typescript-eslint/no-explicit-any */
// PIN temporal: alta y reset lo marcan; el cambio propio exige 4 dígitos no triviales y distinto del actual.
// Hallazgo 1 (revisión de seguridad): el PIN NO es único en el taller y NO hay oráculo «ya está en uso»; /cambiar-pin sin PIN temporal
// pide el PIN ACTUAL y cuenta los fallos en el bloqueo de la persona.
// Cepos vistos fallar el 04/11/2026: (1) en cambiarMiPin quitar el bloque `if (!yo.debeCambiarPin)` → rojo en 'sin PIN temporal exige el PIN actual';
// (2) en anotarFalloUsuario de ese bloque, lanzar en vez de devolver ok:false → rojo en 'los fallos del PIN actual se confirman (no se deshacen)'.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { hashPin, verificarPin } from '@central/core-identity/pin'
import { altaUsuario, bajaUsuario, cambiarMiPin, ErrorPersonal, resetPinUsuario } from '../lib/personal.ts'
import { montar, T } from './_escenario.ts'

const fijo = (n: number) => () => n // PIN «n % 10000» determinista

test('alta y reset dejan debe_cambiar_pin = true', async () => {
  const m = montar()
  const a = await m.conTaller(T, (tx: any) => altaUsuario(tx, T, { nombre: 'Rosa', rol: 'recepcion' }))
  assert.equal(m.bd.filas('usuarioTaller').find((u) => u.id === a.id).debeCambiarPin, true)
  await m.conTaller(T, (tx: any) => tx.usuarioTaller.update({ where: { id: a.id }, data: { debeCambiarPin: false } }))
  await m.conTaller(T, (tx: any) => resetPinUsuario(tx, T, a.id))
  assert.equal(m.bd.filas('usuarioTaller').find((u) => u.id === a.id).debeCambiarPin, true)
})

test('el PIN ya no es único: dos personas pueden tener el mismo (alta y reset no buscan «libre»)', async () => {
  const m = montar()
  const a = await m.conTaller(T, (tx: any) => altaUsuario(tx, T, { nombre: 'Rosa', rol: 'recepcion' }, fijo(7391)))
  const b = await m.conTaller(T, (tx: any) => altaUsuario(tx, T, { nombre: 'Luis', rol: 'mecanico' }, fijo(7391)))
  assert.equal(a.pin, '7391'); assert.equal(b.pin, '7391', 'mismo PIN, sin «ya está en uso»')
  const r = await m.conTaller(T, (tx: any) => resetPinUsuario(tx, T, a.id, fijo(7391)))
  assert.equal(r.pin, '7391')
  // Y el cambio propio tampoco lo rechaza por estar en uso por OTRA persona (no hay oráculo del PIN de los compañeros).
  const yo = m.bd.sembrar('usuarioTaller', { tallerId: T, nombre: 'Yo', rol: 'mecanico', pinHash: await hashPin('2468', 1000), debeCambiarPin: true })
  const r2 = await m.conTaller(T, (tx: any) => cambiarMiPin(tx, { tallerId: T, usuarioId: yo.id, pinNuevo: '7391' }))
  assert.equal(r2.ok, true)
})

test('primer acceso (PIN temporal): guarda el hash nuevo, apaga la marca y sube la versión de sesión; triviales o igual al temporal, no', async () => {
  const m = montar()
  const yo = m.bd.sembrar('usuarioTaller', { tallerId: T, nombre: 'Yo', rol: 'mecanico', pinHash: await hashPin('7391'), debeCambiarPin: true, sesionVersion: 3 })
  const cambiar = (pinNuevo: string) => m.conTaller(T, (tx: any) => cambiarMiPin(tx, { tallerId: T, usuarioId: yo.id, pinNuevo }))
  await assert.rejects(cambiar('1234'), ErrorPersonal)
  await assert.rejects(cambiar('12'), /4 dígitos/)
  await assert.rejects(cambiar('7391'), /distinto del temporal/)
  assert.equal(m.bd.filas('usuarioTaller').find((u) => u.id === yo.id).debeCambiarPin, true, 'nada cambia si falla')
  const r = await cambiar('9152')
  assert.deepEqual(r, { ok: true, sesionVersion: 4 })
  const f = m.bd.filas('usuarioTaller').find((u) => u.id === yo.id)
  assert.equal(f.debeCambiarPin, false)
  assert.equal(f.sesionVersion, 4)
  assert.ok(await verificarPin('9152', f.pinHash))
})

test('sin PIN temporal exige el PIN actual; los fallos cuentan en el bloqueo de la persona y se CONFIRMAN (no se deshacen)', async () => {
  const m = montar()
  const yo = m.bd.sembrar('usuarioTaller', { tallerId: T, nombre: 'Yo', rol: 'mecanico', pinHash: await hashPin('7391', 1000), debeCambiarPin: false })
  const ahora = new Date('2026-11-04T10:00:00Z')
  const cambiar = (pinNuevo: string, pinActual?: unknown) => m.conTaller(T, (tx: any) => cambiarMiPin(tx, { tallerId: T, usuarioId: yo.id, pinNuevo, pinActual, ahora }))
  await assert.rejects(cambiar('9152'), /PIN actual/, 'sin el PIN actual no se cambia')
  await assert.rejects(cambiar('9152', 'abcd'), /PIN actual/)
  assert.equal(m.bd.filas('usuarioTaller').find((u) => u.id === yo.id).sesionVersion ?? 0, 0)
  // 5 fallos (política de alta) → bloqueada 5 h; el fallo se ve en BD aunque la función "no tuvo éxito".
  for (let i = 1; i <= 4; i++) assert.deepEqual(await cambiar('9152', '0001'), { ok: false, error: 'El PIN actual no es correcto' })
  assert.equal(m.bd.filas('bloqueoPin').find((f) => f.clave === `${T}:u:${yo.id}`).intentos, 4, 'los fallos se confirman')
  const quinto: any = await cambiar('9152', '0001')
  assert.equal(quinto.ok, false); assert.match(quinto.error, /Demasiados intentos/)
  const acierto: any = await cambiar('9152', '7391')
  assert.equal(acierto.ok, false, 'bloqueada: ni el PIN actual correcto vale'); assert.match(acierto.error, /Demasiados intentos/)
  // Pasadas las 5 h, con el PIN actual correcto cambia y limpia el contador.
  const tarde = new Date('2026-11-04T15:01:00Z')
  const r: any = await m.conTaller(T, (tx: any) => cambiarMiPin(tx, { tallerId: T, usuarioId: yo.id, pinNuevo: '9152', pinActual: '7391', ahora: tarde }))
  assert.equal(r.ok, true)
  assert.equal(m.bd.filas('bloqueoPin').filter((f) => f.clave === `${T}:u:${yo.id}`).length, 0)
  await assert.rejects(m.conTaller(T, (tx: any) => cambiarMiPin(tx, { tallerId: T, usuarioId: yo.id, pinNuevo: '9152', pinActual: '9152', ahora: tarde })), /distinto del actual/)
})

test('versión de sesión: reset de PIN y baja la suben; el reset además levanta el bloqueo de la persona', async () => {
  const m = montar()
  const u = m.bd.sembrar('usuarioTaller', { tallerId: T, nombre: 'Ana', rol: 'mecanico', pinHash: await hashPin('7391', 1000), sesionVersion: 2 })
  m.bd.sembrar('bloqueoPin', { tallerId: T, clave: `${T}:u:${u.id}`, intentos: 5, bloqueadoHasta: new Date('2099-01-01T00:00:00Z') })
  await m.conTaller(T, (tx: any) => resetPinUsuario(tx, T, u.id))
  assert.equal(m.bd.filas('usuarioTaller').find((x) => x.id === u.id).sesionVersion, 3)
  assert.equal(m.bd.filas('bloqueoPin').length, 0, 'un PIN nuevo levanta el bloqueo de esa persona')
  await m.conTaller(T, (tx: any) => bajaUsuario(tx, T, u.id))
  const f = m.bd.filas('usuarioTaller').find((x) => x.id === u.id)
  assert.equal(f.sesionVersion, 4); assert.equal(f.activo, false)
})
