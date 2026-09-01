import test from 'node:test'
import assert from 'node:assert/strict'
import { generarCodigo, estadoCodigo, MAX_INTENTOS, VALIDEZ_MINUTOS } from './codigo.ts'

const T0 = new Date('2026-09-01T10:00:00Z')

test('el código son 6 dígitos', () => {
  for (let i = 0; i < 50; i++) assert.match(generarCodigo(), /^\d{6}$/)
})

test('dos códigos seguidos no son iguales (no es un contador)', () => {
  const muestras = new Set(Array.from({ length: 30 }, () => generarCodigo()))
  assert.ok(muestras.size > 1)
})

test('el código correcto y dentro de plazo es válido', () => {
  const r = estadoCodigo(
    { codigo: '123456', creadoEn: T0, intentos: 0, usadoEn: null },
    '123456',
    new Date('2026-09-01T10:05:00Z'),
  )
  assert.equal(r, 'valido')
})

test('caducado a los VALIDEZ_MINUTOS, aunque el código sea el bueno', () => {
  const despues = new Date(T0.getTime() + (VALIDEZ_MINUTOS + 1) * 60_000)
  assert.equal(estadoCodigo({ codigo: '123456', creadoEn: T0, intentos: 0, usadoEn: null }, '123456', despues), 'caducado')
})

test('un código ya usado no vale una segunda vez', () => {
  const r = estadoCodigo(
    { codigo: '123456', creadoEn: T0, intentos: 0, usadoEn: new Date('2026-09-01T10:01:00Z') },
    '123456',
    new Date('2026-09-01T10:02:00Z'),
  )
  assert.equal(r, 'ya_usado')
})

test('al superar MAX_INTENTOS se bloquea aunque acierte: si no, es fuerza bruta sobre 6 dígitos', () => {
  const r = estadoCodigo(
    { codigo: '123456', creadoEn: T0, intentos: MAX_INTENTOS, usadoEn: null },
    '123456',
    new Date('2026-09-01T10:01:00Z'),
  )
  assert.equal(r, 'bloqueado')
})

test('código incorrecto dentro de plazo devuelve incorrecto', () => {
  const r = estadoCodigo({ codigo: '123456', creadoEn: T0, intentos: 1, usadoEn: null }, '999999', new Date('2026-09-01T10:01:00Z'))
  assert.equal(r, 'incorrecto')
})

test('se comprueba PRIMERO el bloqueo y luego el acierto', () => {
  const r = estadoCodigo(
    { codigo: '123456', creadoEn: T0, intentos: MAX_INTENTOS, usadoEn: null },
    '000000',
    new Date('2026-09-01T10:01:00Z'),
  )
  assert.equal(r, 'bloqueado')
})
