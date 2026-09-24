import { test } from 'node:test'
import assert from 'node:assert/strict'
import { leerMensaje, leerPendiente, textoAvisoRespuesta, textoDesenlaceRespuesta, type AvisoRespuesta, type DesenlaceRespuesta } from './mensajes-asegura.ts'

test('ningún fallo de la respuesta se lee como guardada', () => {
  const fallos: DesenlaceRespuesta[] = ['no_encontrado', 'invalido', 'poliza_no_valida', 'error']
  for (const f of fallos) assert.match(textoDesenlaceRespuesta(f), /^NO /, f)
  assert.match(textoDesenlaceRespuesta('error'), /NO se sabe/)
})

test('🪤 solo `enviado` dice que el aviso salió; `no_pedido` no pinta nada', () => {
  assert.equal(textoAvisoRespuesta('no_pedido'), null)
  assert.match(textoAvisoRespuesta('enviado')!, /avisado/)
  const fallos: AvisoRespuesta[] = ['sin_email', 'baja_de_correo', 'ilegible', 'sin_enlace', 'sin_proveedor', 'sin_remitente', 'rechazado', 'remitente_no_verificado', 'desconocido']
  for (const f of fallos) assert.doesNotMatch(textoAvisoRespuesta(f)!, /^Le hemos avisado/, f)
})

test('un mensaje sin autor conocido o sin texto es ilegible, no uno vacío', () => {
  const m = { id: 'm', autor: 'cliente', cuerpo: 'hola', creadoAt: '2026-09-24T10:00:00Z', polizaId: null, leidoAt: null }
  assert.ok(leerMensaje(m))
  assert.equal(leerMensaje({ ...m, autor: 'sistema' }), null)
  assert.equal(leerMensaje({ ...m, cuerpo: '' }), null)
})

test('una ficha «pendiente» con 0 sin leer no es una ficha pendiente', () => {
  const p = { clienteId: 'c', nombre: null, sinLeer: 2, ultimoAt: '2026-09-24T10:00:00Z', ultimo: 'x' }
  assert.ok(leerPendiente(p))
  assert.equal(leerPendiente({ ...p, sinLeer: 0 }), null)
  assert.equal(leerPendiente({ ...p, sinLeer: '2' }), null)
})
