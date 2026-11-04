import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  validarFormatoPin, esPinTrivial, hashPin, verificarPin, registrarFallo, registrarAcierto, estaBloqueado,
  minutosRestantes, intentosRestantes, loginConPin, firmarSesionPin, verificarSesionPin,
  ESTADO_BLOQUEO_INICIAL, type PinStore, type EstadoBloqueo, type CredencialPin,
} from './pin.ts'

const ITER = 1000 // tests rápidos
const POL = { maxIntentos: 3, bloqueoMinutos: 10 }
const min = (n: number) => n * 60000

test('formato: 4 dígitos por defecto, longitud configurable, solo dígitos', () => {
  assert.deepEqual(validarFormatoPin('4821'), { ok: true })
  assert.deepEqual(validarFormatoPin('482'), { ok: false, error: 'longitud' })
  assert.deepEqual(validarFormatoPin('48211'), { ok: false, error: 'longitud' })
  assert.deepEqual(validarFormatoPin('48a1'), { ok: false, error: 'no_digitos' })
  assert.deepEqual(validarFormatoPin(' 482'), { ok: false, error: 'no_digitos' })
  assert.deepEqual(validarFormatoPin(4821), { ok: false, error: 'no_es_texto' })
  assert.deepEqual(validarFormatoPin('48215930', { longitud: 8 }), { ok: true })
})

test('formato: triviales solo se rechazan si se pide', () => {
  for (const t of ['0000', '1111', '1234', '4321', '9876']) {
    assert.equal(esPinTrivial(t), true, t)
    assert.deepEqual(validarFormatoPin(t, { rechazarTriviales: true }), { ok: false, error: 'trivial' })
    assert.deepEqual(validarFormatoPin(t), { ok: true })
  }
  assert.equal(esPinTrivial('4821'), false)
  assert.equal(esPinTrivial('1235'), false)
})

test('hash: sal distinta por PIN, verifica el correcto y rechaza el resto', async () => {
  const h1 = await hashPin('4821', ITER)
  const h2 = await hashPin('4821', ITER)
  assert.notEqual(h1, h2)
  assert.doesNotMatch(h1, /4821/)
  assert.equal(await verificarPin('4821', h1), true)
  assert.equal(await verificarPin('4822', h1), false)
  assert.equal(await verificarPin('4821', 'basura'), false)
  assert.equal(await verificarPin('4821', null), false)
  assert.equal(await verificarPin('4821', 'pbkdf2-sha256$0$aa$bb'), false)
})

test('verificación usa secretoCoincide (tiempo constante), no ===', () => {
  const src = readFileSync(new URL('./pin.ts', import.meta.url), 'utf8')
  assert.match(src, /from '\.\/secreto-comparar\.ts'/)
  assert.match(src, /secretoCoincide\(await derivar/)
  assert.doesNotMatch(src, /derivar\([^)]*\)\)?\s*===\s*hash/)
  assert.doesNotMatch(src, /from 'node:crypto'/) // guardián de edge
})

test('bloqueo: N fallos bloquean T minutos y se desbloquea al vencer (fechas relativas)', () => {
  const t0 = new Date(Date.now())
  let e: EstadoBloqueo = ESTADO_BLOQUEO_INICIAL
  e = registrarFallo(e, t0, POL)
  e = registrarFallo(e, t0, POL)
  assert.equal(estaBloqueado(e, t0), false)
  assert.equal(intentosRestantes(e, POL), 1)
  e = registrarFallo(e, t0, POL)
  assert.equal(estaBloqueado(e, t0), true)
  assert.equal(minutosRestantes(e, t0), 10)
  assert.equal(minutosRestantes(e, new Date(t0.getTime() + min(9) + 1)), 1)
  assert.equal(estaBloqueado(e, new Date(t0.getTime() + min(10) - 1)), true)
  assert.equal(estaBloqueado(e, new Date(t0.getTime() + min(10))), false)
  // un fallo con el bloqueo vencido arranca la cuenta de cero
  const tras = registrarFallo(e, new Date(t0.getTime() + min(11)), POL)
  assert.equal(tras.intentos, 1)
  assert.equal(tras.bloqueadoHasta, null)
  // bloqueado: un fallo más no alarga
  assert.equal(registrarFallo(e, t0, POL), e)
  assert.deepEqual(registrarAcierto(), ESTADO_BLOQUEO_INICIAL)
})

