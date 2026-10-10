import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  candidatosLoteEmail, contarEnEsperaVentanaSoloCorreo, contarPendientesPrimerEnvio, contarPrimerosEnviados,
} from './recaptacion-lote.ts'
import type { LeadRecaptacion } from './cartera-recaptacion.ts'

function lead(over: Partial<LeadRecaptacion>): LeadRecaptacion {
  return {
    clienteId: 'c1', polizaId: 'p1', cliente: 'Alguien', ramo: 'auto', ramoLegible: 'auto',
    aseguradoraAnterior: null, numeroPoliza: null, telefono: null, email: 'x@example.com',
    prima: null, enCooldown: false, ultimoContactoEn: null,
    origen: 'sin_vencimiento', mesVencimientoAntiguo: null, diaVencimientoAntiguo: null,
    ...over,
  }
}

test('solo entra quien tiene email y NO tiene teléfono usable', () => {
  const leads = [
    lead({ clienteId: 'a', email: 'a@x.com', telefono: null }),
    lead({ clienteId: 'b', email: 'b@x.com', telefono: '600111222' }),
    lead({ clienteId: 'c', email: null, telefono: null }),
  ]
  const r = candidatosLoteEmail(leads)
  assert.deepEqual(r.map((l) => l.clienteId), ['a'])
})

test('un lead en cooldown no entra aunque solo tenga email', () => {
  const leads = [lead({ clienteId: 'a', enCooldown: true })]
  assert.deepEqual(candidatosLoteEmail(leads), [])
})

test('respeta el límite pasado', () => {
  const leads = Array.from({ length: 5 }, (_, i) => lead({ clienteId: `c${i}` }))
  assert.equal(candidatosLoteEmail(leads, 2).length, 2)
})

test('el límite por defecto es 25', () => {
  const leads = Array.from({ length: 30 }, (_, i) => lead({ clienteId: `c${i}` }))
  assert.equal(candidatosLoteEmail(leads).length, 25)
})

test('un cliente con varias pólizas entra UNA vez (la primera fila en el orden de la cola)', () => {
  const leads = [
    lead({ clienteId: 'a', polizaId: 'p1' }),
    lead({ clienteId: 'b', polizaId: 'p2' }),
    lead({ clienteId: 'a', polizaId: 'p3' }),
  ]
  const r = candidatosLoteEmail(leads)
  assert.deepEqual(r.map((l) => `${l.clienteId}/${l.polizaId}`), ['a/p1', 'b/p2'])
})

test('el límite cuenta PERSONAS, no filas repetidas del mismo cliente', () => {
  const leads = [
    lead({ clienteId: 'a', polizaId: 'p1' }),
    lead({ clienteId: 'a', polizaId: 'p2' }),
    lead({ clienteId: 'b', polizaId: 'p3' }),
  ]
  assert.deepEqual(candidatosLoteEmail(leads, 2).map((l) => l.clienteId), ['a', 'b'])
})

// ── contarPendientesPrimerEnvio: lo que permite decir «ya se ha escrito a todos» ──

test('pendientes: cuenta solo-correo sin ningún contacto previo', () => {
  const leads = [
    lead({ clienteId: 'a', ultimoContactoEn: null }),
    lead({ clienteId: 'b', ultimoContactoEn: '2026-09-01' }),
  ]
  assert.equal(contarPendientesPrimerEnvio(leads), 1)
})

test('pendientes: mismo criterio solo-correo que el lote (con teléfono o sin email no cuentan)', () => {
  const leads = [
    lead({ clienteId: 'a', email: 'a@x.com', telefono: null }),
    lead({ clienteId: 'b', email: 'b@x.com', telefono: '600111222' }),
    lead({ clienteId: 'c', email: null, telefono: null }),
  ]
  assert.equal(contarPendientesPrimerEnvio(leads), 1)
})

test('pendientes: descuenta a quien se acaba de escribir en esta pasada', () => {
  const leads = [lead({ clienteId: 'a' }), lead({ clienteId: 'b' }), lead({ clienteId: 'c' })]
  assert.equal(contarPendientesPrimerEnvio(leads, ['a', 'c']), 1)
})

test('pendientes: si esta pasada escribió a todos los que faltaban, 0 («ya se ha escrito a todos»)', () => {
  const leads = [lead({ clienteId: 'a' }), lead({ clienteId: 'b', ultimoContactoEn: '2026-09-01' })]
  assert.equal(contarPendientesPrimerEnvio(leads, ['a']), 0)
})

