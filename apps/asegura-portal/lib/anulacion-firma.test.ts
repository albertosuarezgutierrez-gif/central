import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { interpretarCodigo, interpretarFirma, interpretarPendientes } from './anulacion-firma.ts'

test('🪤 solo un 200 con fecha es «firmada»: un 401, un 5xx o un corte NO', () => {
  assert.deepEqual(interpretarFirma(200, { estado: 'firmada', firmadaEl: '2026-09-23' }), { estado: 'firmada', firmadaEl: '2026-09-23' })
  assert.equal(interpretarFirma(401, { error: 'No autorizado' }).estado, 'error')
  assert.equal(interpretarFirma(503, { estado: 'error' }).estado, 'error')
  assert.equal(interpretarFirma(200, { estado: 'firmada' }).estado, 'error')
})

test('los rechazos de la firma dicen qué hacer', () => {
  assert.deepEqual(interpretarFirma(422, { estado: 'codigo_incorrecto', quedan: 2 }), { estado: 'reintentar', motivo: 'Código incorrecto. Te quedan 2 intentos.' })
  assert.equal(interpretarFirma(422, { estado: 'codigo_incorrecto', quedan: 0 }).estado, 'reintentar')
  assert.equal(interpretarFirma(422, { estado: 'nombre_no_coincide' }).estado, 'reintentar')
  assert.equal(interpretarFirma(410, { estado: 'codigo_caducado' }).estado, 'reintentar')
  assert.equal(interpretarFirma(404, { estado: 'no_encontrada' }).estado, 'no_disponible')
  assert.equal(interpretarFirma(409, { estado: 'carta_cambiada' }).estado, 'no_disponible')
})

test('🪤 el código: «enviado» exige correo; sin_correo_configurado no es culpa del cliente', () => {
  assert.equal(interpretarCodigo(200, { estado: 'codigo_enviado', email: 'a***@x.es', minutos: 10 }).estado, 'codigo_enviado')
  assert.equal(interpretarCodigo(200, { estado: 'codigo_enviado' }).estado, 'error')
  assert.equal(interpretarCodigo(503, { estado: 'sin_correo_configurado', motivo: 'x' }).estado, 'error')
  assert.equal(interpretarCodigo(422, { estado: 'sin_email', motivo: 'x' }).estado, 'no_disponible')
  assert.deepEqual(interpretarCodigo(429, { estado: 'espera', segundos: 40 }), { estado: 'espera', segundos: 40 })
})

test('🪤 pendientes: no poder leerlas (null) no es «no tienes nada» ([])', () => {
  assert.equal(interpretarPendientes(503, null), null)
  assert.equal(interpretarPendientes(200, { estado: 'ok', anulaciones: [] }), null, 'sin consentimiento no hay con qué firmar')
  assert.deepEqual(interpretarPendientes(409, { estado: 'sin_ficha' }), { anulaciones: [], consentimiento: '' })
  const r = interpretarPendientes(200, {
    estado: 'ok', consentimiento: 'Texto',
    anulaciones: [{ id: 'a1', tipo: 'no_renovacion', fechaEfecto: '2026-12-01', carta: 'Carta', cartaHash: 'a'.repeat(64), compania: 'Mapfre', numeroPoliza: '1' }, { id: 'a2' }],
  })
  assert.equal(r?.anulaciones.length, 1)
  assert.equal(r?.anulaciones[0].carta, 'Carta')
  assert.equal(r?.anulaciones[0].cartaHash, 'a'.repeat(64))
})

test('🪤 la vista de corredor no firma: el veto va ANTES de llamar al puente', () => {
  const fuente = readFileSync(new URL('../app/api/anulacion/route.ts', import.meta.url), 'utf8')
  const veto = fuente.indexOf('identidad.corredor')
  assert.ok(veto > 0, 'falta el veto de la vista de corredor')
  assert.ok(veto < fuente.indexOf('pedirCodigo(identidad.id'), 'el veto tiene que ir antes de pedir el código')
  assert.ok(veto < fuente.indexOf('firmar(identidad.id'), 'el veto tiene que ir antes de firmar')
  assert.doesNotMatch(fuente, /b\.identidadId|clienteId/, 'la identidad sale de la sesión, nunca del cuerpo')
})
