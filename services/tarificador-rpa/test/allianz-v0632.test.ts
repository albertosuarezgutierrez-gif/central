// Allianz Turismos 0.6.32 (27/10/2026): la lista negra de ATRIBUTOS internos casa por TOKENS, no por subcadena: «sms» dentro de un blob base64
// del href no descarta «Descargar propuesta». El rótulo visible NO cambia. Fixtures SINTÉTICOS.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { decidirBotonDescargaProyecto, esControlDescargableProyecto, palabraBloqueadaEnAtributo, type ControlDescargaProyecto } from '../src/guard.ts'

const BLOB = 'blob:https://x.example/wewy4w9bquosyldfgfb+ttvnslgx3ynbvj0cxyslsmsdchihxwva/mmw+f1o2pvxfiyfaywks5k+ly970bd'
const boton = (href: string | null, attrs: Record<string, string> = {}, texto = 'Descargar propuesta'): ControlDescargaProyecto => ({
  desc: [texto, null, null, null, null, null, href, null, null, null, null, null], visible: true, habilitado: true, attrs,
})
const ok = (c: ControlDescargaProyecto) => esControlDescargableProyecto(c, 'allianz', true)

test('0.6.32 · href con blob base64 que contiene «sms» en medio: NO bloquea', () => {
  assert.equal(palabraBloqueadaEnAtributo(BLOB), null)
  assert.equal(ok(boton(BLOB)), true)
  assert.equal('indice' in decidirBotonDescargaProyecto([boton(BLOB)], 'allianz', true), true)
  assert.equal(ok(boton(null, { 'data-x': 'QUJDsmsREVGR0hJSktMTU5PUFFSU1RVVldYWVo0123456789' })), true)
})

test('0.6.32 · href javascript:enviarSms() y /propuesta/sms/enviar: bloquean', () => {
  assert.equal(ok(boton('javascript:enviarSms()')), false)
  assert.equal(ok(boton('/propuesta/sms/enviar')), false)
})

test('0.6.32 · casos de siempre siguen bloqueando (enviarSMS, sendSms, onclick, ng-click, class, data-accion)', () => {
  assert.equal(palabraBloqueadaEnAtributo('enviarSMS'), 'enviar')
  assert.equal(palabraBloqueadaEnAtributo('sendSms'), 'sms')
  assert.equal(palabraBloqueadaEnAtributo("go('sms')"), 'sms')
  assert.equal(palabraBloqueadaEnAtributo('enviar($ctrl.p)'), 'enviar')
  assert.equal(palabraBloqueadaEnAtributo('btn-sms'), 'sms')
  assert.equal(palabraBloqueadaEnAtributo('enviar-sms'), 'enviar')
  assert.equal(ok(boton(null, { class: 'btn-sms' })), false)
  assert.equal(ok(boton(null, { 'data-accion': 'enviar-sms' })), false)
})

test('0.6.32 · lanzarsms() (token pegado) sigue bloqueando', () => assert.equal(palabraBloqueadaEnAtributo('lanzarsms()'), 'sms'))

test('0.6.32 · el rótulo visible sigue bloqueando por subcadena de palabra (no se debilita)', () => {
  assert.equal(ok(boton(null, {}, 'Enviar propuesta por SMS')), false)
})
