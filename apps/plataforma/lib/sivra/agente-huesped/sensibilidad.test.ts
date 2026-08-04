import { test } from 'node:test'
import assert from 'node:assert'
import { esSensible } from './sensibilidad.ts'

test('queja es sensible', () => assert.equal(esSensible('el aire acondicionado no funciona, es un desastre'), true))
test('reembolso es sensible', () => assert.equal(esSensible('quiero un reembolso'), true))
test('cambio de fechas es sensible', () => assert.equal(esSensible('necesito cambiar las fechas de mi reserva'), true))
// Cancelación por raíz, no por infinitivo: el caso real fue "¿está cancelada mi reserva?" (no "cancelar").
test('cancelada es sensible', () => assert.equal(esSensible('hola quiero que me informéis si está cancelada mi reserva'), true))
test('cancelación es sensible', () => assert.equal(esSensible('me interesa la cancelación de la reserva'), true))
test('cancelar es sensible', () => assert.equal(esSensible('quiero cancelar la reserva'), true))
test('cancelled (EN) es sensible', () => assert.equal(esSensible('has my booking been cancelled?'), true))
test('anular es sensible', () => assert.equal(esSensible('necesito anular mi reserva'), true))
test('annuler (FR) es sensible', () => assert.equal(esSensible('je voudrais annuler ma réservation'), true))
test('stornieren (DE) es sensible', () => assert.equal(esSensible('ich möchte meine Buchung stornieren'), true))
test('pregunta de wifi NO es sensible', () => assert.equal(esSensible('cuál es la contraseña del wifi'), false))
// No falsos positivos con palabras que solo contienen "an...ul" incidentalmente.
test('reserva anual NO es sensible por sí sola', () => assert.equal(esSensible('busco un alquiler anual y un manual de la cocina'), false))
test('despedida NO es sensible', () => assert.equal(esSensible('muchas gracias, todo perfecto'), false))
