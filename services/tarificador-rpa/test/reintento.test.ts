// Reintento del worker y sesión en memoria (06/10/2026): qué es transitorio, cuánto se espera, si cabe en el
// lease, el TTL de la sesión (y que no se serializa) y que los trabajos van en serie.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { inspect } from 'node:util'
import { EmisionBloqueadaError } from '@central/module-tarificacion'
import {
  ErrorTarificador,
  MIN_INTENTO_MS,
  cabeReintento,
  clasificarIntento,
  esperaReintentoMs,
  limiteDelTrabajo,
  type PistasIntento,
} from '../src/errores.ts'
import { SesionEnMemoria, enSerie } from '../src/sesion.ts'

const nada: PistasIntento = { logueado: false, loginVisible: false, ultimo5xx: null }

test('transitorios: timeout de NAVEGACIÓN, sesión caducada, 5xx y portal marcado', () => {
  assert.equal(clasificarIntento(new Error('page.goto: Timeout 30000ms exceeded.'), nada).transitorio, 'timeout_navegacion')
  assert.equal(clasificarIntento(new Error('frame.waitForURL: Timeout 30000ms exceeded.'), nada).transitorio, 'timeout_navegacion')
  assert.equal(clasificarIntento(new Error('locator.waitFor: Timeout 30000ms exceeded.'), { ...nada, logueado: true, loginVisible: true }).transitorio, 'sesion_caducada')
  assert.equal(clasificarIntento(new Error('lo que sea'), { ...nada, ultimo5xx: 503 }).transitorio, 'portal_5xx')
  const m = new ErrorTarificador('portal', 'ePAC respondió 502', { transitorio: true })
  assert.equal(clasificarIntento(m, nada).transitorio, 'portal_transitorio')
  assert.equal(clasificarIntento(m, nada).tipo, 'portal')
})

test('definitivos: selector que no aparece, datos, credenciales, captcha, emisión/guard e infra', () => {
  assert.equal(clasificarIntento(new Error('locator.waitFor: Timeout 30000ms exceeded.'), nada).transitorio, null)
  // Sin login previo, ver el formulario de login no es «sesión caducada».
  assert.equal(clasificarIntento(new Error('x'), { ...nada, loginVisible: true }).transitorio, null)
  const conTodo: PistasIntento = { logueado: true, loginVisible: true, ultimo5xx: 500 }
  for (const tipo of ['datos', 'credenciales', 'captcha', 'emision', 'infra'] as const) {
    assert.equal(clasificarIntento(new ErrorTarificador(tipo, 'x', { transitorio: true }), conTodo).transitorio, null, tipo)
  }
  assert.equal(clasificarIntento(new EmisionBloqueadaError('url', 'https://x/emitir'), conTodo).transitorio, null)
  assert.equal(clasificarIntento(new Error('net::ERR_CONNECTION_RESET'), conTodo).tipo, 'infra')
  assert.equal(clasificarIntento(new Error('net::ERR_CONNECTION_RESET'), conTodo).transitorio, null)
  // `transitorio` solo existe para `portal`.
  assert.equal(new ErrorTarificador('datos', 'x', { transitorio: true }).transitorio, false)
})

test('espera de 20 a 40 s', () => {
  assert.equal(esperaReintentoMs(() => 0), 20_000)
  assert.equal(esperaReintentoMs(() => 0.999999), 40_000)
  for (let i = 0; i < 50; i++) {
    const e = esperaReintentoMs()
    assert.ok(e >= 20_000 && e <= 40_000)
  }
})

test('límite = lease − margen (o tope sin lease) y reintento solo si cabe', () => {
  const t0 = Date.parse('2026-10-06T10:00:00Z')
  assert.equal(limiteDelTrabajo(t0, '2026-10-06T10:06:00Z', 240_000, 330_000), t0 + 330_000)
  assert.equal(limiteDelTrabajo(t0, '2026-10-06T10:05:00Z', 240_000, 330_000), t0 + 270_000)
  assert.equal(limiteDelTrabajo(t0, undefined, 240_000, 330_000), t0 + 240_000)
  assert.equal(limiteDelTrabajo(t0, 'no-es-fecha', 240_000, 330_000), t0 + 240_000)
  assert.equal(cabeReintento(t0, t0 + 30_000 + MIN_INTENTO_MS, 30_000), true)
  assert.equal(cabeReintento(t0, t0 + 30_000 + MIN_INTENTO_MS - 1, 30_000), false)
})

test('sesión en memoria: TTL, invalidar y nunca se serializa', () => {
  let ahora = 1_000
  const s = new SesionEnMemoria(10 * 60_000, () => ahora)
  assert.equal(s.obtener(), null)
  const estado = { cookies: [{ name: 'JSESSIONID', value: 'secreto-de-sesion' }], origins: [] }
  s.guardar(estado)
  assert.equal(s.obtener(), estado)
  ahora += 10 * 60_000 - 1
  assert.equal(s.viva, true)
  ahora += 1
  assert.equal(s.obtener(), null, 'a los 10 min caduca')
  s.guardar(estado)
  s.invalidar()
  assert.equal(s.obtener(), null)
  s.guardar(estado)
  assert.ok(!JSON.stringify({ s }).includes('secreto-de-sesion'))
  assert.ok(!inspect(s, { depth: 5 }).includes('secreto-de-sesion'))
})

test('enSerie: un trabajo a la vez, aunque el anterior falle', async () => {
  const orden: string[] = []
  let activos = 0
  const trabajo = (n: string, falla = false) => async () => {
    activos++
    assert.equal(activos, 1, 'dos trabajos a la vez')
    orden.push(`+${n}`)
    await new Promise((r) => setTimeout(r, 20))
    orden.push(`-${n}`)
    activos--
    if (falla) throw new Error('falla')
    return n
  }
  const r = await Promise.allSettled([enSerie(trabajo('a', true)), enSerie(trabajo('b')), enSerie(trabajo('c'))])
  assert.deepEqual(orden, ['+a', '-a', '+b', '-b', '+c', '-c'])
  assert.equal(r[0].status, 'rejected')
  assert.deepEqual(r.slice(1).map((x) => x.status === 'fulfilled' && x.value), ['b', 'c'])
})
