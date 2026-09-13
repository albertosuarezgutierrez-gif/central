import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { autorizacionBasica, filasWebhook, hashPayload, leerEventoWebhook, tipoEvento } from './webhook.ts'

const basic = (u: string, p: string) => `Basic ${Buffer.from(`${u}:${p}`).toString('base64')}`

test('autorizacionBasica: acepta las credenciales exactas y rechaza todo lo demás', () => {
  assert.equal(autorizacionBasica(basic('avant2', 's3cr:eto'), 'avant2', 's3cr:eto'), true)
  assert.equal(autorizacionBasica(basic('avant2', 's3cr:eto'), 'avant2', 'otra'), false)
  assert.equal(autorizacionBasica(basic('otro', 's3cr:eto'), 'avant2', 's3cr:eto'), false)
  assert.equal(autorizacionBasica('Bearer abc', 'avant2', 'x'), false)
  assert.equal(autorizacionBasica(null, 'avant2', 'x'), false)
  assert.equal(autorizacionBasica('Basic %%%', 'avant2', 'x'), false)
})

test('autorizacionBasica: sin credenciales configuradas NUNCA autoriza (fail-closed)', () => {
  assert.equal(autorizacionBasica(basic('a', 'b'), undefined, 'b'), false)
  assert.equal(autorizacionBasica(basic('a', ''), 'a', ''), false)
})

test('filasWebhook: la raíz ARRAY (lo que manda el emisor real) se parte en una fila POR ELEMENTO', () => {
  const cuerpo = JSON.stringify([
    { insurance: { id: 111 }, status: { id: 'Pending' } },
    { insurance: { id: 222 }, status: { id: 'Rejected' }, policyNumber: 'P-222' },
  ])
  const filas = filasWebhook(cuerpo, JSON.parse(cuerpo))
  assert.equal(filas.length, 2)
  // El estado del segundo NO se atribuye al proyecto del primero.
  assert.equal(filas[0].evento.proyectoId, '111')
  assert.equal(filas[0].evento.tipo, 'otro')
  assert.equal(filas[0].evento.numeroPoliza, null)
  assert.equal(filas[1].evento.proyectoId, '222')
  assert.equal(filas[1].evento.tipo, 'rechazada')
  assert.equal(filas[1].evento.numeroPoliza, 'P-222')
  assert.deepEqual(filas.map((f) => f.evento.elementos), [2, 2])
  assert.deepEqual(filas.map((f) => f.evento.raiz), ['array', 'array'])
  // El contenido persistido es el elemento TAL CUAL; los hashes caben en varchar(64) y son distintos.
  assert.deepEqual(filas[1].contenido, JSON.parse(cuerpo)[1])
  assert.notEqual(filas[0].hash, filas[1].hash)
  for (const f of filas) assert.match(f.hash, /^[0-9a-f]{64}$/)
})

test('filasWebhook: objeto del CRM = una fila con el hash del cuerpo; array vacío y raíz rara = una fila tal cual', () => {
  const cuerpo = '{"project_id":"999999","event_type":"emision_ok"}'
  const [f] = filasWebhook(cuerpo, JSON.parse(cuerpo))
  assert.equal(f.hash, hashPayload(cuerpo))
  assert.deepEqual(f.evento, { raiz: 'objeto', elementos: 1, tipo: 'emision_ok', proyectoId: '999999', numeroPoliza: null })
  assert.equal(filasWebhook('[]', []).length, 1)
  assert.deepEqual(filasWebhook('[]', [])[0].evento, { raiz: 'array', elementos: 0, tipo: 'otro', proyectoId: null, numeroPoliza: null })
  assert.deepEqual(leerEventoWebhook('hola'), { raiz: 'otro', elementos: 0, tipo: 'otro', proyectoId: null, numeroPoliza: null })
})

test('leerEventoWebhook: el status manda sobre el discriminador `type`, y un id más largo que la columna es null', () => {
  const e = leerEventoWebhook({ type: 'insurance', status: { id: 'Approved' }, insurance: { id: 40685793 } })
  assert.equal(e.tipo, 'emision_ok')
  assert.equal(e.proyectoId, '40685793')
  assert.equal(leerEventoWebhook({ id: 'x'.repeat(80) }).proyectoId, null)
  assert.equal(leerEventoWebhook({ id: 'x'.repeat(50) }).proyectoId, 'x'.repeat(50))
})

test('tipoEvento: negativos primero, positivo por coincidencia exacta; lo demás es «otro», nunca emision_ok', () => {
  assert.equal(tipoEvento('Approved'), 'emision_ok')
  assert.equal(tipoEvento('emision_ok'), 'emision_ok')
  assert.equal(tipoEvento('Rejected'), 'rechazada')
  assert.equal(tipoEvento('expired'), 'vencida')
  assert.equal(tipoEvento('Failed'), 'error')
  assert.equal(tipoEvento('No emitida'), 'otro')
  assert.equal(tipoEvento('NotApproved'), 'otro')
  assert.equal(tipoEvento('IssuedWithErrors'), 'error')
  assert.equal(tipoEvento('PendingReview'), 'otro')
  assert.equal(tipoEvento(undefined), 'otro')
})

test('hashPayload: mismo cuerpo → mismo hash; un espacio de más → otro (dedupe por bytes)', () => {
  assert.equal(hashPayload('[1,2]'), hashPayload('[1,2]'))
  assert.notEqual(hashPayload('[1,2]'), hashPayload('[1, 2]'))
  assert.match(hashPayload('x'), /^[0-9a-f]{64}$/)
})

// ── Cepos sobre el FUENTE (ni tsc ni build miran esto) ──
const aqui = fileURLToPath(new URL('.', import.meta.url))
const ruta = readFileSync(`${aqui}../../app/api/webhooks/codeoscopic/route.ts`, 'utf8')
const middleware = readFileSync(`${aqui}../../middleware.ts`, 'utf8')

test('cepo: la ruta autentica ANTES de leer el cuerpo y de tocar la BD, y nunca acuña', () => {
  const iAuth = ruta.indexOf('autorizacionBasica(')
  const iCuerpo = ruta.indexOf('await req.text()')
  const iBd = ruta.indexOf('prismaAsegura()')
  assert.ok(iAuth > 0 && iAuth < iCuerpo && iCuerpo < iBd, 'orden: auth → cuerpo → BD')
  assert.doesNotMatch(ruta, /registrarPolizaEmitida|update codeoscopic_projects/)
})

test('cepo: un cuerpo repetido SUMA (veces/ultimo_at), no se descarta — si no, «dejó de mandar» y «manda lo mismo» se ven igual', () => {
  assert.match(ruta, /on conflict \(payload_hash\) do update\s+set veces = codeoscopic_webhook_events\.veces \+ 1, ultimo_at = now\(\)/)
  assert.doesNotMatch(ruta, /do nothing/)
})

test('cepo: /api/webhooks está exento del gate de sesión (si no, Codeoscopic recibe el HTML del login)', () => {
  assert.match(middleware, /const PUBLIC = \[[^\]]*'\/api\/webhooks'[^\]]*\]/)
})
