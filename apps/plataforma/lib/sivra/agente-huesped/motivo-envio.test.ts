import test from 'node:test'
import assert from 'node:assert/strict'
import { motivoFalloEnvio, avisoFalloEnvio } from './motivo-envio.ts'

// Caso fundacional (16/09/2026, reserva 155333446): Smoobu devolvía 503 con su página «System
// Outage» y el aviso decía «vuelve a darle a ✅ Enviar en un momento» — Alberto lo pulsó tres veces.
test('un 503 de Smoobu se identifica como caída del proveedor', () => {
  const m = motivoFalloEnvio(503, '<!DOCTYPE html><title>System Outage | Smoobu</title>')
  assert.equal(m.clase, 'proveedor_caido')
  assert.equal(m.reintentable, true)
  assert.match(m.texto, /ca[íi]do/i)
})

// La página de outage puede llegar con otro status (un proxy delante, o un 200 con HTML): lo que
// manda es el CUERPO, no el código — si solo se mirara el 503, un outage servido con otro status se
// clasificaría como «respuesta inesperada» y el aviso volvería a ser el genérico.
test('la página de outage se detecta aunque el status no sea 5xx', () => {
  assert.equal(motivoFalloEnvio(200, '<title>System Outage | Smoobu</title>').clase, 'proveedor_caido')
})

// Reintentar una credencial mala es gastar pulsaciones: tiene que decirlo.
test('401/403 no son reintentables y apuntan a la credencial', () => {
  for (const s of [401, 403]) {
    const m = motivoFalloEnvio(s, '')
    assert.equal(m.clase, 'sin_credencial', `status ${s}`)
    assert.equal(m.reintentable, false, `status ${s}`)
    assert.match(m.texto, /pms_connections/)
  }
})

test('el 401 propio de "sin secreto" no se confunde con credencial rechazada', () => {
  const m = motivoFalloEnvio(401, '{"error":"smoobu_sin_secreto"}')
  assert.equal(m.clase, 'sin_credencial')
  assert.equal(m.reintentable, false)
  assert.match(m.texto, /smoobu_api_secret/)
})

test('404 = reserva desconocida, y no se reintenta', () => {
  const m = motivoFalloEnvio(404, '')
  assert.equal(m.clase, 'reserva_desconocida')
  assert.equal(m.reintentable, false)
})

test('429 se reintenta; un 4xx cualquiera no', () => {
  assert.equal(motivoFalloEnvio(429, '').reintentable, true)
  assert.equal(motivoFalloEnvio(422, '').reintentable, false)
})

test('status 0 (excepción de red) es reintentable', () => {
  const m = motivoFalloEnvio(0, '')
  assert.equal(m.clase, 'red')
  assert.equal(m.reintentable, true)
})

// El cuerpo de Smoobu es HTML: si se colara en el aviso, Telegram rompería el parse_mode.
test('el aviso NO arrastra el cuerpo crudo de Smoobu', () => {
  const cuerpo = '<!DOCTYPE html><html><head><title>System Outage | Smoobu</title></head></html>'
  const m = motivoFalloEnvio(503, cuerpo)
  assert.ok(!m.texto.includes('<'), m.texto)
  const aviso = avisoFalloEnvio(m)
  assert.ok(!aviso.includes('DOCTYPE'), aviso)
  assert.ok(!aviso.includes('<html'), aviso)
})

test('el aviso desaconseja reintentar cuando no sirve de nada', () => {
  assert.match(avisoFalloEnvio(motivoFalloEnvio(401, '')), /no lo reintentes/i)
  assert.match(avisoFalloEnvio(motivoFalloEnvio(503, '')), /vuelve a darle/i)
})
