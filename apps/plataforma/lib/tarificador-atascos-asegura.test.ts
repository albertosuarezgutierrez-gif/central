// Bots atascados y pausas del tarificador (F2, 14/10/2026): lectura del puerto, Telegram y botones. `node --test`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  MAX_BOTONES_ATASCO,
  actorTelegram,
  atascoValido,
  botonesAtasco,
  botonesPausa,
  componerAvisoAtasco,
  componerAvisoPausa,
  decidirBotonAtasco,
  interpretarAtascos,
  lineaTrasAtasco,
} from './tarificador-atascos-asegura.ts'

const ID = '11111111-1111-4111-8111-111111111111'
const TR = '22222222-2222-4222-8222-222222222222'
const cand = (n: number, o: Record<string, unknown> = {}) => ({ n, tag: 'input', id: `c${n}`, type: 'text', role: null, texto: null, etiqueta: `Campo ${n}`, ...o })
const atasco = (o: Record<string, unknown> = {}) => ({
  id: ID, trabajoId: TR, oportunidadId: null, compania: 'allianz', ramo: 'comunidades', tipo: 'campo', descripcion: 'Campo «Superficie»',
  etiqueta: 'Superficie', textoEsperado: null, candidatos: [cand(1), cand(2)], ronda: 1, maxRondas: 3,
  creadoEn: '2026-10-14T10:00:00Z', caducaEn: '2026-10-15T10:00:00Z', hayCaptura: true, ...o,
})

test('interpretarAtascos: un fallo del puerto NO es «no hay atascos»', () => {
  assert.equal(interpretarAtascos(401, null).estado, 'error')
  assert.equal(interpretarAtascos(404, null).estado, 'error')
  assert.equal(interpretarAtascos(503, { estado: 'error', causa: 'bd' }).estado, 'error')
  assert.equal(interpretarAtascos(200, { estado: 'sin_esquema' }).estado, 'sin_esquema')
  assert.equal(interpretarAtascos(503, { estado: 'sin_configurar' }).estado, 'sin_configurar')
  assert.equal(interpretarAtascos(200, { estado: 'ok' }).estado, 'error', 'sin listas no es «vacío»')
})

test('interpretarAtascos: una fila rara se CUENTA (no desaparece); una lista con hueco no se enseña a medias', () => {
  const r = interpretarAtascos(200, { estado: 'ok', atascos: [atasco(), atasco({ id: 'x' }), atasco({ candidatos: [cand(1), { n: 'dos' }] })], pausas: [{ id: ID, compania: 'mapfre', ramo: 'auto', motivo: 'm', pausadaEn: 'x', pendientes: 2 }], ilegibles: 1 })
  assert.equal(r.estado, 'ok')
  if (r.estado !== 'ok') return
  assert.equal(r.atascos.length, 1)
  assert.equal(r.pausas.length, 1)
  assert.equal(r.ilegibles, 3)
})

test('atascoValido: tres estados (ronda sin dato = null, nunca 0)', () => {
  assert.equal(atascoValido(atasco({ ronda: undefined }))?.ronda, null)
})

test('Telegram del atasco: sin selector, con los números y la caducidad; botones ≤ 64 bytes, Descartar aparte', () => {
  const a = atascoValido(atasco())!
  const t = componerAvisoAtasco(a)
  assert.match(t, /1 · Campo 1/)
  assert.match(t, /2 · Campo 2/)
  assert.doesNotMatch(t, /selector|xpath/i)
  const b = botonesAtasco(a)
  assert.deepEqual(b.at(-1), [{ texto: '❌ Descartar', callback: `atq_x:${ID}` }])
  for (const fila of b) for (const x of fila) assert.ok(Buffer.byteLength(x.callback) <= 64, x.callback)
  // Tope de botones: los 20 en el texto, solo MAX_BOTONES_ATASCO como botón.
  const muchos = atascoValido(atasco({ candidatos: Array.from({ length: 20 }, (_, i) => cand(i + 1)) }))!
  assert.equal(botonesAtasco(muchos).flat().length, MAX_BOTONES_ATASCO + 1)
  assert.match(componerAvisoAtasco(muchos), /20 · Campo 20/)
})

