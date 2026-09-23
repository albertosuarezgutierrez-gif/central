import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { interpretarCodigo, interpretarFirma, interpretarPreparar } from './presupuesto-firma.ts'

test('🪤 solo un 200 con fecha es «aceptado»: un 401, un 5xx o un corte NO', () => {
  assert.deepEqual(interpretarFirma(200, { estado: 'aceptado', aceptadoEl: '2026-09-23' }), { estado: 'aceptado', aceptadoEl: '2026-09-23', aviso: null })
  assert.equal((interpretarFirma(200, { estado: 'aceptado', aceptadoEl: '2026-09-23', aviso: 'x' }) as { aviso: string | null }).aviso, 'x')
  assert.equal(interpretarFirma(401, { error: 'No autorizado' }).estado, 'error')
  assert.equal(interpretarFirma(503, { estado: 'error' }).estado, 'error')
  assert.equal(interpretarFirma(200, { estado: 'aceptado' }).estado, 'error')
})

test('los rechazos de la firma dicen qué hacer', () => {
  assert.deepEqual(interpretarFirma(422, { estado: 'codigo_incorrecto', quedan: 2 }), { estado: 'reintentar', motivo: 'Código incorrecto. Te quedan 2 intentos.' })
  assert.equal(interpretarFirma(422, { estado: 'codigo_incorrecto', quedan: 0 }).estado, 'reintentar')
  assert.equal(interpretarFirma(422, { estado: 'nombre_no_coincide' }).estado, 'reintentar')
  assert.equal(interpretarFirma(410, { estado: 'codigo_caducado' }).estado, 'reintentar')
  assert.equal(interpretarFirma(404, { estado: 'no_encontrado' }).estado, 'no_disponible')
  assert.equal(interpretarFirma(409, { estado: 'documento_cambiado' }).estado, 'no_disponible')
})

test('🪤 el código: «enviado» exige correo; sin_correo_configurado no es culpa del cliente', () => {
  assert.equal(interpretarCodigo(200, { estado: 'codigo_enviado', email: 'a***@x.es', minutos: 10 }).estado, 'codigo_enviado')
  assert.equal(interpretarCodigo(200, { estado: 'codigo_enviado' }).estado, 'error')
  assert.equal(interpretarCodigo(503, { estado: 'sin_correo_configurado', motivo: 'x' }).estado, 'error')
  assert.equal(interpretarCodigo(422, { estado: 'sin_email', motivo: 'x' }).estado, 'no_disponible')
  assert.deepEqual(interpretarCodigo(429, { estado: 'espera', segundos: 40 }), { estado: 'espera', segundos: 40 })
})

test('🪤 preparar: documentoHash válido y documento OK', () => {
  const r = interpretarPreparar(200, {
    estado: 'ok',
    consentimiento: 'Acepto',
    documento: 'Este es el documento',
    documentoHash: 'a'.repeat(64),
    anulacion: null,
    sinAnulacion: null,
  })
  assert.equal(r?.estado, 'ok')
  assert.equal(r?.documentoHash, 'a'.repeat(64))
  assert.equal(r?.consentimiento, 'Acepto')
})

test('🪤 preparar con documentoHash inválido → null', () => {
  const r = interpretarPreparar(200, {
    estado: 'ok',
    consentimiento: 'Acepto',
    documento: 'Doc',
    documentoHash: 'invalid',
    anulacion: null,
    sinAnulacion: null,
  })
  assert.equal(r, null)
})

test('🪤 preparar: 500/401 → null, jamás aceptado', () => {
  assert.equal(interpretarPreparar(500, { estado: 'error' }), null)
  assert.equal(interpretarPreparar(401, { error: 'No autorizado' }), null)
  assert.equal(interpretarPreparar(0, {}), null)
})

test('🪤 la vista de corredor no firma: el veto va ANTES de llamar al puente', () => {
  const fuente = readFileSync(new URL('../app/api/presupuesto/firma/route.ts', import.meta.url), 'utf8')
  const veto = fuente.indexOf('identidad.corredor')
  assert.ok(veto > 0, 'falta el veto de la vista de corredor')
  assert.ok(veto < fuente.indexOf('pedirCodigoAceptacion(identidad.id'), 'el veto tiene que ir antes de pedir el código')
  assert.ok(veto < fuente.indexOf('firmarAceptacion(identidad.id'), 'el veto tiene que ir antes de firmar')
  assert.doesNotMatch(fuente, /b\.identidadId|clienteId/, 'la identidad sale de la sesión, nunca del cuerpo')
})

test('🪤 una carta de anulación a medias no se enseña para firmar', async () => {
  const { interpretarPreparar } = await import('./presupuesto-firma.ts')
  const ok = { estado: 'ok', consentimiento: 'c', documento: 'd', documentoHash: 'a'.repeat(64), anulacion: null, sinAnulacion: null }
  assert.equal(interpretarPreparar(200, ok)?.estado, 'ok')
  assert.equal(interpretarPreparar(200, { ...ok, anulacion: { compania: 'Mapfre', numeroPoliza: '1', fechaEfecto: '2026-12-31', carta: '' } }), null)
  assert.equal(interpretarPreparar(200, { ...ok, anulacion: { compania: 'Mapfre', numeroPoliza: '1', fechaEfecto: 'mañana', carta: 'x' } }), null)
  assert.equal(interpretarPreparar(401, {}), null)
})
