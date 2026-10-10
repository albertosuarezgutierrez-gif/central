// apps/plataforma/lib/recaptacion-asegura.test.ts
//
// Interpretación PURA del puerto de recaptación de asegura
// (`POST /api/operador/recaptacion/email-lote` y el contrato de escritura que
// reutiliza `renovaciones-asegura.ts`). Sin red: solo status+json → tipo.
//
// La cola, su agrupación por cliente y el orden por vencimiento se quitaron
// con el bloque «Recaptación» de /correduria (30/09/2026); sus tests con ellos.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { interpretarEscrituraRecaptacion, interpretarLoteEmail } from './recaptacion-asegura.ts'

// ── Escritura (la reutiliza renovaciones-asegura.ts) ─────────────────────────

test('escritura ok', () => {
  const r = interpretarEscrituraRecaptacion(200, { estado: 'ok' })
  assert.deepEqual(r, { estado: 'ok' })
})

test('escritura invalido (422) conserva el motivo', () => {
  const r = interpretarEscrituraRecaptacion(422, { estado: 'invalido', motivo: 'faltan_campos' })
  assert.deepEqual(r, { estado: 'invalido', motivo: 'faltan_campos' })
})

test('escritura no_encontrado (404)', () => {
  const r = interpretarEscrituraRecaptacion(404, { estado: 'error', motivo: 'Esa ficha no es de esta correduría.' })
  assert.equal(r.estado, 'no_encontrado')
})

test('escritura sin_configurar (503)', () => {
  const r = interpretarEscrituraRecaptacion(503, { estado: 'sin_configurar' })
  assert.deepEqual(r, { estado: 'sin_configurar' })
})

test('escritura error genérico con motivo del puerto', () => {
  const r = interpretarEscrituraRecaptacion(502, { estado: 'error', motivo: 'rechazado' })
  assert.deepEqual(r, { estado: 'error', motivo: 'rechazado' })
})

// ── Lote diario (cron `recaptacion-email-lote`) ──────────────────────────────

test('lote ok lee los campos de campaña tal cual', () => {
  const r = interpretarLoteEmail(200, {
    estado: 'ok', candidatos: 12, enviados: 10, fallidos: 2, detalleFallos: ['a@x.es: rebote'], descartadosPorSilencio: 1,
    primerosEnviados: 4, pendientesPrimerEnvio: 0, emailEnviadosTotal: 480, emailAbiertosTotal: 120, enEsperaVentanaSoloCorreo: 35,
  })
  assert.equal(r.estado, 'ok')
  if (r.estado !== 'ok') return
  assert.equal(r.primerosEnviados, 4)
  assert.equal(r.pendientesPrimerEnvio, 0)
  assert.equal(r.emailEnviadosTotal, 480)
  assert.equal(r.emailAbiertosTotal, 120)
  assert.equal(r.enEsperaVentanaSoloCorreo, 35)
})

test('primerosEnviados 0 medido es 0, no null (pasada solo de seguimientos)', () => {
  const r = interpretarLoteEmail(200, { estado: 'ok', candidatos: 5, enviados: 5, fallidos: 0, detalleFallos: [], primerosEnviados: 0 })
  assert.equal(r.estado, 'ok')
  if (r.estado !== 'ok') return
  assert.equal(r.primerosEnviados, 0)
})

test('lote de un asegura viejo: los campos de campaña ausentes son null, nunca 0', () => {
  const r = interpretarLoteEmail(200, { estado: 'ok', candidatos: 3, enviados: 3, fallidos: 0, detalleFallos: [] })
  assert.equal(r.estado, 'ok')
  if (r.estado !== 'ok') return
  // Un 0 en `pendientesPrimerEnvio` dispararía «ya se ha escrito a todos».
  assert.equal(r.primerosEnviados, null)
  assert.equal(r.pendientesPrimerEnvio, null)
  assert.equal(r.emailEnviadosTotal, null)
  assert.equal(r.emailAbiertosTotal, null)
  assert.equal(r.enEsperaVentanaSoloCorreo, null)
})

test('el viejo `enEsperaVentana` (leads, no personas) NO se toma por `enEsperaVentanaSoloCorreo`', () => {
  const r = interpretarLoteEmail(200, { estado: 'ok', candidatos: 1, enviados: 1, fallidos: 0, detalleFallos: [], enEsperaVentana: 40 })
  assert.equal(r.estado, 'ok')
  if (r.estado !== 'ok') return
  assert.equal(r.enEsperaVentanaSoloCorreo, null)
})

test('lote con campos de campaña no numéricos o rotos: null, nunca 0', () => {
  const r = interpretarLoteEmail(200, {
    estado: 'ok', candidatos: 1, enviados: 1, fallidos: 0, detalleFallos: [],
    primerosEnviados: '1', pendientesPrimerEnvio: '0', emailEnviadosTotal: -4, emailAbiertosTotal: 1.5, enEsperaVentanaSoloCorreo: null,
  })
  assert.equal(r.estado, 'ok')
  if (r.estado !== 'ok') return
  assert.equal(r.primerosEnviados, null)
  assert.equal(r.pendientesPrimerEnvio, null)
  assert.equal(r.emailEnviadosTotal, null)
  assert.equal(r.emailAbiertosTotal, null)
  assert.equal(r.enEsperaVentanaSoloCorreo, null)
})

test('lote sin_configurar (503) y secreto rechazado (401)', () => {
  assert.deepEqual(interpretarLoteEmail(503, { estado: 'sin_configurar' }), { estado: 'sin_configurar' })
  assert.deepEqual(interpretarLoteEmail(401, null), { estado: 'error', motivo: 'secreto_rechazado' })
})
