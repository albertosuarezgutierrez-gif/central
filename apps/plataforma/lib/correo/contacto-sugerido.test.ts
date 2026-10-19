import test from 'node:test'
import assert from 'node:assert/strict'

import { buscarFichaDeRemitente, debeSugerirContactoAseguradora, pareceContactoPersonal, textoAvisoCorreoCliente } from './contacto-sugerido.ts'

test('pareceContactoPersonal: un nombre.apellido es persona', () => {
  assert.equal(pareceContactoPersonal('ana.lopez@occidentinforma.com'), true)
})

test('🚨 los buzones genéricos conocidos NO se sugieren (ya se sabe que son genéricos)', () => {
  for (const local of ['mediadores', 'comunicacion.mediadores', 'no-reply', 'info', 'notificaciones']) {
    assert.equal(pareceContactoPersonal(`${local}@occidentinforma.com`), false, local)
  }
})

test('sin @ o vacío, no se sugiere (no hay nada que sugerir)', () => {
  assert.equal(pareceContactoPersonal(''), false)
  assert.equal(pareceContactoPersonal('texto sin arroba'), false)
})

test('mayúsculas y variantes no cuelan un genérico como persona', () => {
  assert.equal(pareceContactoPersonal('Mediadores@Occident.com'), false)
})

// 🚨 Caso real 19/10/2026 (datos ficticios): un CLIENTE reenvía desde su gmail a hola@ el aviso
// «Devolución de Recibo MAPFRE». La IA lo clasifica como correo de correduría y el triaje proponía
// a ese cliente como «Posible contacto nuevo de aseguradora». Un gmail NUNCA es una aseguradora.
test('🚨 un gmail que reenvía un recibo de Mapfre NO se propone como contacto de aseguradora', () => {
  assert.equal(debeSugerirContactoAseguradora('cliente.ficticio@gmail.com'), false)
})

test('🚨 ningún dominio de correo personal se propone como contacto de aseguradora', () => {
  for (const d of ['gmail.com', 'googlemail.com', 'hotmail.com', 'hotmail.es', 'outlook.es', 'live.com', 'yahoo.es', 'icloud.com', 'me.com', 'telefonica.net']) {
    assert.equal(debeSugerirContactoAseguradora(`ana.lopez@${d}`), false, d)
  }
})

test('un dominio que no es de una aseguradora conocida tampoco se propone', () => {
  assert.equal(debeSugerirContactoAseguradora('ana.lopez@talleres-ficticios.es'), false)
})

test('una persona de una aseguradora conocida SÍ se propone (y un buzón genérico suyo no)', () => {
  assert.equal(debeSugerirContactoAseguradora('ana.lopez@occidentinforma.com'), true)
  assert.equal(debeSugerirContactoAseguradora('Ana.Lopez@Mapfre.com'), true)
  assert.equal(debeSugerirContactoAseguradora('mediadores@occidentinforma.com'), false)
})

test('buscarFichaDeRemitente: el que no es aseguradora se busca como cliente; la aseguradora no', () => {
  assert.equal(buscarFichaDeRemitente('cliente.ficticio@gmail.com'), true)
  assert.equal(buscarFichaDeRemitente('ana.lopez@talleres-ficticios.es'), true)
  assert.equal(buscarFichaDeRemitente('avisosrecibos@info.mapfre.com'), false)
  assert.equal(buscarFichaDeRemitente('texto sin arroba'), false)
})

test('textoAvisoCorreoCliente: dice que es TU CLIENTE, el asunto y el enlace a su ficha (escapado)', () => {
  const t = textoAvisoCorreoCliente({
    nombre: 'Cliente <Ficticio>', asunto: 'Fwd: Devolución de Recibo MAPFRE',
    url: 'https://ejemplo.test/correduria/clientes/abc', anotado: true,
  })
  assert.match(t, /📩 <b>Correo de tu cliente Cliente &lt;Ficticio&gt;<\/b>: Fwd: Devolución de Recibo MAPFRE/)
  assert.match(t, /href="https:\/\/ejemplo\.test\/correduria\/clientes\/abc"/)
  assert.doesNotMatch(t, /contacto nuevo de aseguradora/i)
  assert.match(t, /historial/)
  assert.match(textoAvisoCorreoCliente({ nombre: 'X', asunto: 'a', url: 'u', anotado: false }), /NO he podido anotarlo/)
})
