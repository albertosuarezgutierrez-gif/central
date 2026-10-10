import assert from 'node:assert/strict'
import { test } from 'node:test'

import { decidirVistaPush, type EntradaVistaPush } from './push-estado.ts'

const BASE: EntradaVistaPush = {
  serviceWorker: true,
  pushManager: true,
  notificaciones: true,
  clavePublica: true,
  iosSinInstalar: false,
  permiso: 'default',
  suscripcionLocal: false,
}
const con = (c: Partial<EntradaVistaPush>) => decidirVistaPush({ ...BASE, ...c })

test('permiso concedido + suscripción local = activas', () => {
  assert.equal(con({ permiso: 'granted', suscripcionLocal: true }), 'activas')
})

test('permiso por pedir, sin suscripción = inactivas (se puede activar)', () => {
  assert.equal(con({ permiso: 'default' }), 'inactivas')
})

test('permiso concedido pero sin suscripción local = inactivas, no activas', () => {
  assert.equal(con({ permiso: 'granted', suscripcionLocal: false }), 'inactivas')
})

test('🚨 suscripción local con permiso `default` NO es activa', () => {
  assert.equal(con({ permiso: 'default', suscripcionLocal: true }), 'inactivas')
})

test('🚨 suscripción local con permiso `denied` es bloqueadas, nunca activas', () => {
  assert.equal(con({ permiso: 'denied', suscripcionLocal: true }), 'bloqueadas')
  assert.equal(con({ permiso: 'denied', suscripcionLocal: false }), 'bloqueadas')
})

test('permiso ilegible (null) no se da por concedido', () => {
  assert.equal(con({ permiso: null, suscripcionLocal: true }), 'inactivas')
})

test('iPhone/iPad sin instalar y sin PushManager manda a instalar, no calla', () => {
  assert.equal(con({ pushManager: false, iosSinInstalar: true }), 'instalar_ios')
  assert.equal(con({ serviceWorker: false, notificaciones: false, iosSinInstalar: true }), 'instalar_ios')
})

test('navegador sin soporte (no iOS) lo dice', () => {
  assert.equal(con({ pushManager: false }), 'sin_soporte')
  assert.equal(con({ serviceWorker: false }), 'sin_soporte')
  assert.equal(con({ notificaciones: false }), 'sin_soporte')
})

test('iOS con soporte (app ya instalada) sigue el camino normal', () => {
  assert.equal(con({ iosSinInstalar: false, permiso: 'granted', suscripcionLocal: true }), 'activas')
})

test('iOS sin instalar pero con soporte no se manda a instalar (no hace falta)', () => {
  assert.equal(con({ iosSinInstalar: true }), 'inactivas')
})

test('sin clave pública no se ofrece nada y no se culpa al navegador', () => {
  assert.equal(con({ clavePublica: false }), 'sin_configurar')
  assert.equal(con({ clavePublica: false, pushManager: false, iosSinInstalar: true }), 'sin_configurar')
})
