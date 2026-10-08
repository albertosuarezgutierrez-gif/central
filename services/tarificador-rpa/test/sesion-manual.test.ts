// Sesión MANUAL (Generali, SMS en el acceso): bóveda AES-GCM, caducidad, borrado al invalidar y cepos de forma.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import { inspect } from 'node:util'
import { join } from 'node:path'
import {
  MAX_HORAS_DEFECTO,
  MAX_HORAS_TECHO,
  abrirSesion,
  caducidadMaximaMs,
  claveSesion,
  sellarSesion,
} from '../src/boveda-sesion.ts'
import { GestorSesionManual, type AlmacenSesion } from '../src/sesion-manual.ts'
import { MOTIVO_VERIFICACION_HUMANA, ErrorVerificacionHumana, clasificar } from '../src/errores.ts'
import { textoAvisoSesionManual } from '../src/aviso.ts'

const H = 3_600_000
const clave = randomBytes(32)
const COOKIE = 'JSESSIONID-secreto-de-prueba-1234'
const estado = { cookies: [{ name: 'JSESSIONID', value: COOKIE, domain: '.generali.es' }], origins: [] }
const T0 = 1_760_000_000_000

test('sella y abre: ida y vuelta, y el token no lleva la cookie en claro (ni en base64)', () => {
  const { token, caduca } = sellarSesion(estado, { compania: 'generali', clave, ahora: T0, maxMs: 8 * H })
  assert.equal(caduca, T0 + 8 * H)
  assert.ok(!token.includes(COOKIE) && !token.includes(Buffer.from(COOKIE).toString('base64')))
  const a = abrirSesion(token, { compania: 'generali', clave, ahora: T0 + H })
  assert.equal(a.estado, 'ok')
  if (a.estado === 'ok') {
    assert.deepEqual(a.sesion.valor, estado)
    assert.equal(JSON.stringify(a.sesion), '"[sesion]"')
    assert.equal(inspect(a.sesion), '[sesion]')
  }
})

test('dos sellados del mismo estado dan tokens distintos (IV aleatorio)', () => {
  const o = { compania: 'generali', clave, ahora: T0, maxMs: H }
  assert.notEqual(sellarSesion(estado, o).token, sellarSesion(estado, o).token)
})

test('manipulado, otra clave u otra compañía → invalida (sin lanzar)', () => {
  const { token } = sellarSesion(estado, { compania: 'generali', clave, ahora: T0, maxMs: H })
  const [v, iv, d] = token.split('.')
  const roto = `${v}.${iv}.${d.slice(0, -2)}${d.endsWith('AA') ? 'BB' : 'AA'}`
  for (const [t, c, k] of [
    [roto, 'generali', clave],
    [token, 'generali', randomBytes(32)],
    [token, 'allianz', clave],
    ['basura', 'generali', clave],
    ['', 'generali', clave],
  ] as const) assert.equal(abrirSesion(t, { compania: c, clave: k, ahora: T0 }).estado, 'invalida', `${c}`)
})

test('caducidad: viva justo antes, caducada en el instante límite', () => {
  const { token, caduca } = sellarSesion(estado, { compania: 'generali', clave, ahora: T0, maxMs: 2 * H })
  assert.equal(abrirSesion(token, { compania: 'generali', clave, ahora: caduca - 1 }).estado, 'ok')
  assert.equal(abrirSesion(token, { compania: 'generali', clave, ahora: caduca }).estado, 'caducada')
})

test('re-sellar NUNCA alarga: la caducidad pedida se respeta y se acota al máximo', () => {
  assert.equal(sellarSesion(estado, { compania: 'g', clave, ahora: T0, maxMs: 8 * H, caducaPedida: T0 + H }).caduca, T0 + H)
  assert.equal(sellarSesion(estado, { compania: 'g', clave, ahora: T0, maxMs: 8 * H, caducaPedida: T0 + 99 * H }).caduca, T0 + 8 * H)
})

test('caducidad máxima configurable y acotada; ilegible = defecto', () => {
  assert.equal(caducidadMaximaMs({}), MAX_HORAS_DEFECTO * H)
  assert.equal(caducidadMaximaMs({ TARIFICADOR_SESION_MAX_HORAS: '4' }), 4 * H)
  assert.equal(caducidadMaximaMs({ TARIFICADOR_SESION_MAX_HORAS: '500' }), MAX_HORAS_TECHO * H)
  assert.equal(caducidadMaximaMs({ TARIFICADOR_SESION_MAX_HORAS: '0.1' }), H)
  assert.equal(caducidadMaximaMs({ TARIFICADOR_SESION_MAX_HORAS: 'mucho' }), MAX_HORAS_DEFECTO * H)
})

test('clave sin fallback: ausente o de longitud incorrecta lanza', () => {
  assert.throws(() => claveSesion({}), /no configurado/)
  assert.throws(() => claveSesion({ TARIFICADOR_SESION_KEY: Buffer.alloc(16).toString('base64') }), /32 bytes/)
  assert.equal(claveSesion({ TARIFICADOR_SESION_KEY: clave.toString('base64') }).length, 32)
})

