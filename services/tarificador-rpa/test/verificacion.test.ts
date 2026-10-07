// Verificación humana (SMS/OTP): detección por señales genéricas, error clasificado no reintentable y aviso.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { ErrorVerificacionHumana, MOTIVO_VERIFICACION_HUMANA, clasificar, clasificarIntento } from '../src/errores.ts'
import { SELECTORES_OTP, esPantallaVerificacion, textoAvisoVerificacion } from '../src/verificacion.ts'

const pistas = { logueado: true, loginVisible: false, ultimo5xx: null }

test('detecta un campo OTP aunque el texto no diga nada', () => {
  assert.equal(esPantallaVerificacion({ hayCampoOtp: true, texto: '' }), true)
  assert.ok(SELECTORES_OTP.includes('input[autocomplete="one-time-code"]'))
})

test('detecta textos de segundo factor / código de verificación / SMS con código', () => {
  for (const t of [
    'Introduce el código de verificación',
    'Verificación en dos pasos',
    'Segundo factor de autenticación',
    'Te hemos enviado un SMS con un código a tu móvil',
    'Enter the one-time code',
    'Hemos enviado el código',
  ]) assert.equal(esPantallaVerificacion({ hayCampoOtp: false, texto: t }), true, t)
})

test('una pantalla normal NO es verificación (ni «SMS» a secas en un pie de página)', () => {
  for (const t of ['Mediador principal · Nueva póliza · Calcular', 'Aviso legal. Recibirás comunicaciones por SMS y correo.', ''])
    assert.equal(esPantallaVerificacion({ hayCampoOtp: false, texto: t }), false, t)
})

test('el error es requiere_humano (tipo captcha en el cable), NO reintentable, con el aviso exacto', () => {
  const e = new ErrorVerificacionHumana('allianz')
  assert.equal(e.motivo, MOTIVO_VERIFICACION_HUMANA)
  assert.equal(e.transitorio, false)
  assert.equal(clasificar(e).tipo, 'captcha')
  assert.ok(e.message.includes('Allianz pide verificación: entra en su portal, valida y pulsa Reintentar'))
  assert.equal(textoAvisoVerificacion('occident'), 'Occident pide verificación: entra en su portal, valida y pulsa Reintentar')
  // Aunque se vea el login o un 5xx, el runner no lo reintenta.
  assert.equal(clasificarIntento(e, { logueado: true, loginVisible: true, ultimo5xx: 503 }).transitorio, null)
  assert.equal(clasificarIntento(e, pistas).transitorio, null)
})

test('cepo: verificacion.ts solo LEE (sin fill/click/press/type) y nunca nombra el código', () => {
  const src = readFileSync(new URL('../src/verificacion.ts', import.meta.url), 'utf8').replace(/\/\/.*$/gm, '')
  assert.doesNotMatch(src, /\.(fill|click|press|type|check|selectOption|pressSequentially)\(/)
  assert.doesNotMatch(src, /process\.env|console\.|inputValue|getAttribute\(.value/)
})
