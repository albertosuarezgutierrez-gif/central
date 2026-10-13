import assert from 'node:assert/strict'
import { test } from 'node:test'

import { DIAS_POSPONER_BIENVENIDA } from '@central/module-seguros-portal'

import {
  DIAS_POSPONER,
  decidirBienvenidaAvisos,
  decidirRegistroAvisos,
  decidirVistaPush,
  type EntradaBienvenida,
  type EntradaVistaPush,
} from './push-estado.ts'

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

// ─── Bienvenida de avisos y consentimiento (13/10/2026) ─────────────────────

const AHORA = new Date('2026-10-13T10:00:00Z')
const hace = (dias: number) => new Date(AHORA.getTime() - dias * 86_400_000)
const BIEN: EntradaBienvenida = { vista: 'inactivas', corredor: false, pospuestaEn: null, pospuestaVista: null, ahora: AHORA }
const bien = (c: Partial<EntradaBienvenida>) => decidirBienvenidaAvisos({ ...BIEN, ...c })

test('bienvenida: se pregunta solo si en este dispositivo se puede activar; iPhone sin instalar → guía', () => {
  assert.equal(bien({}), 'preguntar')
  assert.equal(bien({ vista: 'instalar_ios' }), 'guiar_ios')
  for (const vista of ['activas', 'bloqueadas', 'sin_soporte', 'sin_configurar'] as const) {
    assert.equal(bien({ vista }), 'no', `con ${vista} no hay nada que preguntar`)
  }
})

test('🚨 bienvenida: permiso «denegado» no se pregunta (pulsar Sí no podría hacer nada)', () => {
  const vista = decidirVistaPush({ ...BASE, permiso: 'denied' })
  assert.equal(bien({ vista }), 'no')
})

test('bienvenida: «Ahora no» la tapa 14 días, no 13', () => {
  assert.equal(DIAS_POSPONER, DIAS_POSPONER_BIENVENIDA, 'la app y el módulo dicen lo mismo')
  assert.equal(bien({ pospuestaEn: hace(13), pospuestaVista: 'inactivas' }), 'no')
  assert.equal(bien({ pospuestaEn: hace(14), pospuestaVista: 'inactivas' }), 'preguntar')
  assert.equal(bien({ pospuestaEn: new Date(AHORA.getTime() + 60_000), pospuestaVista: 'inactivas' }), 'no', 'reloj adelantado: conservador')
})

test('bienvenida: un «Ahora no» a la guía de iPhone no tapa la pregunta cuando ya está instalada', () => {
  assert.equal(bien({ pospuestaEn: hace(1), pospuestaVista: 'instalar_ios', vista: 'inactivas' }), 'preguntar')
  assert.equal(bien({ pospuestaEn: hace(1), pospuestaVista: 'instalar_ios', vista: 'instalar_ios' }), 'no')
})

test('bienvenida: en la vista de corredor nunca (Alberto no consiente por el cliente)', () => {
  assert.equal(bien({ corredor: true }), 'no')
})

test('consentimiento al activar: se sella si no hay «sí» sobre el texto de hoy, y una sola vez', () => {
  const base = { accion: 'activar' as const, quedanSuscripciones: true }
  assert.equal(decidirRegistroAvisos({ ...base, vigenteVersionActual: null, ultima: null }), true)
  assert.equal(decidirRegistroAvisos({ ...base, vigenteVersionActual: null, ultima: true }), true, 'sí sobre texto viejo → se vuelve a sellar')
  assert.equal(decidirRegistroAvisos({ ...base, vigenteVersionActual: false, ultima: false }), true)
  assert.equal(decidirRegistroAvisos({ ...base, vigenteVersionActual: true, ultima: true }), null, 'segundo dispositivo: sin fila nueva')
})

test('🚨 revocación: solo cuando no queda ningún dispositivo, y nunca un «no» que nadie dio', () => {
  const base = { accion: 'desactivar' as const, vigenteVersionActual: true }
  assert.equal(decidirRegistroAvisos({ ...base, ultima: true, quedanSuscripciones: false }), false)
  assert.equal(decidirRegistroAvisos({ ...base, ultima: true, quedanSuscripciones: true }), null, 'otro móvil sigue recibiendo')
  assert.equal(decidirRegistroAvisos({ ...base, vigenteVersionActual: null, ultima: null, quedanSuscripciones: false }), null)
  assert.equal(decidirRegistroAvisos({ ...base, vigenteVersionActual: null, ultima: false, quedanSuscripciones: false }), null, 'ya retirado')
})
