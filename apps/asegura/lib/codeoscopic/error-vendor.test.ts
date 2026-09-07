import { test } from 'node:test'
import assert from 'node:assert/strict'
import { formatearErrorVendor } from './error-vendor.ts'

test('extrae el mensaje del JSON del vendor, sin llaves ni requestId', () => {
  const crudo =
    'codeoscopic_validacion: {"error":"Bad Request","message":"The effective date cannot be more than one year from the current date.","path":"/insurances","requestId":"cbc08f1f-77993","status":400,"timestamp":"2026-09-07T15:39:53.915Z"}'
  assert.equal(
    formatearErrorVendor(crudo),
    'The effective date cannot be more than one year from the current date.',
  )
})

test('no añade la ruta del endpoint como ruido: el campo que falla ya viaja dentro de message', () => {
  const crudo =
    'codeoscopic_validacion: {"error":"Bad Request","message":"[Path \'/externalId\'] ECMA 262 regex \'^[a-zA-Z0-9-._~]+$\' does not match input string \'poliza:x\'","path":"/insurances","requestId":"8085c3af-77529","status":400,"timestamp":"2026-09-07T15:31:57.016Z"}'
  const resultado = formatearErrorVendor(crudo)
  assert.match(resultado, /ECMA 262 regex/)
  assert.equal(resultado.includes('/insurances'), false)
})

test('sin campo message, cae al campo error', () => {
  const crudo = 'codeoscopic_servidor: {"error":"Internal Server Error","status":500}'
  assert.equal(formatearErrorVendor(crudo), 'Internal Server Error')
})

test('JSON truncado (recortar() a 300 caracteres): se enseña el texto tal cual, nunca se calla', () => {
  const crudo = 'codeoscopic_validacion: {"error":"Bad Request","message":"algo muy largo que se co'
  assert.equal(formatearErrorVendor(crudo), '{"error":"Bad Request","message":"algo muy largo que se co')
})

test('sin JSON en absoluto: se enseña el texto tal cual', () => {
  assert.equal(formatearErrorVendor('codeoscopic_conexion: host caído'), 'host caído')
})
