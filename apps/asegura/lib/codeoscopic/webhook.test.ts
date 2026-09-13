import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { autorizacionBasica, hashPayload, leerEventoWebhook, tipoEvento } from './webhook.ts'

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

test('leerEventoWebhook: la raíz ARRAY (lo que manda el emisor real) se lee y se cuenta', () => {
  const e = leerEventoWebhook([{ insurance: { id: 40685793 }, status: { id: 'Approved' }, policyNumber: 'ALZ-1' }, { foo: 1 }])
  assert.equal(e.raiz, 'array')
  assert.equal(e.elementos, 2)
  assert.equal(e.proyectoId, '40685793')
  assert.equal(e.tipo, 'emision_ok')
  assert.equal(e.numeroPoliza, 'ALZ-1')
})

test('leerEventoWebhook: objeto del CRM (project_id + event_type) y raíz rara', () => {
  const o = leerEventoWebhook({ project_id: '999999', event_type: 'emision_ok' })
  assert.deepEqual(o, { raiz: 'objeto', elementos: 1, tipo: 'emision_ok', proyectoId: '999999', numeroPoliza: null })
  assert.deepEqual(leerEventoWebhook('hola'), { raiz: 'otro', elementos: 0, tipo: 'otro', proyectoId: null, numeroPoliza: null })
  assert.equal(leerEventoWebhook([]).elementos, 0)
})

test('tipoEvento: lo que no se reconoce es «otro», nunca emision_ok', () => {
  assert.equal(tipoEvento('Rejected'), 'rechazada')
  assert.equal(tipoEvento('expired'), 'vencida')
  assert.equal(tipoEvento('Failed'), 'error')
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
  assert.match(ruta, /on conflict \(payload_hash\) do nothing/)
  assert.doesNotMatch(ruta, /registrarPolizaEmitida|update codeoscopic_projects/)
})

test('cepo: /api/webhooks está exento del gate de sesión (si no, Codeoscopic recibe el HTML del login)', () => {
  assert.match(middleware, /const PUBLIC = \[[^\]]*'\/api\/webhooks'[^\]]*\]/)
})
