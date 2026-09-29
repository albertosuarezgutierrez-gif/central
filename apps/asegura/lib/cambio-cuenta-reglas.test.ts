import test from 'node:test'
import assert from 'node:assert/strict'
import { revisarIbanNuevo } from './cambio-cuenta-reglas.ts'

// IBAN de ejemplo con dígitos de control válidos (no es de nadie).
const VALIDO = 'ES91 2100 0418 4502 0005 1332'

test('un IBAN válido se normaliza y solo sale su máscara para enseñar', () => {
  const r = revisarIbanNuevo(VALIDO, null)
  assert.deepEqual(r, { ok: true, iban: 'ES9121000418450200051332', mascara: '**** 1332' })
})

test('🪤 dígitos de control mal, basura o demasiado largo: no se acepta', () => {
  assert.equal(revisarIbanNuevo('ES9221000418450200051332', null).ok, false)
  assert.equal(revisarIbanNuevo('hola', null).ok, false)
  assert.equal(revisarIbanNuevo(123, null).ok, false)
  assert.equal(revisarIbanNuevo(`${VALIDO}0000000000000`, null).ok, false)
})

test('la misma cuenta que ya tiene no es un cambio', () => {
  assert.deepEqual(revisarIbanNuevo(VALIDO, 'ES9121000418450200051332'), { ok: false, estado: 'sin_cambios' })
})
