/* eslint-disable @typescript-eslint/no-explicit-any */
// Hallazgo 1 (revisión de seguridad): login «solo PIN» + oráculo en /cambiar-pin → rediseño taller → usuario → PIN.
// Hallazgo 5: versión de sesión. Cepos vistos fallar el 04/11/2026:
//  (1) en lib/login.ts quitar `usuarioId` de la llamada a loginConPin → rojo en 'el PIN de otra persona no abre tu cuenta' (el PIN volvería a identificar a quien lo teclea);
//  (2) quitar la llamada a `anotarFalloUsuario` → rojo en 'N fallos bloquean a ESA persona';
//  (3) en lib/permisos.ts `exigir` quitar el `sesionVigente` → rojo en 'sesión con versión vieja'; (4) en leerCookie quitar la exigencia de `sv` → rojo en 'cookie sin versión'.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { hashPin } from '@central/core-identity/pin'
import { configDeAlta } from '@central/module-taller'
import { ALFABETO_CODIGO, generarCodigoTaller, normalizarCodigoTaller } from '../lib/codigo-taller.ts'
import { COOKIE_DISPOSITIVO, emitirCookieDispositivo, leerCookieDispositivo, resolverTallerDelDispositivo } from '../lib/dispositivo.ts'
import { listarUsuariosLogin, loginTaller } from '../lib/login.ts'
import { desbloquearTaller, estadoBloqueosLogin, fijarCodigoTaller } from '../lib/bloqueos-ajustes.ts'
import { cambiarMiPin, ErrorPersonal, resetPinUsuario } from '../lib/personal.ts'
import { exigir, SesionObsoletaError } from '../lib/permisos.ts'
import { usuarioConRol, usuarioDeSesion } from '../lib/acceso.ts'
import { emitirCookie, leerCookie } from '../lib/sesion-cookie.ts'
import { crearConTaller } from '../lib/rls.ts'
import { crearBdFake } from './_fake-prisma.ts'

process.env.TALLER_SESSION_SECRET = 'secreto-de-prueba-no-real'
const T = 'f9e29b9a-0fb8-4196-ac7a-01c1722b1d8b'
const ITER = 1000
const t0 = new Date('2026-11-04T10:00:00Z')
const min = (n: number) => new Date(t0.getTime() + n * 60_000)

async function montar(config: Record<string, unknown> | null = {}) {
  const bd = crearBdFake()
  bd.sembrar('taller', { id: T, codigoAcceso: 'ABCD2345' })
  const ana = bd.sembrar('usuarioTaller', { tallerId: T, nombre: 'Ana', rol: 'dueno', pinHash: await hashPin('4826', ITER) })
  // MISMO PIN que Ana: ya no hay unicidad ni oráculo.
  const luis = bd.sembrar('usuarioTaller', { tallerId: T, nombre: 'Luis', rol: 'mecanico', pinHash: await hashPin('4826', ITER) })
  const rosa = bd.sembrar('usuarioTaller', { tallerId: T, nombre: 'Rosa', rol: 'recepcion', pinHash: await hashPin('7391', ITER) })
  bd.sembrar('usuarioTaller', { tallerId: T, nombre: 'Baja', rol: 'mecanico', pinHash: await hashPin('1111', ITER), activo: false })
  if (config) bd.sembrar('configuracion', { tallerId: T, ...config })
  const conTaller = crearConTaller(bd.cliente)
  const login = (usuarioId: unknown, pin: string, ip = '1.1.1.1', ahora = t0) => loginTaller(conTaller, { tallerId: T, usuarioId, ip, pin, ahora })
  return { bd, conTaller: conTaller as any, ana, luis, rosa, login }
}

