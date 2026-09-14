// apps/plataforma/lib/recaptacion-asegura.test.ts
//
// Interpretación PURA del puerto de recaptación de asegura
// (`GET/POST /api/operador/recaptacion*`). Sin red: solo status+json → tipo.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { interpretarCola, interpretarEscrituraRecaptacion } from './recaptacion-asegura.ts'

test('GET ok interpreta leads y contadores', () => {
  const json = {
    estado: 'ok',
    leads: [
      {
        clienteId: 'c1',
        polizaId: 'p1',
        cliente: 'Maria Antonia Gutierrez',
        ramo: 'otros',
        ramoLegible: 'comunidades',
        aseguradoraAnterior: 'Plus Ultra',
        numeroPoliza: 'BIDP023227',
        telefono: '600111222',
        email: null,
        prima: 123.45,
        enCooldown: false,
        ultimoContactoEn: null,
      },
    ],
    contadores: { totalCandidatos: 1, contactadosSemana: 0, conAperturaORespuestaSemana: 0 },
  }
  const r = interpretarCola(200, json)
  assert.equal(r.estado, 'ok')
  if (r.estado !== 'ok') return
  assert.equal(r.leads.length, 1)
  assert.equal(r.leads[0].cliente, 'Maria Antonia Gutierrez')
  assert.equal(r.leads[0].prima, 123.45)
  assert.equal(r.contadores.totalCandidatos, 1)
})

test('GET sin_configurar se respeta tal cual', () => {
  const r = interpretarCola(200, { estado: 'sin_configurar' })
  assert.deepEqual(r, { estado: 'sin_configurar' })
})

test('GET con causa la conserva; sin causa no se inventa ninguna', () => {
  const conCausa = interpretarCola(200, { estado: 'error', causa: 'credenciales' })
  assert.deepEqual(conCausa, { estado: 'error', motivo: 'asegura_error', causa: 'credenciales' })
  const sinCausa = interpretarCola(200, { estado: 'error' })
  assert.deepEqual(sinCausa, { estado: 'error', motivo: 'asegura_error', causa: null })
})

test('un 401 es secreto_rechazado, no respuesta_ilegible', () => {
  const r = interpretarCola(401, null)
  assert.deepEqual(r, { estado: 'error', motivo: 'secreto_rechazado', causa: null })
})

test('un 200 sin lista de leads es respuesta_ilegible, nunca cola vacía', () => {
  const r = interpretarCola(200, { estado: 'ok' })
  assert.deepEqual(r, { estado: 'error', motivo: 'respuesta_ilegible', causa: null })
})

// ── Escritura (whatsapp/email) ───────────────────────────────────────────────

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
