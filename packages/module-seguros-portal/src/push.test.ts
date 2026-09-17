import { test } from 'node:test'
import assert from 'node:assert/strict'
import { debeAvisarPush } from './push.ts'

const hoy = new Date('2026-09-12T00:00:00Z')

test('ya avisada por push: no se repite', () => {
  assert.equal(
    debeAvisarPush({ fechaAccionable: new Date('2026-09-14T00:00:00Z'), avisadaPushAt: new Date() }, hoy),
    false,
  )
})

test('dentro de la ventana de 7 días y sin avisar: sí', () => {
  assert.equal(
    debeAvisarPush({ fechaAccionable: new Date('2026-09-17T00:00:00Z'), avisadaPushAt: null }, hoy),
    true,
  )
})

test('fuera de la ventana (más de 7 días): no', () => {
  assert.equal(
    debeAvisarPush({ fechaAccionable: new Date('2026-10-01T00:00:00Z'), avisadaPushAt: null }, hoy),
    false,
  )
})

test('fecha accionable ya pasada: no (el correo/push de este vencimiento ya no es accionable)', () => {
  assert.equal(
    debeAvisarPush({ fechaAccionable: new Date('2026-09-01T00:00:00Z'), avisadaPushAt: null }, hoy),
    false,
  )
})
