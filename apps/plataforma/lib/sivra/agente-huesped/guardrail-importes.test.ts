import { test } from 'node:test'
import assert from 'node:assert'
import { importesNoRespaldados, contieneDatoInventado } from './guardrail.ts'

// El borrador real del 05/09/2026 (reserva 154375571): ni el precio ni el rango salían de ninguna fuente.
const GUIA = 'Check-in automático a partir de las 15:00. El parking privado tiene 1 plaza. Cuna: 15€ por estancia.'

test('caza el precio inventado del taxi (el fallo que motivó esto)', () => {
  assert.deepEqual(importesNoRespaldados('un taxi cuesta unos 25-30€ y os deja en la puerta', GUIA), [25, 30])
  assert.equal(contieneDatoInventado('un taxi cuesta unos 25-30€', GUIA), true)
})

test('un importe que SÍ está en las fuentes pasa', () => {
  assert.deepEqual(importesNoRespaldados('la cuna son 15€ por estancia', GUIA), [])
  assert.equal(contieneDatoInventado('la cuna son 15€ por estancia', GUIA), false)
})

test('26€ y «26,00 €» son el mismo importe', () => {
  assert.deepEqual(importesNoRespaldados('son 26€', 'Tarifa fija del taxi: 26,00 € de lunes a viernes.'), [])
})

test('reconoce las tres formas de escribirlo', () => {
  assert.deepEqual(importesNoRespaldados('cuesta €40', GUIA), [40])
  assert.deepEqual(importesNoRespaldados('cuesta 40 euros', GUIA), [40])
  assert.deepEqual(importesNoRespaldados('it costs 40 EUR', GUIA), [40])
})

test('un texto sin importes no dispara nada', () => {
  assert.deepEqual(importesNoRespaldados('El check-in es a partir de las 15:00 y hay 1 plaza de parking.', GUIA), [])
})
