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
  assert.deepEqual(interpretarPendientes(409, { estado: 'sin_ficha' }), { anulaciones: [], consentimiento: '', firmadas: [] })
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

test('🪤 el código vigente vuelve con la lectura: tras recargar se teclea el que ya llegó, no se pide otro', () => {
  const base = { id: 'a1', tipo: 'sustitucion', fechaEfecto: '2026-09-29', carta: 'Carta', cartaHash: 'a'.repeat(64) }
  const r = interpretarPendientes(200, { estado: 'ok', consentimiento: 'T', anulaciones: [{ ...base, codigoCaducaEn: '2026-09-28T08:27:22.000Z' }] })
  assert.equal(r?.anulaciones[0].codigoCaducaEn, '2026-09-28T08:27:22.000Z')
  const sin = interpretarPendientes(200, { estado: 'ok', consentimiento: 'T', anulaciones: [{ ...base, codigoCaducaEn: 'mañana' }] })
  assert.equal(sin?.anulaciones[0].codigoCaducaEn, null, 'una fecha ilegible no abre el campo del código')
})

test('las bajas ya firmadas se leen con su estado; sin el campo (asegura viejo) no se inventa ninguna', () => {
  const r = interpretarPendientes(200, {
    estado: 'ok', consentimiento: 'T', anulaciones: [],
    firmadas: [
      { id: 'f1', tipo: 'sustitucion', fechaEfecto: '2026-09-29', estado: 'comunicada', firmadaEl: '2026-09-28', comunicadaEl: '2026-09-28', compania: 'Mapfre', numeroPoliza: '0008' },
      { id: 'f2', tipo: 'sustitucion', fechaEfecto: '2026-09-29', estado: 'solicitada', firmadaEl: '2026-09-28' },
      { id: 'f3', tipo: 'sustitucion', fechaEfecto: '2026-09-29', estado: 'firmada' },
    ],
  })
  assert.equal(r?.firmadas.length, 1, 'ni una «solicitada» ni una sin fecha de firma pasan por firmada')
  assert.equal(r?.firmadas[0].comunicadaEl, '2026-09-28')
  assert.equal(r?.firmadas[0].confirmadaEl, null)
  assert.deepEqual(interpretarPendientes(200, { estado: 'ok', consentimiento: 'T', anulaciones: [] })?.firmadas, [])
})