// ── código del taller ────────────────────────────────────────────────────────────────────────────────────────
test('código del taller: 8 caracteres sin ambiguos (0/O/1/I/L), normaliza lo que se teclea y rechaza basura', () => {
  assert.ok(!/[01OIL]/.test(ALFABETO_CODIGO))
  for (let i = 0; i < 200; i++) {
    const c = generarCodigoTaller()
    assert.match(c, /^[2-9A-HJKMNP-Z]{8}$/)
  }
  assert.notEqual(generarCodigoTaller(), generarCodigoTaller())
  // Rechazo del sesgo: un valor ≥ el límite se descarta y se vuelve a sortear.
  const seq = [0xffffffff, 0, 1, 2, 3, 4, 5, 6, 7]
  assert.equal(generarCodigoTaller(() => seq.shift()!), ALFABETO_CODIGO.slice(0, 8).slice(0, 0) + [0, 1, 2, 3, 4, 5, 6, 7].map((n) => ALFABETO_CODIGO[n]).join(''))
  assert.equal(normalizarCodigoTaller(' abcd-2345 '), 'ABCD2345')
  for (const mal of ['', 'AB', 'ABC DEF GHI JKL MNO', 'ab$d2345', null, 12345678]) assert.equal(normalizarCodigoTaller(mal), null, String(mal))
})

test('dispositivo: la cookie está firmada y lleva el CÓDIGO (no el id del taller); manipulada o de otra clase no vale', async () => {
  const c = await emitirCookieDispositivo('ABCD2345')
  assert.equal(await leerCookieDispositivo(c), 'ABCD2345')
  assert.ok(!atob(c).includes(T), 'el id del taller no viaja en la cookie')
  const o = JSON.parse(atob(c)); o.codigo = 'ZZZZ9999'
  assert.equal(await leerCookieDispositivo(btoa(JSON.stringify(o))), null, 'cambiar el código rompe la firma')
  assert.equal(await leerCookieDispositivo(await emitirCookie({ tallerId: T, usuarioId: 'u', rol: 'dueno', sv: 0 }, t0, { sesionMinutos: 60, inactividadMinutos: 30 })), null, 'una cookie de SESIÓN no sirve de dispositivo')
  assert.equal(await leerCookieDispositivo(undefined), null)
  assert.equal(await leerCookieDispositivo('basura'), null)
  assert.equal(COOKIE_DISPOSITIVO, 'taller_dispositivo')
})

test('resolver el taller del dispositivo: código recordado → BD; código regenerado → null (no cae al entorno); sin cookie solo en desarrollo', async () => {
  const cookie = await emitirCookieDispositivo('ABCD2345')
  const porCodigo = async (c: string) => (c === 'ABCD2345' ? T : null)
  const prod = { NODE_ENV: 'production', TALLER_PILOTO_ID: 'f9e29b9a-0fb8-4196-ac7a-000000000000' }
  assert.equal(await resolverTallerDelDispositivo({ cookie, porCodigo, env: prod }), T)
  const revocado = await emitirCookieDispositivo('OLDC0DE9')
  assert.equal(await resolverTallerDelDispositivo({ cookie: revocado, porCodigo, env: { NODE_ENV: 'development', TALLER_PILOTO_ID: T } }), null, 'el dueño regeneró el código: ese móvil debe volver a escribirlo')
  assert.equal(await resolverTallerDelDispositivo({ cookie: undefined, porCodigo, env: prod }), null, 'producción: sin código no hay taller')
  assert.equal(await resolverTallerDelDispositivo({ cookie: undefined, porCodigo, env: { NODE_ENV: 'development', TALLER_PILOTO_ID: T } }), T, 'solo desarrollo')
  assert.equal(await resolverTallerDelDispositivo({ cookie, porCodigo: async () => { throw new Error('bd caída') }, env: prod }), null, 'falla cerrado')
})

// ── login taller → usuario → PIN ─────────────────────────────────────────────────────────────────────────────
test('paso 2: solo usuarios ACTIVOS del taller, con id y nombre (ni rol ni hash)', async () => {
  const { conTaller } = await montar()
  const xs = await listarUsuariosLogin(conTaller, T)
  assert.deepEqual(xs.map((u) => u.nombre), ['Ana', 'Luis', 'Rosa'])
  assert.deepEqual(Object.keys(xs[0]).sort(), ['id', 'nombre'])
})

