// Allianz Turismos 0.6.33 (27/10/2026): un token opaco que ACABA en una raíz («…exemit») dentro de un href codificado ya no bloquea «Descargar propuesta».
// Las palabras legibles (emitirPoliza, btnEmitir, /poliza/emitir) siguen bloqueando. Fixtures SINTÉTICOS / fragmento de diagnóstico sin PII.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { esControlDescargableProyecto, palabraBloqueadaEnAtributo, type ControlDescargaProyecto } from '../src/guard.ts'

const DIAG = 'blob:https://x.example/apx4dultpcorkmamv87p0wkvg/tbo3/nrzldmqexemit+h4aytdyiicgjab2oomvnaf8bqc/h/aaewx8pote'
const boton = (href: string | null, attrs: Record<string, string> = {}, texto = 'Descargar propuesta'): ControlDescargaProyecto => ({
  desc: [texto, null, null, null, null, null, href, null, null, null, null, null], visible: true, habilitado: true, attrs,
})
const ok = (c: ControlDescargaProyecto) => esControlDescargableProyecto(c, 'allianz', true)

test('0.6.33 · href codificado con «…exemit» en medio: NO bloquea', () => {
  assert.equal(palabraBloqueadaEnAtributo(DIAG), null)
  assert.equal(palabraBloqueadaEnAtributo('nrzldmqexemit'), null)
  assert.equal(ok(boton(DIAG)), true)
})

test('0.6.33 · palabras legibles en atributos siguen bloqueando', () => {
  assert.notEqual(palabraBloqueadaEnAtributo('emitirPoliza'), null)
  assert.notEqual(palabraBloqueadaEnAtributo('btnEmitir'), null)
  assert.notEqual(palabraBloqueadaEnAtributo('btnemitir'), null)
  assert.notEqual(palabraBloqueadaEnAtributo('emitirpoliza'), null)
  assert.notEqual(palabraBloqueadaEnAtributo('doemit'), null)
  assert.notEqual(palabraBloqueadaEnAtributo('enviarSms'), null)
  assert.notEqual(palabraBloqueadaEnAtributo('/poliza/emitir'), null)
  assert.notEqual(palabraBloqueadaEnAtributo('/propuesta/sms/enviar'), null)
  assert.equal(ok(boton(null, { 'data-action': 'emitirPoliza' })), false)
  assert.equal(ok(boton(null, { id: 'btnEmitir' })), false)
  assert.equal(ok(boton(null, { id: 'btnemitir' })), false)
  assert.equal(ok(boton('/poliza/emitir')), false)
  assert.equal(ok(boton('https://x.example/a/sms/b')), false)
})

test('v0.6.33: el valor de una consulta legible sigue bloqueando; el blob con relleno = no', () => {
  assert.notEqual(palabraBloqueadaEnAtributo('/poliza?accion=emitir'), null)
  assert.notEqual(palabraBloqueadaEnAtributo('https://x.example/a?op=enviarSms&b=1'), null)
  assert.equal(palabraBloqueadaEnAtributo('/doc?t=nrzldmqexemitH4aytdyiicgjab2oomvnaf8bqc=='), null)
})
