// Tope de login POR TALLER (además del bloqueo por IP). Cepo visto fallar el 04/11/2026: en lib/login.ts quitar la llamada
// `anotarFalloTope(…)` → rojo en 'N fallos desde IPs distintas bloquean el taller'; restaurado → verde.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { configDeAlta } from '@central/module-taller'
import { hashPin } from '@central/core-identity/pin'
import { loginTaller } from '../lib/login.ts'
import { registrarFalloTope, topeBloqueado } from '../lib/tope-taller.ts'
import { crearConTaller } from '../lib/rls.ts'
import { crearBdFake } from './_fake-prisma.ts'

const T = 'f9e29b9a-0fb8-4196-ac7a-01c1722b1d8b'
const ITER = 1000
const t0 = new Date('2026-11-04T10:00:00Z')
const min = (n: number) => new Date(t0.getTime() + n * 60_000)
const POL = { maxFallosTaller: 4, ventanaMinutos: 15, bloqueoMinutos: 20 }

async function montar(conConfig = true) {
  const bd = crearBdFake()
  bd.sembrar('taller', { id: T })
  bd.sembrar('usuarioTaller', { tallerId: T, nombre: 'Dueño', rol: 'dueno', pinHash: await hashPin('4826', ITER) })
  if (conConfig) {
    bd.sembrar('configuracion', { tallerId: T, loginMaxFallosTaller: POL.maxFallosTaller, loginVentanaMinutos: POL.ventanaMinutos, loginBloqueoTallerMinutos: POL.bloqueoMinutos })
  }
  const conTaller = crearConTaller(bd.cliente)
  const login = (pin: string, ip: string, ahora = t0) => loginTaller(conTaller, { tallerId: T, ip, pin, ahora })
  return { bd, login }
}

test('N fallos desde IPs DISTINTAS bloquean el taller: ni el PIN correcto entra desde otra IP', async () => {
  const { login } = await montar()
  for (let i = 1; i <= POL.maxFallosTaller; i++) {
    const r = await login('0001', `9.9.9.${i}`, min(i))
    assert.equal(r.ok, false)
    if (i < POL.maxFallosTaller) assert.ok(!r.ok && r.motivo === 'incorrecto', `fallo ${i}`)
    else assert.ok(!r.ok && r.motivo === 'bloqueado', 'el N-ésimo fallo ya bloquea el taller')
  }
  const bien = await login('4826', '8.8.8.8', min(5))
  assert.ok(!bien.ok && bien.motivo === 'bloqueado', 'bloqueado aunque acierte y sea una IP nueva')
  if (!bien.ok && bien.motivo === 'bloqueado') assert.ok(bien.minutos > 0 && bien.minutos <= POL.bloqueoMinutos)
})

test('pasado el bloqueo el taller vuelve a entrar y la cuenta empieza de cero', async () => {
  const { login, bd } = await montar()
  for (let i = 1; i <= POL.maxFallosTaller; i++) await login('0001', `9.9.9.${i}`, min(i))
  assert.ok((await login('4826', '8.8.8.8', min(POL.maxFallosTaller + POL.bloqueoMinutos + 1))).ok)
  const fila = bd.filas('bloqueoPin').find((f) => f.clave.endsWith(':#taller'))
  assert.equal(fila.bloqueadoHasta !== null, true, 'la fila vieja sigue hasta el siguiente fallo')
  // un fallo nuevo empieza ventana nueva: 1, no N+1
  await login('0001', '7.7.7.7', min(60))
  assert.equal(bd.filas('bloqueoPin').find((f) => f.clave.endsWith(':#taller')).intentos, 1)
})

test('fuera de la ventana los fallos no se acumulan', async () => {
  const { login } = await montar()
  for (let i = 0; i < POL.maxFallosTaller - 1; i++) await login('0001', `9.9.9.${i}`, min(i))
  const tarde = await login('0001', '6.6.6.6', min(POL.ventanaMinutos + 5))
  assert.ok(!tarde.ok && tarde.motivo === 'incorrecto', 'ventana vencida: cuenta nueva, no bloquea')
})

test('un acierto NO reinicia la cuenta del taller (si no, daría fuerza bruta gratis)', async () => {
  const { login } = await montar()
  for (let i = 1; i < POL.maxFallosTaller; i++) {
    await login('0001', `9.9.9.${i}`, min(i))
    assert.ok((await login('4826', `5.5.5.${i}`, min(i))).ok)
  }
  const ultimo = await login('0001', '4.4.4.4', min(POL.maxFallosTaller))
  assert.ok(!ultimo.ok && ultimo.motivo === 'bloqueado')
})

test('sin fila de configuración rige la política de ALTA (nunca «sin tope»)', async () => {
  const { login } = await montar(false)
  const alta = configDeAlta().seguridadLogin
  for (let i = 1; i <= alta.maxFallosTaller; i++) await login('0001', `3.3.${Math.floor(i / 200)}.${i % 200}`, min(0))
  const r = await login('4826', '2.2.2.2', min(1))
  assert.ok(!r.ok && r.motivo === 'bloqueado')
})

test('función pura: el bloqueo vencido no bloquea; el fallo con bloqueo vencido reinicia', () => {
  const f = { intentos: 4, bloqueadoHasta: min(10), creadoEn: min(0) }
  assert.equal(topeBloqueado(f, min(5)).bloqueado, true)
  assert.equal(topeBloqueado(f, min(11)).bloqueado, false)
  const n = registrarFalloTope(f, min(11), POL)
  assert.deepEqual([n.intentos, n.reiniciar, n.bloqueadoHasta], [1, true, null])
})
