// Tests de las reglas deterministas de CATEGORÍA CONTABLE. Runner: `node --test` (type-stripping).
// Reproduce el bug del 30/07/2026: una comida en el restaurante "LA HACIENDA GOLF" (Isla Cristina)
// caía a 'impuestos' porque la keyword 'HACIENDA' iba a secas y ANTES que la regla de compra con
// tarjeta — el nombre de un comercio puede contener cualquier palabra-trampa.
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { categorizarPorReglas, pgcDe } from './categoria-reglas.ts'

test('compra con tarjeta en comercio-trampa → tarjeta (no impuestos/seguro)', () => {
  // El caso real: restaurante llamado "La Hacienda". Antes → 'impuestos'.
  assert.equal(categorizarPorReglas('PAGO CON TARJETA EN RESTAURANTES Y CAFETERIAS // PAGO CON TARJETA // LA HACIENDA GOLF         ISLA CRISTINAES', null, -9.70), 'tarjeta')
  // Comercio hipotético con palabra de aseguradora en el nombre.
  assert.equal(categorizarPorReglas('PAGO CON TARJETA EN BARES // PAGO CON TARJETA // BAR LA MUTUA', null, -12.00), 'tarjeta')
  // "COMPRA EN" + comisión FX en el rótulo NO lo convierte en comisión bancaria: es una compra.
  assert.equal(categorizarPorReglas('COMPRA EN COMERCIO EXTRANJERO-COMISIÓN 3 % INCLUÍDA // PAGO CON TARJETA // VERCEL INC.', null, -683.39), 'tarjeta')
  assert.equal(categorizarPorReglas('COMPRA EN TINTORERIA ELENA', null, -14.50), 'tarjeta')
})

test('el fisco de verdad sigue cayendo a impuestos', () => {
  assert.equal(categorizarPorReglas('IMPUESTO DE HACIENDA IRPF 1005358505523', null, -1200), 'impuestos')
  assert.equal(categorizarPorReglas('TRIBUT HACIENDA', null, -300), 'impuestos')
  assert.equal(categorizarPorReglas('ADEUDO AEAT MODELO 130', null, -500), 'impuestos')
  assert.equal(categorizarPorReglas('AGENCIA TRIBUTARIA LIQUIDACION', null, -50), 'impuestos')
  assert.equal(categorizarPorReglas('RECIBO AYUNTAMIENTO DE SEVILLA', null, -90), 'impuestos')
})

test('liquidación del recibo de la tarjeta → transferencia (espejo, no gasto)', () => {
  assert.equal(categorizarPorReglas('TARJ.CRDTO 4662032010160302', null, -450.30), 'transferencia')
  assert.equal(categorizarPorReglas('PAGO RECIBO 4662032010160302', null, -450.30), 'transferencia')
})

test('cuota/mantenimiento de tarjeta → comisión bancaria (no compra)', () => {
  assert.equal(categorizarPorReglas('CUOTA TARJETA DEBITO ANUAL', null, -28), 'comision_bancaria')
})

test('transferencias y Bizum conservan su signo', () => {
  assert.equal(categorizarPorReglas('TRANSF. 0128 F0552026', null, 1691.58), 'cobro_cliente')
  assert.equal(categorizarPorReglas('TRANSFERENCIA EMITIDA', null, -100), 'transferencia')
  assert.equal(categorizarPorReglas('BIZUM // ENVIADO: cena', null, -20), 'transferencia')
  assert.equal(categorizarPorReglas('BIZUM // OTROS // RECIBIDO: bodega', null, 30), 'cobro_cliente')
})

test('pgcDe deriva la cuenta PGC y degrada a otros', () => {
  assert.equal(pgcDe('tarjeta'), '572')
  assert.equal(pgcDe('impuestos'), '475')
  assert.equal(pgcDe('categoria-inventada'), '629')
})