test('Telegram del atasco: escapa HTML del portal', () => {
  const a = atascoValido(atasco({ candidatos: [cand(1, { etiqueta: '<b>x</b> & y' })] }))!
  assert.match(componerAvisoAtasco(a), /&lt;b&gt;x&lt;\/b&gt; &amp; y/)
})

test('Telegram de la pausa: compañía/ramo/motivo y el botón Reanudar', () => {
  const p = { id: ID, compania: 'mapfre', ramo: 'auto', motivo: '3 trabajos seguidos en error', pausadaEn: 'x', pendientes: 2 }
  assert.match(componerAvisoPausa(p), /Mapfre · auto/)
  assert.match(componerAvisoPausa(p), /2 presupuesto/)
  assert.deepEqual(botonesPausa(p), [[{ texto: '▶️ Reanudar', callback: `tpa_r:${ID}` }]])
})

test('decidirBotonAtasco: solo el titular; callbacks exactos', () => {
  const yo = { from: { id: 42 } }
  assert.equal(decidirBotonAtasco({ from: { id: 7 } }, 'atq', 'e', [ID, '1'], '42').ok, false, 'otro usuario')
  assert.equal(decidirBotonAtasco(yo, 'atq', 'e', [ID, '1'], '').ok, false, 'sin chat configurado, nadie')
  assert.deepEqual(decidirBotonAtasco(yo, 'atq', 'e', [ID, '3'], '42'), { ok: true, tipo: 'elegir', atascoId: ID, n: 3, quien: '42' })
  assert.equal(decidirBotonAtasco(yo, 'atq', 'e', [ID, '21'], '42').ok, false)
  assert.equal(decidirBotonAtasco(yo, 'atq', 'e', [ID, '1', 'x'], '42').ok, false)
  assert.equal(decidirBotonAtasco(yo, 'atq', 'e', ['no-uuid', '1'], '42').ok, false)
  assert.deepEqual(decidirBotonAtasco(yo, 'atq', 'x', [ID], '42'), { ok: true, tipo: 'descartar', atascoId: ID, quien: '42' })
  assert.deepEqual(decidirBotonAtasco(yo, 'tpa', 'r', [ID], '42'), { ok: true, tipo: 'reanudar', pausaId: ID, quien: '42' })
  assert.equal(decidirBotonAtasco(yo, 'tpa', 'e', [ID, '1'], '42').ok, false)
})

test('lineaTrasAtasco: dice lo que pasó, y avisa si la compañía está en pausa', () => {
  const d = { ok: true as const, tipo: 'elegir' as const, atascoId: ID, n: 2, quien: '42' }
  assert.match(lineaTrasAtasco(d, { status: 200, json: { estado: 'respondido', pausada: false } }), /Elegido el 2/)
  assert.match(lineaTrasAtasco(d, { status: 200, json: { estado: 'respondido', pausada: true } }), /PAUSA/)
  assert.match(lineaTrasAtasco(d, { status: 409, json: { estado: 'conflicto', motivo: 'el atasco ya está caducado' } }), /No se ha podido: el atasco ya está caducado/)
  assert.equal(actorTelegram('42'), 'agente:telegram-42')
})

test('cableado: cron con ids LITERALES del catálogo, webhook con los dos prefijos y solo el titular', () => {
  const RAIZ = join(import.meta.dirname, '..')
  const cron = readFileSync(join(RAIZ, 'app/api/cron/tarificador-verificacion/route.ts'), 'utf8')
  assert.match(cron, /avisoPermitido\('correduria\.tarificador-atasco'\)/)
  assert.match(cron, /avisoEnviado\('correduria\.tarificador-atasco'\)/)
  assert.match(cron, /avisoPermitido\('correduria\.tarificador-pausa'\)/)
  assert.match(cron, /marcarAtascosAvisados\(/, 'lo que salió se marca en asegura')
  const wh = readFileSync(join(RAIZ, 'app/api/sivra/mensajes/telegram-webhook/route.ts'), 'utf8')
  assert.match(wh, /prefix === PREFIJO_ATASCO \|\| prefix === PREFIJO_PAUSA/)
  assert.match(wh, /decidirBotonAtasco\(cb, prefix, action, args, process\.env\.TELEGRAM_CHAT_ID\)/)
})