test('el PIN de otra persona no abre tu cuenta, aunque dos personas compartan PIN (cada una entra solo con SU usuario)', async () => {
  const { login, ana, luis, rosa } = await montar()
  const a: any = await login(ana.id, '4826'); assert.ok(a.ok && a.credencial.usuarioId === ana.id)
  const l: any = await login(luis.id, '4826', '2.2.2.2'); assert.ok(l.ok && l.credencial.usuarioId === luis.id, 'mismo PIN, otra persona')
  const cruzado: any = await login(ana.id, '7391', '3.3.3.3')
  assert.ok(!cruzado.ok && cruzado.motivo === 'incorrecto', 'el PIN de Rosa no entra como Ana')
  assert.ok((await login(rosa.id, '7391', '4.4.4.4')).ok)
  assert.equal(((await login('no-es-uuid', '4826')) as any).motivo, 'usuario')
  assert.equal(((await login(undefined, '4826')) as any).motivo, 'usuario')
})

test('N fallos bloquean a ESA persona (5 → 5 h de alta) y no a las demás; ni el PIN correcto entra mientras dura', async () => {
  const { login, ana, luis, bd } = await montar()
  const a = configDeAlta().seguridadLogin
  assert.deepEqual([a.maxFallosUsuario, a.bloqueoUsuarioMinutos], [5, 300])
  for (let i = 1; i < a.maxFallosUsuario; i++) assert.equal(((await login(ana.id, '0001', `9.9.9.${i}`, min(i))) as any).motivo, 'incorrecto')
  const quinto: any = await login(ana.id, '0001', '9.9.9.9', min(5))
  assert.ok(!quinto.ok && quinto.motivo === 'bloqueado' && quinto.ambito === 'usuario')
  assert.equal(quinto.minutos, 300 - 0, 'quedan ~5 h')
  const bien: any = await login(ana.id, '4826', '8.8.8.8', min(6)) // OTRA IP: no la salva
  assert.ok(!bien.ok && bien.motivo === 'bloqueado' && bien.ambito === 'usuario')
  assert.ok((await login(luis.id, '4826', '8.8.8.8', min(6))).ok, 'Luis, con el mismo PIN, entra: el bloqueo es por persona')
  const antes = bd.filas('bloqueoPin').length
  await login(ana.id, '0001', '7.7.7.7', min(7))
  assert.equal(bd.filas('bloqueoPin').length, antes, 'mientras está bloqueada no se acumulan más filas ni fallos')
  // A las 5 h vuelve a entrar y el contador se limpia.
  assert.ok((await login(ana.id, '4826', '1.1.1.1', min(300 + 6))).ok)
  assert.equal(bd.filas('bloqueoPin').filter((f) => f.clave === `${T}:u:${ana.id}`).length, 0)
})

test('el número de fallos y la duración del bloqueo por persona son CONFIGURABLES (no literales)', async () => {
  const { login, ana } = await montar({ loginMaxFallosUsuario: 2, loginBloqueoUsuarioMinutos: 45 })
  assert.equal(((await login(ana.id, '0001', '1.1.1.1', min(0))) as any).motivo, 'incorrecto')
  const r: any = await login(ana.id, '0001', '1.1.1.2', min(1))
  assert.ok(!r.ok && r.motivo === 'bloqueado' && r.minutos === 45)
  assert.ok((await login(ana.id, '4826', '1.1.1.3', min(47))).ok)
})

test('un acierto antes del tope limpia la cuenta de la persona (no acumula entre días)', async () => {
  const { login, ana, bd } = await montar()
  for (let i = 0; i < 4; i++) await login(ana.id, '0001', `5.5.5.${i}`, min(i))
  assert.ok((await login(ana.id, '4826', '6.6.6.6', min(5))).ok)
  assert.equal(bd.filas('bloqueoPin').filter((f) => f.clave === `${T}:u:${ana.id}`).length, 0)
})

test('el candado de transacción de la persona se toma ANTES de verificar (intentos en paralelo no burlan el bloqueo)', async () => {
  const { login, ana, bd } = await montar()
  await login(ana.id, '0001')
  const i = bd.llamadasRaw.findIndex((s) => s.includes('pg_advisory_xact_lock') && s.endsWith(`:: ${T}:u:${ana.id}`))
  assert.ok(i > 0)
})

