import { test } from 'node:test'
import assert from 'node:assert/strict'
import { esTokenBajaValido, urlBaja, urlPublicaAsegura } from './recaptacion-baja.ts'

test('un uuid con forma correcta es válido', () => {
  assert.equal(esTokenBajaValido('12345678-1234-1234-1234-123456789012'), true)
})

test('cualquier otra cosa no es un token válido', () => {
  assert.equal(esTokenBajaValido(null), false)
  assert.equal(esTokenBajaValido(undefined), false)
  assert.equal(esTokenBajaValido(''), false)
  assert.equal(esTokenBajaValido('no-soy-un-uuid'), false)
  assert.equal(esTokenBajaValido('12345678123412341234123456789012'), false)
})

test('la url de baja lleva el token tal cual', () => {
  assert.equal(
    urlBaja('https://central-asegura.vercel.app', 'abc-123'),
    'https://central-asegura.vercel.app/api/publico/recaptacion/baja?t=abc-123',
  )
})

test('la url de baja no duplica la barra si la base la lleva', () => {
  assert.equal(
    urlBaja('https://central-asegura.vercel.app/', 'abc-123'),
    'https://central-asegura.vercel.app/api/publico/recaptacion/baja?t=abc-123',
  )
})

test('urlPublicaAsegura usa VERCEL_PROJECT_PRODUCTION_URL si está', () => {
  assert.equal(urlPublicaAsegura({ VERCEL_PROJECT_PRODUCTION_URL: 'central-asegura.vercel.app' }), 'https://central-asegura.vercel.app')
})

test('urlPublicaAsegura cae a VERCEL_URL si no hay production url', () => {
  assert.equal(urlPublicaAsegura({ VERCEL_URL: 'preview-xyz.vercel.app' }), 'https://preview-xyz.vercel.app')
})

test('urlPublicaAsegura cae al dominio conocido sin ninguna env', () => {
  assert.equal(urlPublicaAsegura({}), 'https://central-asegura.vercel.app')
})
