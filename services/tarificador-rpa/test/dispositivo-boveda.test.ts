// Dispositivo de confianza de Generali/Okta (prueba real b41be722, 19/10/2026): SMS verificado y 0 filas en
// `seguros.tarificador_sesiones`. El estado se guarda JUSTO tras verificar el SMS (no al terminar: vale aunque el mapa falle) y
// un fallo del PUT queda registrado con un motivo SIN datos sensibles (log + nota para el mensaje del resultado).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { abrirSesion, CADUCIDAD_DISPOSITIVO_MS, claveSesion } from '../src/boveda-sesion.ts'
import { GestorSesionManual, almacenHttp, fuenteDispositivo, motivoFalloBoveda, type AlmacenSesion } from '../src/sesion-manual.ts'

const clave = randomBytes(32)
const COOKIE = 'okta-dt-secreto-de-prueba-9876'
const estado = { cookies: [{ name: 'DT', value: COOKIE, domain: '.okta.com' }], origins: [] }
const T0 = 1_760_000_000_000

function registro() {
  const lineas: { m: string; d?: Record<string, unknown> }[] = []
  return { lineas, log: (m: string, d?: Record<string, unknown>) => { lineas.push({ m, d }) } }
}

test('alVerificar guarda en la bóveda EN ESE MOMENTO (30 días) y la fuente arranca el siguiente intento con ese estado', async () => {
  const guardados: { compania: string; token: string; caduca: number }[] = []
  const almacen: AlmacenSesion = { leer: async () => null, guardar: async (compania, token, caduca) => { guardados.push({ compania, token, caduca }) }, borrar: async () => {} }
  const gestor = new GestorSesionManual(almacen, { clave, maxMs: CADUCIDAD_DISPOSITIVO_MS, ahora: () => T0 })
  const r = registro()
  const f = fuenteDispositivo(gestor, 'generali', null, { log: r.log, ahora: () => T0 })
  assert.equal(f.previa(), null)
  await f.alVerificar(estado)
  assert.equal(guardados.length, 1, 'un PUT justo tras el SMS, sin esperar al final del trabajo')
  assert.equal(guardados[0]!.caduca, T0 + CADUCIDAD_DISPOSITIVO_MS)
  assert.ok(!guardados[0]!.token.includes(COOKIE), 'sellado: la cookie no viaja en claro')
  const a = abrirSesion(guardados[0]!.token, { compania: 'generali', clave, ahora: T0 + 1 })
  assert.equal(a.estado, 'ok')
  assert.deepEqual(f.previa(), estado)
  assert.equal(f.notaBoveda(), null)
  assert.deepEqual(r.lineas.map((l) => l.m), ['dispositivo_guardado'])
  // Un fallo posterior del trabajo (mapa incompleto) no borra nada.
  await f.alFallo(false)
  assert.deepEqual(f.previa(), estado)
})

test('PUT rechazado: no para el trabajo, queda registrado con el motivo SIN datos sensibles y en la nota del resultado', async () => {
  const almacen: AlmacenSesion = {
    leer: async () => null,
    guardar: async () => { throw new Error('almacén de sesión: guardar respondió 400 (caduca_excesiva)') },
    borrar: async () => {},
  }
  const gestor = new GestorSesionManual(almacen, { clave, maxMs: CADUCIDAD_DISPOSITIVO_MS, ahora: () => T0 })
  const r = registro()
  const f = fuenteDispositivo(gestor, 'generali', null, { log: r.log, ahora: () => T0 })
  await f.alVerificar(estado) // no lanza
  assert.deepEqual(r.lineas, [{ m: 'dispositivo_no_guardado', d: { motivo: 'almacen_guardar_400_caduca_excesiva' } }])
  assert.equal(f.notaBoveda(), 'dispositivo no guardado en la bóveda (almacen_guardar_400_caduca_excesiva)')
  assert.deepEqual(f.previa(), estado, 'en memoria sigue valiendo para el segundo intento')
  assert.ok(!JSON.stringify(r.lineas).includes(COOKIE) && !JSON.stringify(r.lineas).includes('v1.'))
})

test('sin TARIFICADOR_SESION_KEY: se registra el motivo (sin_clave / clave_mal_formada) al verificar', async () => {
  const motivoSin = (() => { try { claveSesion({}); return 'no' } catch (e) { return motivoFalloBoveda(e) } })()
  const motivoMal = (() => { try { claveSesion({ TARIFICADOR_SESION_KEY: Buffer.alloc(8).toString('base64') }); return 'no' } catch (e) { return motivoFalloBoveda(e) } })()
  assert.equal(motivoSin, 'sin_clave')
  assert.equal(motivoMal, 'clave_mal_formada')
  const r = registro()
  const f = fuenteDispositivo(null, 'generali', null, { log: r.log, motivoSinBoveda: motivoMal })
  await f.alVerificar(estado)
  assert.deepEqual(r.lineas, [{ m: 'dispositivo_no_guardado', d: { motivo: 'clave_mal_formada' } }])
  assert.match(f.notaBoveda() ?? '', /clave_mal_formada/)
})

test('motivoFalloBoveda: solo códigos (estado HTTP + código de asegura, red, tiempo); nunca el texto libre del error', () => {
  assert.equal(motivoFalloBoveda(new Error('almacén de sesión: guardar respondió 503')), 'almacen_guardar_503')
  assert.equal(motivoFalloBoveda(new Error('almacén de sesión: leer respondió 401')), 'almacen_leer_401')
  assert.equal(motivoFalloBoveda(Object.assign(new Error('The operation was aborted due to timeout'), { name: 'TimeoutError' })), 'almacen_tiempo')
  assert.equal(motivoFalloBoveda(new TypeError('fetch failed')), 'almacen_red')
  assert.equal(motivoFalloBoveda(new Error(`algo con ${COOKIE}`)), 'desconocido')
  assert.equal(motivoFalloBoveda(new Error('almacén de sesión: guardar respondió 400 (token v1.abc)')), 'desconocido', 'un paréntesis que no es un código no pasa')
})

test('almacenHttp.guardar: el error lleva el estado HTTP y el código de asegura, nunca el token', async () => {
  const original = globalThis.fetch
  globalThis.fetch = (async () => new Response(JSON.stringify({ estado: 'error', motivo: 'caduca_excesiva' }), { status: 400 })) as typeof fetch
  try {
    const a = almacenHttp({ apiUrl: 'https://asegura.invalid', secreto: 's' })
    await assert.rejects(a.guardar('generali', 'v1.TOKENSECRETO.zzz', T0), (e: unknown) => {
      const m = (e as Error).message
      assert.equal(m, 'almacén de sesión: guardar respondió 400 (caduca_excesiva)')
      assert.equal(motivoFalloBoveda(e), 'almacen_guardar_400_caduca_excesiva')
      return true
    })
    globalThis.fetch = (async () => new Response('<html>boom TOKENSECRETO</html>', { status: 500 })) as typeof fetch
    await assert.rejects(a.guardar('generali', 'v1.TOKENSECRETO.zzz', T0), (e: unknown) => (e as Error).message === 'almacén de sesión: guardar respondió 500')
  } finally {
    globalThis.fetch = original
  }
})