test('aviso al dueño: el tope del taller y el bloqueo de una persona dejan constancia y Ajustes los ve; «Desbloquear» levanta el del taller', async () => {
  const { login, ana, luis, rosa, bd, conTaller } = await montar({ loginMaxFallosTaller: 3, loginVentanaMinutos: 15, loginBloqueoTallerMinutos: 20, loginMaxFallosUsuario: 2, loginBloqueoUsuarioMinutos: 300 })
  await login(ana.id, '5309', '1.1.1.1', min(1))
  await login(ana.id, '5309', '1.1.1.2', min(2)) // 2.º fallo de Ana: la bloquea
  const avisos1 = bd.filas('auditoria').filter((f) => f.entidad === 'aviso_dueno')
  assert.deepEqual(avisos1.map((f) => f.accion), ['usuario_bloqueado'])
  const r: any = await login(luis.id, '5309', '1.1.1.3', min(3)) // 3.º fallo del taller
  assert.ok(!r.ok && r.motivo === 'bloqueado' && r.ambito === 'taller')
  assert.deepEqual(bd.filas('auditoria').filter((f) => f.entidad === 'aviso_dueno').map((f) => f.accion), ['usuario_bloqueado', 'tope_taller_bloqueado'])
  assert.ok(!JSON.stringify(bd.filas('auditoria')).includes('5309'), 'ni PIN en el aviso')
  // El taller entero está bloqueado: ni Rosa con su PIN correcto.
  assert.equal(((await login(rosa.id, '7391', '2.2.2.2', min(4))) as any).ambito, 'taller')
  const est = await conTaller(T, (tx: any) => estadoBloqueosLogin(tx, T, min(4)))
  assert.equal(est.topeMinutos, 19); assert.deepEqual(est.usuariosBloqueados, [ana.id])
  // Botón «Desbloquear» del dueño: levanta el tope del taller (no el de Ana).
  await conTaller(T, (tx: any) => desbloquearTaller(tx, T))
  assert.ok((await login(rosa.id, '7391', '2.2.2.2', min(5))).ok)
  const est2 = await conTaller(T, (tx: any) => estadoBloqueosLogin(tx, T, min(5)))
  assert.equal(est2.topeMinutos, null); assert.deepEqual(est2.usuariosBloqueados, [ana.id])
})

test('un PIN nuevo (reset del dueño) levanta el bloqueo de la persona', async () => {
  const { login, ana, conTaller } = await montar({ loginMaxFallosUsuario: 1 })
  assert.ok(!((await login(ana.id, '0001')) as any).ok)
  assert.equal(((await login(ana.id, '4826', '2.2.2.2', min(1))) as any).motivo, 'bloqueado')
  const { pin } = await conTaller(T, (tx: any) => resetPinUsuario(tx, T, ana.id))
  assert.ok((await login(ana.id, pin, '3.3.3.3', min(2))).ok)
})

// ── código editable por el dueño ─────────────────────────────────────────────────────────────────────────────
test('el dueño puede escribir su código (validado) o generar uno nuevo; el viejo deja de resolver', async () => {
  const { bd, conTaller } = await montar()
  assert.equal(await conTaller(T, (tx: any) => fijarCodigoTaller(tx, T, ' mi-taller7 ')), 'MITALLER7')
  assert.equal(bd.filas('taller').find((t) => t.id === T).codigoAcceso, 'MITALLER7')
  await assert.rejects(conTaller(T, (tx: any) => fijarCodigoTaller(tx, T, 'ab')), ErrorPersonal)
  await assert.rejects(conTaller(T, (tx: any) => fijarCodigoTaller(tx, T, 'ab$$$$$$')), ErrorPersonal)
  const nuevo = await conTaller(T, (tx: any) => fijarCodigoTaller(tx, T, null))
  assert.match(nuevo, /^[2-9A-HJKMNP-Z]{8}$/)
  assert.equal(bd.filas('taller').find((t) => t.id === T).codigoAcceso, nuevo)
})

