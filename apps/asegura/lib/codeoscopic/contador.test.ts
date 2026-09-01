import { test } from 'node:test'
import assert from 'node:assert/strict'
import { puedeCotizar, cabenEnTanda, consumidasHoy, eurCents } from './contador.ts'
import type { Consumo } from './contador.ts'

const TOPES = { diario: 20, mensual: 200 }
const vacio: Consumo = { diaFacturables: 0, diaEnVuelo: 0, mesFacturables: 0, mesEnVuelo: 0 }

test('con el libro a cero se puede cotizar y quedan los topes enteros', () => {
  const v = puedeCotizar(vacio, TOPES)
  assert.equal(v.permitido, true)
  if (v.permitido) {
    assert.equal(v.restantesHoy, 20)
    assert.equal(v.restantesMes, 200)
  }
})

// ─── El corazón del diseño ───────────────────────────────────────────────────
test('una cotización EN VUELO consume cupo igual que una facturada', () => {
  // Regla de CLAUDE.md aplicada al dinero: no saber el desenlace de una llamada
  // no es saber que fue gratis. El vendor cobra por recibir la petición.
  const enVuelo: Consumo = { ...vacio, diaEnVuelo: 20, mesEnVuelo: 20 }
  const v = puedeCotizar(enVuelo, TOPES)
  assert.equal(v.permitido, false)
  if (!v.permitido) assert.equal(v.motivo, 'tope-diario')
})

test('lo consumido hoy es lo cerrado MÁS lo que quedó en el aire', () => {
  assert.equal(consumidasHoy({ ...vacio, diaFacturables: 7, diaEnVuelo: 3 }), 10)
})

test('el tope diario corta aunque el mensual tenga sitio de sobra', () => {
  const c: Consumo = { diaFacturables: 20, diaEnVuelo: 0, mesFacturables: 20, mesEnVuelo: 0 }
  const v = puedeCotizar(c, TOPES)
  assert.equal(v.permitido, false)
  if (!v.permitido) {
    assert.equal(v.motivo, 'tope-diario')
    assert.match(v.explicacion, /10,00€/) // 20 × 0,50€, en formato español
  }
})

test('el tope mensual corta aunque hoy no se haya cotizado nada', () => {
  const c: Consumo = { diaFacturables: 0, diaEnVuelo: 0, mesFacturables: 200, mesEnVuelo: 0 }
  const v = puedeCotizar(c, TOPES)
  assert.equal(v.permitido, false)
  if (!v.permitido) assert.equal(v.motivo, 'tope-mensual')
})

test('justo por debajo del tope todavía se puede, y queda 1', () => {
  const c: Consumo = { diaFacturables: 19, diaEnVuelo: 0, mesFacturables: 19, mesEnVuelo: 0 }
  const v = puedeCotizar(c, TOPES)
  assert.equal(v.permitido, true)
  if (v.permitido) assert.equal(v.restantesHoy, 1)
})

// ─── Tandas ──────────────────────────────────────────────────────────────────
test('una tanda se RECORTA al hueco disponible, no se redondea hacia arriba', () => {
  const c: Consumo = { diaFacturables: 15, diaEnVuelo: 0, mesFacturables: 15, mesEnVuelo: 0 }
  const r = cabenEnTanda(109, c, TOPES) // retarificar la cartera viva
  assert.equal(r.caben, 5)
  assert.equal(r.recortada, true)
  assert.equal(r.coste, '2,50€')
})

test('sin hueco caben cero y el coste es 0,00€ (no se cuela ninguna «de regalo»)', () => {
  const c: Consumo = { diaFacturables: 20, diaEnVuelo: 0, mesFacturables: 20, mesEnVuelo: 0 }
  const r = cabenEnTanda(5, c, TOPES)
  assert.equal(r.caben, 0)
  assert.equal(r.coste, '0,00€')
})

test('el coste de retarificar la cartera viva (109 pólizas) son 54,50€', () => {
  assert.equal(cabenEnTanda(109, vacio, { diario: 250, mensual: 1000 }).coste, '54,50€')
})

// ─── Formato de dinero: regla global de la casa ──────────────────────────────
test('el dinero sale en formato español, con € detrás y miles con punto', () => {
  assert.equal(eurCents(50), '0,50€')
  assert.equal(eurCents(5450), '54,50€')
  assert.equal(eurCents(200_012), '2.000,12€')
})