function storeMemoria(creds: CredencialPin[]) {
  const bloqueos = new Map<string, EstadoBloqueo>()
  const s: PinStore = {
    buscarCredenciales: async (_t, u) => creds.filter(c => !u || c.usuarioId === u),
    leerBloqueo: async k => bloqueos.get(k) ?? ESTADO_BLOQUEO_INICIAL,
    guardarBloqueo: async (k, e) => { bloqueos.set(k, e) },
    resetearBloqueo: async k => { bloqueos.delete(k) },
  }
  return { s, bloqueos }
}

test('loginConPin: acierto, fallos, bloqueo, desbloqueo y reseteo', async () => {
  const { s, bloqueos } = storeMemoria([
    { usuarioId: 'u1', pinHash: await hashPin('4821', ITER), rol: 'mecanico' },
    { usuarioId: 'u2', pinHash: await hashPin('7305', ITER) },
  ])
  const t0 = new Date(Date.now())
  const base = { tenantId: 't1', claveBloqueo: 't1:1.2.3.4', politica: POL, ahora: t0 }
  const ok = await loginConPin(s, { ...base, pin: '7305' })
  assert.equal(ok.ok && ok.credencial.usuarioId, 'u2')
  assert.deepEqual(await loginConPin(s, { ...base, pin: '12' }), { ok: false, motivo: 'formato', error: 'longitud' })
  assert.deepEqual(await loginConPin(s, { ...base, pin: '9999' }), { ok: false, motivo: 'incorrecto', intentosRestantes: 2 })
  assert.deepEqual(await loginConPin(s, { ...base, pin: '9998' }), { ok: false, motivo: 'incorrecto', intentosRestantes: 1 })
  assert.deepEqual(await loginConPin(s, { ...base, pin: '9997' }), { ok: false, motivo: 'bloqueado', minutos: 10 })
  // bloqueado: ni el PIN bueno entra
  assert.equal((await loginConPin(s, { ...base, pin: '4821' })).ok, false)
  // pasado el tiempo, entra y se resetea
  const luego = { ...base, ahora: new Date(t0.getTime() + min(10)) }
  assert.equal((await loginConPin(s, { ...luego, pin: '4821' })).ok, true)
  assert.equal(bloqueos.has(base.claveBloqueo), false)
  // PIN por usuario: el de u2 no vale para u1
  assert.equal((await loginConPin(s, { ...luego, pin: '7305', usuarioId: 'u1' })).ok, false)
})

test('firma de sesión: roundtrip, manipulación y secreto ausente', async () => {
  const prev = process.env.TEST_PIN_SECRET
  process.env.TEST_PIN_SECRET = 's3creto-de-test'
  try {
    const f = await firmarSesionPin({ id: 'u1', rol: 'x', mods: ['b', 'a'] }, 'TEST_PIN_SECRET')
    assert.equal(await verificarSesionPin(f, 'TEST_PIN_SECRET'), true)
    assert.equal(await verificarSesionPin({ ...f, rol: 'admin' }, 'TEST_PIN_SECRET'), false)
    assert.equal(await verificarSesionPin({ id: 'u1' }, 'TEST_PIN_SECRET'), false)
    delete process.env.TEST_PIN_SECRET
    assert.equal(await verificarSesionPin(f, 'TEST_PIN_SECRET'), false)
    await assert.rejects(() => firmarSesionPin({ id: 'u1' }, 'TEST_PIN_SECRET'))
  } finally {
    if (prev === undefined) delete process.env.TEST_PIN_SECRET; else process.env.TEST_PIN_SECRET = prev
  }
})
