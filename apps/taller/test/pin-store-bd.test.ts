// (b) PinStore REAL: hash PBKDF2 por usuario, bloqueo PERSISTENTE (fila en bloqueos_pin, clave taller:ip),
// candado de transacción antes de leer el bloqueo y aislamiento por taller.
// Cepos vistos fallar el 04/11/2026: (1) quitando el `pg_advisory_xact_lock` de lib/pin-store-bd.ts → rojo en
// 'toma el candado'; contra Postgres real, 8 intentos en paralelo daban 8 «incorrecto» (bloqueo burlado) y con
// el candado 4 + 4 «bloqueado». (2) quitando `comprobarClave` → rojo en 'clave de otro taller'. Restaurados → verde.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { hashPin, verificarPin } from '@central/core-identity/pin'
import { crearConTaller } from '../lib/rls.ts'
import { loginTaller } from '../lib/login.ts'
import { crearPinStoreBd } from '../lib/pin-store-bd.ts'
import { crearBdFake } from './_fake-prisma.ts'

const T = 'f9e29b9a-0fb8-4196-ac7a-01c1722b1d8b'
const U = '00000000-0000-4000-8000-000000000001'
const ITER = 1000 // hashes baratos en test; verificarPin lee las iteraciones del propio hash

async function montar() {
  const bd = crearBdFake()
  bd.sembrar('taller', { id: T })
  bd.sembrar('taller', { id: U })
  const dueno = bd.sembrar('usuarioTaller', { tallerId: T, nombre: 'Dueño', rol: 'dueno', pinHash: await hashPin('4826', ITER) })
  const baja = bd.sembrar('usuarioTaller', { tallerId: T, nombre: 'Baja', rol: 'mecanico', pinHash: await hashPin('5173', ITER), activo: false })
  const mec = bd.sembrar('usuarioTaller', { tallerId: T, nombre: 'Mecánico', rol: 'mecanico', pinHash: await hashPin('5555', ITER) })
  bd.sembrar('usuarioTaller', { tallerId: U, nombre: 'Otro taller', rol: 'dueno', pinHash: await hashPin('7391', ITER) })
  const conTaller = crearConTaller(bd.cliente)
  const login = (pin: string, ip = '1.2.3.4', ahora = new Date('2026-11-04T10:00:00Z'), usuarioId: string = dueno.id) =>
    loginTaller(conTaller, { tallerId: T, usuarioId, ip, pin, ahora })
  return { bd, dueno, baja, mec, login, conTaller }
}

test('el PIN se guarda como hash PBKDF2 con sal (nunca en claro) y verifica', async () => {
  const h = await hashPin('4826')
  assert.match(h, /^pbkdf2-sha256\$\d+\$[0-9a-f]{32}\$[0-9a-f]{64}$/)
  assert.ok(!h.includes('4826'))
  assert.notEqual(h, await hashPin('4826'), 'sal distinta en cada hash')
  assert.equal(await verificarPin('4826', h), true)
  assert.equal(await verificarPin('4827', h), false)
})

test('PIN correcto entra con el usuario ELEGIDO; de baja, de otro taller o el PIN de otra persona, no', async () => {
  const { login, dueno, baja, mec } = await montar()
  const r = await login('4826')
  assert.ok(r.ok)
  assert.equal(r.credencial.usuarioId, dueno.id)
  assert.equal(r.credencial.rol, 'dueno')
  const b = await login('5173', '2.2.2.2', undefined, baja.id)
  assert.ok(!b.ok && b.motivo === 'usuario', 'usuario de baja')
  assert.equal((await login('7391', '3.3.3.3')).ok, false, 'PIN de otro taller')
  assert.equal((await login('7391', '3.3.3.3', undefined, '00000000-0000-4000-8000-0000000000aa')).ok, false, 'usuario inexistente')
  // El PIN YA NO identifica a nadie: el del mecánico no abre la cuenta del dueño (y viceversa).
  const cruzado = await login('5555', '4.4.4.4')
  assert.ok(!cruzado.ok && cruzado.motivo === 'incorrecto')
  const mio = await login('5555', '5.5.5.5', undefined, mec.id)
  assert.ok(mio.ok && mio.credencial.usuarioId === mec.id)
})

test('5 fallos bloquean; el bloqueo PERSISTE en BD (otra transacción) y para el PIN correcto; otra IP + otra persona entra', async () => {
  const { bd, login, mec } = await montar()
  for (let i = 0; i < 4; i++) assert.equal((await login('0001')).ok, false)
  const r5 = await login('0001')
  assert.ok(!r5.ok && r5.motivo === 'bloqueado')
  // Además de la fila de la IP hay la del tope del TALLER (`<taller>:#taller`, ver tope-taller.test.ts) y la de la PERSONA (`<taller>:u:<id>`).
  const filas = bd.filas('bloqueoPin').filter((f) => !f.clave.endsWith(':#taller') && !f.clave.includes(':u:'))
  assert.equal(filas.length, 1)
  assert.equal(filas[0].clave, `${T}:1.2.3.4`)
  assert.equal(filas[0].tallerId, T)
  assert.ok(filas[0].bloqueadoHasta instanceof Date)

  const correcto = await login('4826')
  assert.ok(!correcto.ok && correcto.motivo === 'bloqueado', 'bloqueado aunque acierte')
  const otraIp = await login('4826', '9.9.9.9')
  assert.ok(!otraIp.ok && otraIp.motivo === 'bloqueado' && otraIp.ambito === 'usuario', 'la PERSONA sigue bloqueada desde otra IP (5 h)')
  assert.ok((await login('5555', '9.9.9.9', undefined, mec.id)).ok, 'otra persona, otra IP: entra')
  // Vencido el bloqueo de la persona (5 h), entra y las filas se borran.
  assert.ok((await login('4826', '1.2.3.4', new Date('2026-11-04T15:01:00Z'))).ok)
  assert.equal(bd.filas('bloqueoPin').filter((f) => !f.clave.endsWith(':#taller')).length, 0)
})

test('toma el candado de transacción sobre la clave ANTES de leer el bloqueo', async () => {
  const { bd, login } = await montar()
  await login('0001')
  const i = bd.llamadasRaw.findIndex((s) => s.includes('pg_advisory_xact_lock(hashtext(') && s.endsWith(`:: ${T}:1.2.3.4`))
  assert.ok(i > 0, 'sin candado: intentos en paralelo burlarían el bloqueo')
  assert.ok(bd.llamadasRaw[i].endsWith(`:: ${T}:1.2.3.4`))
  assert.match(bd.llamadasRaw[0], /set_config/, 'el ajuste RLS va primero')
})

test('el adaptador se niega a leer/escribir claves o credenciales de otro taller', async () => {
  const { conTaller } = await montar()
  await conTaller(T, async (tx: any) => {
    const store = crearPinStoreBd(tx, T)
    await assert.rejects(store.leerBloqueo(`${U}:1.2.3.4`), /otro taller/)
    await assert.rejects(store.guardarBloqueo(`${U}:1.2.3.4`, { intentos: 0, bloqueadoHasta: null }), /otro taller/)
    await assert.rejects(store.resetearBloqueo(`${U}:1.2.3.4`), /otro taller/)
    await assert.rejects(store.buscarCredenciales(U), /otro taller/)
  })
})
