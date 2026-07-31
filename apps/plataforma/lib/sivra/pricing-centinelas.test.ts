import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  decidirEventoSinRespaldo,
  decidirEventoNoCatalogado,
  decidirPrecioPorPlaza,
} from './pricing-centinelas.ts'

// ─── 1. Evento declarado que el mercado no respalda ──────────────────────────────────────────

test('el caso Feria 2027: fecha declarada de Feria con mercado de dia normal → alerta', () => {
  // 20/04/2027 estaba marcado x2,8 en el calendario. El mercado de ese dia iba como un abril normal.
  const v = decidirEventoSinRespaldo({ factorEvento: 2.8, p50Fecha: 162, p50Mes: 155, compsFecha: 14 })
  assert.equal(v.alerta, true)
  assert.equal(v.evaluado, true)
  assert.match(v.motivo, /FECHA/)
})

test('la Feria de verdad (mercado x3 el mes) no dispara', () => {
  const v = decidirEventoSinRespaldo({ factorEvento: 2.8, p50Fecha: 470, p50Mes: 155, compsFecha: 14 })
  assert.equal(v.alerta, false)
  assert.equal(v.evaluado, true)
})

test('un puente flojo no se juzga como evento fuerte', () => {
  const v = decidirEventoSinRespaldo({ factorEvento: 1.3, p50Fecha: 100, p50Mes: 100, compsFecha: 30 })
  assert.equal(v.evaluado, false)
})

test('sin muestra NO dice "todo bien": dice que no ha podido mirarlo', () => {
  const pocos = decidirEventoSinRespaldo({ factorEvento: 2.8, p50Fecha: 162, p50Mes: 155, compsFecha: 3 })
  assert.equal(pocos.alerta, false)
  assert.equal(pocos.evaluado, false)

  const sinMes = decidirEventoSinRespaldo({ factorEvento: 2.8, p50Fecha: 162, p50Mes: null, compsFecha: 20 })
  assert.equal(sinMes.evaluado, false)

  const sinFecha = decidirEventoSinRespaldo({ factorEvento: 2.8, p50Fecha: null, p50Mes: 155, compsFecha: 20 })
  assert.equal(sinFecha.evaluado, false)
})

test('justo en el umbral de ratio se sostiene (no alerta)', () => {
  const v = decidirEventoSinRespaldo({ factorEvento: 2.0, p50Fecha: 125, p50Mes: 100, compsFecha: 10 })
  assert.equal(v.alerta, false)
  assert.equal(v.evaluado, true)
})

// ─── 2. Mercado disparado sin evento catalogado ──────────────────────────────────────────────

test('el caso Bienal: septiembre con el mercado al doble y sin evento → alerta', () => {
  const v = decidirEventoNoCatalogado({ factorEvento: 1, p50Fecha: 240, p50Mes: 120, compsFecha: 12 })
  assert.equal(v.alerta, true)
  assert.equal(v.evaluado, true)
  assert.match(v.motivo, /NO hay evento catalogado/)
})

test('si el evento ya esta catalogado no volvemos a avisar', () => {
  const v = decidirEventoNoCatalogado({ factorEvento: 1.6, p50Fecha: 240, p50Mes: 120, compsFecha: 12 })
  assert.equal(v.alerta, false)
  assert.equal(v.evaluado, true)
  assert.match(v.motivo, /catalogado/)
})

test('un finde normal (mercado x1,2) no dispara: seria ruido diario', () => {
  const v = decidirEventoNoCatalogado({ factorEvento: 1, p50Fecha: 144, p50Mes: 120, compsFecha: 12 })
  assert.equal(v.alerta, false)
  assert.equal(v.evaluado, true)
})

test('sin mercado suficiente tampoco opina', () => {
  const v = decidirEventoNoCatalogado({ factorEvento: 1, p50Fecha: 240, p50Mes: 120, compsFecha: 2 })
  assert.equal(v.evaluado, false)
})

// ─── 3. Precio por plaza ─────────────────────────────────────────────────────────────────────

test('el caso Socorro: 165€ en una casa de 12 plazas es precio de hostal → alerta', () => {
  const v = decidirPrecioPorPlaza({ precio: 165, plazas: 12 })
  assert.equal(v.alerta, true)
  assert.equal(v.evaluado, true)
  // 165 * 0,76 / 12 = 10,45€ por plaza — Alberto lo calculo en bruto (13,75€) y ya le parecio poco.
  assert.match(v.motivo, /10\.45€ por plaza/)
})

test('el suelo nuevo de House (300€) pasa holgado', () => {
  const v = decidirPrecioPorPlaza({ precio: 300, plazas: 12 })
  assert.equal(v.alerta, false)
  assert.equal(v.evaluado, true)
})

test('en un piso pequeño la metrica NO aplica y se dice, no se aprueba', () => {
  // Luxury: suelo 72€ para 5 plazas = 10,94€/plaza y aun asi cubre el coste 2,4 veces. Si esto
  // se juzgara con la vara de Socorro, el guardian avisaria a diario de un piso que esta bien.
  const luxury = decidirPrecioPorPlaza({ precio: 72, plazas: 5 })
  assert.equal(luxury.alerta, false)
  assert.equal(luxury.evaluado, false)

  const busto = decidirPrecioPorPlaza({ precio: 65, plazas: 2 })
  assert.equal(busto.alerta, false)
  assert.equal(busto.evaluado, false)
})

test('sin aforo no se inventa un veredicto', () => {
  assert.equal(decidirPrecioPorPlaza({ precio: 165, plazas: null }).evaluado, false)
  assert.equal(decidirPrecioPorPlaza({ precio: 165, plazas: 0 }).evaluado, false)
  assert.equal(decidirPrecioPorPlaza({ precio: 0, plazas: 12 }).evaluado, false)
})

test('el ratio de canal se puede afinar (la venta directa no paga comision)', () => {
  // 280€ entre 12 plazas: por Booking son 17,73€/plaza (avisa); a puerta, 23,33€ (no avisa).
  const canal = decidirPrecioPorPlaza({ precio: 280, plazas: 12 })
  const directa = decidirPrecioPorPlaza({ precio: 280, plazas: 12, ratioCanal: 1 })
  assert.equal(canal.alerta, true)
  assert.equal(directa.alerta, false)
})