// ── versión de sesión (hallazgo 5) ───────────────────────────────────────────────────────────────────────────
test('cookie sin versión de sesión (anterior a 0006) o con versión inválida → null (falla cerrado); con versión, la lleva', async () => {
  const pol = { sesionMinutos: 60, inactividadMinutos: 30 }
  const c = await emitirCookie({ tallerId: T, usuarioId: 'u', rol: 'dueno', sv: 3 }, t0, pol)
  assert.equal((await leerCookie(c, min(1)))!.sv, 3)
  const o = JSON.parse(atob(c)); delete o.sv
  const { firmarSesionPin } = await import('@central/core-identity/pin')
  const { _sig, ...sinFirma } = o
  void _sig
  assert.equal(await leerCookie(btoa(JSON.stringify(await firmarSesionPin(sinFirma, 'TALLER_SESSION_SECRET'))), min(1)), null, 'firmada pero sin sv')
  assert.equal(await leerCookie(btoa(JSON.stringify(o)), min(1)), null)
})

test('sesión con versión vieja: exigir() lanza SesionObsoletaError y usuarioConRol/usuarioDeSesion la rechazan; la vigente pasa', async () => {
  const { bd, conTaller, ana } = await montar()
  bd.filas('usuarioTaller') // (lectura)
  const s = { tallerId: T, usuarioId: ana.id, rol: 'dueno', sv: 0 }
  await conTaller(T, async (tx: any) => {
    assert.equal(await exigir(tx, s, 'margenes_ver'), 'dueno')
    assert.ok(await usuarioConRol(tx, s, ['dueno']))
  })
  await conTaller(T, (tx: any) => tx.usuarioTaller.update({ where: { id: ana.id }, data: { sesionVersion: 1 } }))
  await conTaller(T, async (tx: any) => {
    await assert.rejects(exigir(tx, s, 'margenes_ver'), SesionObsoletaError)
    assert.equal(await usuarioConRol(tx, s, ['dueno']), false)
    assert.equal(await usuarioDeSesion(tx, s), null)
    assert.equal(await exigir(tx, { ...s, sv: 1 }, 'margenes_ver'), 'dueno', 'la sesión nueva sí')
  })
})

test('cambiar el PIN propio sube la versión: la cookie anterior deja de valer y la reemitida sí', async () => {
  const { conTaller, luis } = await montar()
  await conTaller(T, (tx: any) => tx.usuarioTaller.update({ where: { id: luis.id }, data: { debeCambiarPin: true } }))
  const vieja = { tallerId: T, usuarioId: luis.id, rol: 'mecanico', sv: 0 }
  const r: any = await conTaller(T, (tx: any) => cambiarMiPin(tx, { tallerId: T, usuarioId: luis.id, pinNuevo: '9152' }))
  assert.equal(r.sesionVersion, 1)
  await conTaller(T, async (tx: any) => {
    assert.equal(await usuarioDeSesion(tx, vieja), null, 'la sesión abierta con el PIN anterior (p. ej. en otro móvil) se cierra')
    assert.ok(await usuarioDeSesion(tx, { ...vieja, sv: r.sesionVersion }))
  })
})

// ── guardianes de fuente ─────────────────────────────────────────────────────────────────────────────────────
const lee = (...r: string[]) => readFileSync(join(import.meta.dirname, '..', ...r), 'utf8')
const sinComentarios = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

test('guardián: sin oráculo «ya está en uso», sin búsqueda de PIN libre y el login siempre lleva usuarioId', () => {
  for (const f of ['personal.ts', 'login.ts']) assert.ok(!/ya está en uso|pinLibre/.test(sinComentarios(lee('lib', f))), f)
  assert.match(sinComentarios(lee('lib', 'login.ts')), /loginConPin\([\s\S]*?usuarioId[\s\S]*?\}\)/)
  assert.match(lee('app', 'api', 'auth', 'login', 'route.ts'), /usuarioId: z\.string/)
  assert.ok(!/tallerDelDespliegue/.test(lee('lib', 'login.ts') + lee('app', 'api', 'auth', 'login', 'route.ts') + lee('app', 'api', 'fichar', 'route.ts')), 'el taller ya no sale de TALLER_PILOTO_ID')
})

