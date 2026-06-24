import { test } from 'node:test'
import assert from 'node:assert'
import { esSensible } from './sensibilidad.ts'

test('queja es sensible', () => assert.equal(esSensible('el aire acondicionado no funciona, es un desastre'), true))
test('reembolso es sensible', () => assert.equal(esSensible('quiero un reembolso'), true))
test('cambio de fechas es sensible', () => assert.equal(esSensible('necesito cambiar las fechas de mi reserva'), true))
test('pregunta de wifi NO es sensible', () => assert.equal(esSensible('cuál es la contraseña del wifi'), false))
test('despedida NO es sensible', () => assert.equal(esSensible('muchas gracias, todo perfecto'), false))
