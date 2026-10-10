// Cepos del código de acceso del presupuesto por WhatsApp (07/10/2026). Cada uno se ha visto en
// ROJO rompiendo la guarda que protege (ver el informe de la sesión) y se ha restaurado.
import test from 'node:test'
import assert from 'node:assert/strict'

import {
  MAX_INTENTOS_WHATSAPP, estadoCodigoWhatsapp, formatoCodigoWhatsapp, hashCodigoWhatsapp, intentosQuedan,
  type CodigoWhatsappGuardado,
} from './codigo-whatsapp.ts'
import { MAX_INTENTOS } from './codigo.ts'
import { generarTokenVista } from './vista-corredor.ts'

const AHORA = new Date('2026-10-07T12:00:00Z')
const VENCE = new Date('2026-10-22T21:59:59Z')

async function guardado(token: string, codigo: string, extra: Partial<CodigoWhatsappGuardado> = {}): Promise<CodigoWhatsappGuardado> {
  return { codigoHash: await hashCodigoWhatsapp(token, codigo), intentos: 0, venceEl: VENCE, retirado: false, ...extra }
}

test('el código bueno de ESTE presupuesto abre', async () => {
  const token = generarTokenVista()
  const g = await guardado(token, '123456')
  assert.equal(estadoCodigoWhatsapp(g, await hashCodigoWhatsapp(token, '123456'), AHORA), 'valido')
  assert.equal(estadoCodigoWhatsapp(g, await hashCodigoWhatsapp(token, '123457'), AHORA), 'incorrecto')
})

test('🪤 el código de OTRO presupuesto no abre este (aunque sean los mismos 6 dígitos)', async () => {
  const esteToken = generarTokenVista()
  const otroToken = generarTokenVista()
  const este = await guardado(esteToken, '424242')
  // Quien tiene el enlace de otro presupuesto con el mismo código teclea en ESTE enlace: el hash
  // se calcula con el token de la URL que abre, no con el suyo.
  assert.equal(estadoCodigoWhatsapp(este, await hashCodigoWhatsapp(otroToken, '424242'), AHORA), 'incorrecto')
  assert.notEqual(await hashCodigoWhatsapp(esteToken, '424242'), await hashCodigoWhatsapp(otroToken, '424242'))
})

test('🪤 regenerar el enlace = código nuevo: el anterior deja de valer', async () => {
  const viejoToken = generarTokenVista()
  const viejoCodigo = '111111'
  // Alberto vuelve a pulsar «Por WhatsApp»: token y código nuevos, y el hash guardado se sobrescribe.
  const nuevoToken = generarTokenVista()
  const g = await guardado(nuevoToken, '222222')
  // El código viejo con el enlace nuevo no abre…
  assert.equal(estadoCodigoWhatsapp(g, await hashCodigoWhatsapp(nuevoToken, viejoCodigo), AHORA), 'incorrecto')
  // …ni el código viejo con su enlace viejo (que además ya no encuentra la fila: su token_hash rotó).
  assert.equal(estadoCodigoWhatsapp(g, await hashCodigoWhatsapp(viejoToken, viejoCodigo), AHORA), 'incorrecto')
  assert.equal(estadoCodigoWhatsapp(g, await hashCodigoWhatsapp(nuevoToken, '222222'), AHORA), 'valido')
})

test('🪤 código caducado no vale aunque sea el bueno', async () => {
  const token = generarTokenVista()
  const g = await guardado(token, '123456', { venceEl: new Date('2026-10-07T11:59:59Z') })
  assert.equal(estadoCodigoWhatsapp(g, await hashCodigoWhatsapp(token, '123456'), AHORA), 'caducado')
})

test('🪤 sin código guardado no se abre nada: ni con un hash vacío ni con uno de forma rara', async () => {
  const token = generarTokenVista()
  const entrada = await hashCodigoWhatsapp(token, '123456')
  assert.equal(estadoCodigoWhatsapp({ codigoHash: null, intentos: 0, venceEl: VENCE, retirado: false }, entrada, AHORA), 'sin_codigo')
  // Un hash con forma rara (p. ej. los 6 dígitos en claro) NUNCA casa, ni siquiera consigo mismo.
  assert.equal(estadoCodigoWhatsapp({ codigoHash: '123456', intentos: 0, venceEl: VENCE, retirado: false }, '123456', AHORA), 'sin_codigo')
  assert.equal(estadoCodigoWhatsapp({ codigoHash: '', intentos: 0, venceEl: VENCE, retirado: false }, '', AHORA), 'sin_codigo')
  // Retirado: no hay puerta.
  const g = await guardado(token, '123456', { retirado: true })
  assert.equal(estadoCodigoWhatsapp(g, entrada, AHORA), 'sin_codigo')
})

test('🪤 tras N fallos se bloquea, y bloqueado gana al acierto', async () => {
  const token = generarTokenVista()
  const bueno = await hashCodigoWhatsapp(token, '123456')
  assert.equal(MAX_INTENTOS_WHATSAPP, MAX_INTENTOS, 'el mismo tope que el código del portal')
  assert.equal(estadoCodigoWhatsapp(await guardado(token, '123456', { intentos: MAX_INTENTOS_WHATSAPP - 1 }), bueno, AHORA), 'valido')
  assert.equal(estadoCodigoWhatsapp(await guardado(token, '123456', { intentos: MAX_INTENTOS_WHATSAPP }), bueno, AHORA), 'bloqueado')
  // Bloqueado también gana a caducado: «te has pasado de intentos» explica por qué no abre.
  assert.equal(
    estadoCodigoWhatsapp(await guardado(token, '123456', { intentos: MAX_INTENTOS_WHATSAPP, venceEl: new Date(0) }), bueno, AHORA),
    'bloqueado',
  )
  assert.equal(intentosQuedan(1), MAX_INTENTOS_WHATSAPP - 1)
  assert.equal(intentosQuedan(99), 0)
})

test('el hash no es el SHA-256 pelado del código (no se revierte con un bucle de 10^6)', async () => {
  const token = generarTokenVista()
  const h = await hashCodigoWhatsapp(token, '123456')
  const pelado = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode('123456'))), (b) =>
    b.toString(16).padStart(2, '0')).join('')
  assert.match(h, /^[0-9a-f]{64}$/)
  assert.notEqual(h, pelado)
})

test('formato: 6 dígitos y nada más', () => {
  assert.ok(formatoCodigoWhatsapp('012345'))
  for (const malo of ['12345', '1234567', '12345a', ' 123456', 123456, null, undefined]) assert.ok(!formatoCodigoWhatsapp(malo))
})
