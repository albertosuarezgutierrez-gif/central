import test from 'node:test'
import assert from 'node:assert/strict'
import { mensajeSustituciones, type SustitucionAviso } from './sustituciones-aviso.ts'

test('mensajeSustituciones: lista vacía → null, nunca un mensaje de «0 pendientes»', () => {
  assert.equal(mensajeSustituciones([]), null)
})

test('mensajeSustituciones: una fila con póliza nueva conocida', () => {
  const fila: SustitucionAviso = {
    cliente: 'Pilar Franco Ruz',
    diasSustituida: 4,
    polizaVieja: { aseguradora: 'Occident', numeroPoliza: 'GPAFS0900547' },
    polizaNueva: { aseguradora: 'Reale', numeroPoliza: 'R-123' },
  }
  const msg = mensajeSustituciones([fila])
  assert.ok(msg)
  assert.ok(msg.includes('Pilar Franco Ruz'))
  assert.ok(msg.includes('Occident nº GPAFS0900547'))
  assert.ok(msg.includes('Reale nº R-123'))
  assert.ok(msg.includes('hace 4 días'))
})

test('mensajeSustituciones: sin póliza nueva informada, se marca con «?» en vez de callarlo', () => {
  const fila: SustitucionAviso = {
    cliente: 'Cliente X', diasSustituida: 3,
    polizaVieja: { aseguradora: 'Mapfre', numeroPoliza: null }, polizaNueva: null,
  }
  const msg = mensajeSustituciones([fila])
  assert.ok(msg?.includes('→ ?'))
})

test('mensajeSustituciones: más de 20 filas, se trunca con recuento del resto', () => {
  const filas: SustitucionAviso[] = Array.from({ length: 25 }, (_, i) => ({
    cliente: `Cliente ${i}`, diasSustituida: 3,
    polizaVieja: { aseguradora: 'Mapfre', numeroPoliza: null }, polizaNueva: null,
  }))
  const msg = mensajeSustituciones(filas)
  assert.ok(msg?.includes('y 5 más'))
})