function almacenMemoria(inicial: Record<string, string> = {}) {
  const datos = new Map(Object.entries(inicial))
  const borrados: string[] = []
  const a: AlmacenSesion = {
    leer: async (c) => datos.get(c) ?? null,
    guardar: async (c, t) => void datos.set(c, t),
    borrar: async (c) => void (borrados.push(c), datos.delete(c)),
  }
  return { a, datos, borrados }
}

test('gestor: sin sesión → falta/ninguna, sin borrar nada', async () => {
  const m = almacenMemoria()
  const g = new GestorSesionManual(m.a, { clave, maxMs: 8 * H, ahora: () => T0 })
  assert.deepEqual(await g.cargar('generali'), { estado: 'falta', motivo: 'ninguna' })
  assert.deepEqual(m.borrados, [])
})

test('gestor: caducada o ilegible → se BORRA del almacén', async () => {
  const { token } = sellarSesion(estado, { compania: 'generali', clave, ahora: T0, maxMs: H })
  const m = almacenMemoria({ generali: token, otra: 'basura' })
  const g = new GestorSesionManual(m.a, { clave, maxMs: 8 * H, ahora: () => T0 + 2 * H })
  assert.deepEqual(await g.cargar('generali'), { estado: 'falta', motivo: 'caducada' })
  assert.deepEqual(await g.cargar('otra'), { estado: 'falta', motivo: 'invalida' })
  assert.deepEqual(m.borrados, ['generali', 'otra'])
  assert.equal(m.datos.size, 0)
})

test('gestor: invalidar borra; refrescar re-sella con la caducidad ORIGINAL y no resucita una caducada', async () => {
  const { token, caduca } = sellarSesion(estado, { compania: 'generali', clave, ahora: T0, maxMs: 2 * H })
  const m = almacenMemoria({ generali: token })
  let ahora = T0 + H
  const g = new GestorSesionManual(m.a, { clave, maxMs: 8 * H, ahora: () => ahora })
  const c = await g.cargar('generali')
  assert.equal(c.estado, 'ok')
  await g.refrescar('generali', { cookies: [], origins: [] }, caduca)
  const r = abrirSesion(m.datos.get('generali')!, { compania: 'generali', clave, ahora })
  assert.ok(r.estado === 'ok' && r.sesion.caduca === caduca, 'el refresco no alarga la sesión')
  ahora = caduca
  m.datos.delete('generali')
  await g.refrescar('generali', estado, caduca)
  assert.equal(m.datos.has('generali'), false, 'una sesión caducada no se vuelve a guardar')
  m.datos.set('generali', token)
  await g.invalidar('generali')
  assert.equal(m.datos.has('generali'), false)
})

test('el aviso de sesión manual mantiene el motivo que asegura convierte en Telegram', () => {
  const e = new ErrorVerificacionHumana('generali', textoAvisoSesionManual('generali'))
  assert.equal(clasificar(e).tipo, 'captcha')
  assert.ok(e.message.startsWith(`${MOTIVO_VERIFICACION_HUMANA}: Generali: la sesión del robot`))
})

// ── cepos de forma ──
const SRC = join(import.meta.dirname, '..', 'src')
const fuentes = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? fuentes(join(dir, d.name)) : d.name.endsWith('.ts') ? [join(dir, d.name)] : []))

test('cepo: el storageState nunca va a disco y la bóveda es AES-256-GCM con AAD', () => {
  for (const f of fuentes(SRC)) {
    const s = readFileSync(f, 'utf8')
    assert.ok(!/storageState\s*\(\s*\{[^}]*path/.test(s), `${f}: storageState({ path }) escribe la sesión a disco`)
    assert.ok(!/writeFile(Sync)?\s*\([^)]*(sesion|storage)/i.test(s), `${f}: escribe la sesión a disco`)
  }
  const b = readFileSync(join(SRC, 'boveda-sesion.ts'), 'utf8')
  assert.match(b, /createCipheriv\('aes-256-gcm'/)
  assert.match(b, /c\.setAAD\(aad\(o\.compania\)\)/)
  assert.match(b, /d\.setAAD\(aad\(o\.compania\)\)/)
})

test('cepo: el modo manual no lee credenciales, ni reenvía SMS, ni rellena códigos', () => {
  const runner = readFileSync(join(SRC, 'runner.ts'), 'utf8')
  assert.match(runner, /if \(!fuente\.manual\) \{\s*try \{\s*const n = nombresCredencial/, 'en manual no se leen los CRED_*')
  for (const f of [join(SRC, 'sesion-manual.ts'), join(SRC, 'boveda-sesion.ts')]) {
    const s = readFileSync(f, 'utf8').replace(/^\s*(\/\/|\*).*$/gm, '')
    assert.ok(!/reenviar|resend|\.fill\(|\.type\(|otp|contrase|password/i.test(s), `${f}: nada de SMS/OTP/contraseñas`)
  }
})