test('guardián: /api/fichar no devuelve datos de rrhh (solo «registrado») y /cambiar-pin pide el PIN actual', () => {
  assert.ok(!/nombre/.test(sinComentarios(lee('app', 'api', 'fichar', 'route.ts'))))
  assert.ok(!/nombre/.test(sinComentarios(lee('lib', 'fichar-rrhh.ts')).replace(/nombreComercial/g, '')) || !/j\.empleado|\.nombre\b/.test(sinComentarios(lee('lib', 'fichar-rrhh.ts'))))
  assert.match(lee('app', 'cambiar-pin', 'acciones.ts'), /pinActual/)
  assert.match(lee('app', 'cambiar-pin', 'CambiarPinCliente.tsx'), /PIN actual/)
})

// ── 0006 ─────────────────────────────────────────────────────────────────────────────────────────────────────
const S6 = lee('prisma', 'sql', '0006_login_taller_usuario_pin.sql')
const ST = (c: string) => Number(S6.match(new RegExp(`${c}\\s+integer NOT NULL DEFAULT (\\d+)`))?.[1])

test('0006: código único con restricción de forma, función SECURITY DEFINER que devuelve solo el id y solo EXECUTE para el rol', () => {
  assert.match(S6, /ADD COLUMN IF NOT EXISTS codigo_acceso text/)
  assert.match(S6, /CREATE UNIQUE INDEX IF NOT EXISTS ux_talleres_codigo_acceso ON taller\.talleres \(codigo_acceso\)/)
  assert.match(S6, /codigo_acceso ~ '\^\[A-Z0-9\]\{6,12\}\$'/)
  assert.match(S6, /FUNCTION taller\.taller_por_codigo\(p_codigo text\)\s+RETURNS uuid[\s\S]*SECURITY DEFINER SET search_path = taller, pg_temp/)
  assert.match(S6, /REVOKE ALL ON FUNCTION taller\.taller_por_codigo\(text\) FROM PUBLIC;/)
  assert.match(S6, /GRANT EXECUTE ON FUNCTION taller\.taller_por_codigo\(text\) TO prisma_taller;/)
  assert.match(S6, /GRANT UPDATE \(codigo_acceso\) ON taller\.talleres TO prisma_taller;/)
})

test('0006: el PIN no es único (ningún UNIQUE sobre pin_hash) y la versión de sesión existe', () => {
  const todo = ['0001_schema_taller.sql', '0002_altas_iniciales.sql', '0003_seguridad_login.sql', '0004_marca_pin_ot_alta.sql', '0005_fichaje_rrhh.sql', '0006_login_taller_usuario_pin.sql']
    .map((f) => lee('prisma', 'sql', f)).join('\n')
  assert.ok(!/UNIQUE\s*\([^)]*pin_hash|INDEX[^;]*\([^)]*pin_hash/i.test(todo.replace(/^--.*$/gm, '')), 'ni UNIQUE ni índice sobre pin_hash')
  assert.match(S6, /ADD COLUMN IF NOT EXISTS sesion_version integer NOT NULL DEFAULT 0/)
})

test('espejo: 0006 (bloqueo por persona) ≡ seguridadLogin de configDeAlta()', () => {
  const a = configDeAlta().seguridadLogin
  assert.equal(ST('login_max_fallos_usuario'), a.maxFallosUsuario)
  assert.equal(ST('login_bloqueo_usuario_minutos'), a.bloqueoUsuarioMinutos)
})

test('0006: rrhh_empresa_id solo por el operador (REVOKE al rol + función SECURITY DEFINER)', () => {
  assert.match(S6, /REVOKE UPDATE \(rrhh_empresa_id\) ON taller\.talleres FROM prisma_taller;/)
  assert.match(S6, /FUNCTION taller\.fijar_rrhh_empresa\(p_taller uuid, p_empresa uuid\)[\s\S]*SECURITY DEFINER SET search_path = taller, pg_temp/)
  assert.match(S6, /REVOKE ALL ON FUNCTION taller\.fijar_rrhh_empresa\(uuid, uuid\) FROM PUBLIC;/)
})
