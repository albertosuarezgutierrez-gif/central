import { test } from 'node:test'
import assert from 'node:assert/strict'
import { textoHistorialEnvioLead, validarEnvioLead } from './correo-lead-puro.ts'

const OK = {
  clienteId: '11111111-1111-4111-8111-111111111111',
  oportunidadIds: ['22222222-2222-4222-8222-222222222222'],
  to: 'Lead@Ejemplo.es',
  asunto: 'Re: Seguro de casa',
  texto: 'Hola: para prepararte la comparativa necesito estos datos…',
  enRespuestaA: { messageId: '<abc@mail.ejemplo.es>', references: [] },
  idempotencia: 'clp-17',
  actor: 'agente:telegram-1',
}

test('cuerpo bueno → normalizado', () => {
  const r = validarEnvioLead(OK)
  assert.equal(r.ok, true)
  if (r.ok) assert.equal(r.valor.to, 'lead@ejemplo.es')
})

test('🪤 sin Message-ID válido no hay envío (este puerto solo responde EN EL HILO)', () => {
  assert.equal(validarEnvioLead({ ...OK, enRespuestaA: undefined }).ok, false)
  assert.equal(validarEnvioLead({ ...OK, enRespuestaA: { messageId: 'abc', references: [] } }).ok, false)
})

test('🪤 un destino con varias direcciones o con nombre no pasa', () => {
  assert.equal(validarEnvioLead({ ...OK, to: 'a@b.es, c@d.es' }).ok, false)
  assert.equal(validarEnvioLead({ ...OK, to: '"X" <a@b.es>' }).ok, false)
})

test('ids, idempotencia y texto', () => {
  assert.equal(validarEnvioLead({ ...OK, clienteId: 'x' }).ok, false)
  assert.equal(validarEnvioLead({ ...OK, oportunidadIds: ['x'] }).ok, false)
  assert.equal(validarEnvioLead({ ...OK, idempotencia: 'a b' }).ok, false)
  assert.equal(validarEnvioLead({ ...OK, texto: 'corto' }).ok, false)
  assert.equal(validarEnvioLead({ ...OK, actor: '' }).ok, false)
})

test('el historial dice qué, por dónde y con el OK de quién, sin el cuerpo', () => {
  const t = textoHistorialEnvioLead('Re: Seguro de casa', 'agente:telegram-1')
  assert.match(t, /hola@grupoasegura\.es/)
  assert.match(t, /agente:telegram-1/)
  assert.doesNotMatch(t, /necesito estos datos/)
})
