// Cepos de la emisión asistida, lado asegura (10/10/2026). `node --test`. Sin datos personales.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { generarTokenEmision } from '@central/module-tarificacion'
import { autorizadorEmision, estadoTrasResultado, iniciales, leerCanje, leerResultadoEmision, mensajePrimaDistinta } from './tarificador-emision-reglas.ts'

const T = '11111111-1111-4111-8111-111111111111'
const DIR = import.meta.dirname
const fuente = (rel: string) => readFileSync(join(DIR, rel), 'utf8')

test('autorizador: solo un id numérico configurado; sin env, nadie', () => {
  assert.equal(autorizadorEmision({ TARIFICADOR_EMISION_TELEGRAM_ID: '123456789' }), '123456789')
  assert.equal(autorizadorEmision({}), null)
  assert.equal(autorizadorEmision({ TARIFICADOR_EMISION_TELEGRAM_ID: '' }), null)
  assert.equal(autorizadorEmision({ TARIFICADOR_EMISION_TELEGRAM_ID: 'alberto' }), null)
})

test('cuerpos del worker: pre_emision exige prima en céntimos enteros', () => {
  assert.equal(leerResultadoEmision({ trabajoId: T, resultado: 'pre_emision', primaCents: 34755 }).ok, true)
  for (const primaCents of [0, -1, 347.55, '34755', null]) assert.equal(leerResultadoEmision({ trabajoId: T, resultado: 'pre_emision', primaCents }).ok, false, String(primaCents))
  assert.equal(leerResultadoEmision({ trabajoId: 'x', resultado: 'pre_emision', primaCents: 1 }).ok, false)
  assert.equal(leerResultadoEmision({ trabajoId: T, resultado: 'ok' }).ok, false)
})

test('canje: token con forma, en el CUERPO; sin token → 400', () => {
  const token = generarTokenEmision()
  assert.equal(leerCanje({ trabajoId: T, token, primaCents: 100 }).ok, true)
  assert.equal(leerCanje({ trabajoId: T, primaCents: 100 }).ok, false)
  assert.equal(leerCanje({ trabajoId: T, token: 'corto', primaCents: 100 }).ok, false)
})

test('tras el clic: solo «emitida» CON nº de póliza es emitido; el resto, requiere_humano y nunca reintento', () => {
  assert.equal(estadoTrasResultado({ trabajoId: T, resultado: 'emitida', numeroPoliza: 'ABC123456', captura: null }).estado, 'emitido')
  const sinNumero = estadoTrasResultado({ trabajoId: T, resultado: 'emitida', numeroPoliza: null, captura: null })
  assert.equal(sinNumero.estado, 'requiere_humano')
  assert.equal(sinNumero.resultadoAutorizacion, 'incierto')
  assert.equal(sinNumero.error?.tipo, 'emision')
  assert.equal(estadoTrasResultado({ trabajoId: T, resultado: 'incierto', motivo: 'x', captura: null }).estado, 'requiere_humano')
  assert.equal(estadoTrasResultado({ trabajoId: T, resultado: 'no_emitida', motivo: 'x', captura: null }).resultadoAutorizacion, 'fallo')
})

test('un nº de póliza raro no se guarda (null = no se pudo leer)', () => {
  const r = leerResultadoEmision({ trabajoId: T, resultado: 'emitida', numeroPoliza: 'Póliza emitida correctamente' })
  assert.ok(r.ok && r.r.resultado === 'emitida' && r.r.numeroPoliza === null)
})

test('textos: iniciales y prima distinta en formato español', () => {
  assert.equal(iniciales('Comunidad', 'de Propietarios Ejemplo'), 'C.D.P.')
  assert.equal(iniciales(null, null), '—')
  assert.match(mensajePrimaDistinta(34756, 34755), /347,56€.*347,55€/)
})

test('el SQL del canje exige lo mismo que decidirCanje (token, trabajo, sin consumir, sin caducar, mismo hash)', () => {
  const src = fuente('tarificador-emision.ts')
  const canje = src.slice(src.indexOf('export async function canjearEmision'), src.indexOf('// ─── 4.'))
  const update = canje.match(/update seguros\.tarificacion_emision_autorizacion set consumido_at = now\(\)\s*\n\s*where ([^`]+)`/)
  assert.ok(update, 'falta el UPDATE atómico del canje')
  for (const c of ['token_hash = ${tokenHash}', 'trabajo_id = ${t.id}::uuid', 'consumido_at is null', 'expira_at > now()', 'hash_datos = ${hashDatos}']) {
    assert.ok(update![1].includes(c), `el canje no exige ${c}`)
  }
  assert.match(canje, /if \(ok === 1\) return \{ ok: true/, 'solo 1 fila actualizada autoriza')
  // La entrega del token es UNA: token_hash IS NULL en el UPDATE.
  assert.match(src, /set token_hash = \$\{hashTokenEmision\(token\)\}, entregado_at = now\(\)\s*\n\s*where id = \$\{a\.id\}::uuid and token_hash is null/)
})

test('el token nunca va a un log ni a un mensaje', () => {
  for (const rel of ['tarificador-emision.ts', '../app/api/tarificador/emision/canje/route.ts', '../app/api/tarificador/trabajo/[id]/route.ts']) {
    const src = fuente(rel)
    for (const l of src.split('\n').filter((x) => /console\.|registrarErrorCartera\(|JSON\.stringify\(\{ tipo/.test(x))) {
      assert.ok(!/token|body|\bl\b\)/.test(l.replace(/l\.trabajoId/g, '')), `${rel}: una línea de log/mensaje nombra el token o el cuerpo: ${l.trim()}`)
    }
  }
})

test('la autorización comprueba from.id contra la env, la caducidad y re-comprueba el presupuesto', () => {
  const src = fuente('tarificador-emision.ts')
  const aut = src.slice(src.indexOf('export async function autorizarEmision'), src.indexOf('// ─── 6.'))
  assert.match(aut, /autorizadorEmision\(env\)/)
  assert.match(aut, /String\(e\.autorizadoPor\)\.trim\(\) !== autorizador/)
  assert.match(aut, /decidirAutorizacion\(/)
  assert.match(aut, /precondicionesEmision\(/)
  assert.match(aut, /on conflict \(trabajo_id\) do nothing/, 'doble pulsación = una sola autorización')
})

test('emitir no toca presupuesto.emitido_at (la anulación de la póliza vieja es MANUAL)', () => {
  const src = fuente('tarificador-emision.ts').split('\n').filter((l) => !/^\s*(\/\/|\*)/.test(l)).join('\n')
  assert.ok(!/set[^`]*emitido_at/i.test(src), 'tarificador-emision.ts escribe emitido_at')
})