test('pendientes: un envío FALLIDO en esta pasada ya no cuenta (Resend que rechaza siempre no bloquea el fin de campaña)', () => {
  // `a` se envió, `b` falló, `c` no se intentó (tope del lote): solo queda `c`.
  const leads = [lead({ clienteId: 'a' }), lead({ clienteId: 'b' }), lead({ clienteId: 'c' })]
  assert.equal(contarPendientesPrimerEnvio(leads, ['a', 'b']), 1)
  assert.equal(contarPendientesPrimerEnvio([lead({ clienteId: 'b' })], ['b']), 0)
})

test('pendientes: cuenta PERSONAS, no pólizas (un cliente con dos filas es uno)', () => {
  const leads = [lead({ clienteId: 'a', polizaId: 'p1' }), lead({ clienteId: 'a', polizaId: 'p2' })]
  assert.equal(contarPendientesPrimerEnvio(leads), 1)
  assert.equal(contarPendientesPrimerEnvio(leads, ['a']), 0)
})

// ── contarPrimerosEnviados: cuántos de los enviados eran el PRIMER correo ──

test('primeros: cuenta solo a quien no tenía ningún contacto previo', () => {
  const enviados = [
    lead({ clienteId: 'a', ultimoContactoEn: null }),
    lead({ clienteId: 'b', ultimoContactoEn: '2026-09-01' }),
    lead({ clienteId: 'c', ultimoContactoEn: null }),
  ]
  assert.equal(contarPrimerosEnviados(enviados), 2)
})

test('primeros: sin envíos, 0; todos recordatorios, 0', () => {
  assert.equal(contarPrimerosEnviados([]), 0)
  assert.equal(contarPrimerosEnviados([lead({ clienteId: 'a', ultimoContactoEn: '2026-09-01' })]), 0)
})

test('primeros: cuenta PERSONAS (dos filas del mismo cliente son una)', () => {
  assert.equal(contarPrimerosEnviados([lead({ clienteId: 'a', polizaId: 'p1' }), lead({ clienteId: 'a', polizaId: 'p2' })]), 1)
})

// ── contarEnEsperaVentanaSoloCorreo: PERSONAS solo-correo con la ventana cerrada ──

test('espera solo-correo: cuenta personas solo-correo en espera, no pólizas ni otros canales', () => {
  const enEspera = [
    lead({ clienteId: 'a', polizaId: 'p1' }),
    lead({ clienteId: 'a', polizaId: 'p2' }),
    lead({ clienteId: 'b', telefono: '600111222' }),
    lead({ clienteId: 'c', email: null, telefono: '600333444' }),
    lead({ clienteId: 'd' }),
  ]
  assert.equal(contarEnEsperaVentanaSoloCorreo(enEspera, []), 2)
})

test('espera solo-correo: quien ya tiene otra póliza EN ventana no está esperando (ya está en la cola)', () => {
  const enEspera = [lead({ clienteId: 'a', polizaId: 'p1' }), lead({ clienteId: 'b', polizaId: 'p2' })]
  const enVentana = [lead({ clienteId: 'a', polizaId: 'p3' })]
  assert.equal(contarEnEsperaVentanaSoloCorreo(enEspera, enVentana), 1)
})

test('espera solo-correo: nadie en espera, 0', () => {
  assert.equal(contarEnEsperaVentanaSoloCorreo([], [lead({ clienteId: 'a' })]), 0)
})

// ── Cableado en `enviarLoteEmail` (no se puede correr sin BD: se lee la fuente) ──

const fuenteLote = (() => {
  const src = readFileSync(new URL('./cartera-recaptacion.ts', import.meta.url), 'utf8')
  return src.slice(src.indexOf('export async function enviarLoteEmail'))
})()

test('cableado: se marca INTENTADO antes de llamar a Resend (el fallido también cuenta como intentado)', () => {
  const push = fuenteLote.indexOf('intentadosAhora.push(')
  assert.ok(push > 0 && push < fuenteLote.indexOf('enviarEmailResend('))
})

test('cableado: pendientes descuenta a los intentados, no solo a los enviados', () => {
  assert.match(fuenteLote, /pendientesPrimerEnvio: contarPendientesPrimerEnvio\(cola\.leads, intentadosAhora\)/)
})

test('cableado: primerosEnviados sale de los enviados DE VERDAD de la pasada', () => {
  assert.match(fuenteLote, /primerosEnviados: contarPrimerosEnviados\(enviadosAhora\)/)
})
