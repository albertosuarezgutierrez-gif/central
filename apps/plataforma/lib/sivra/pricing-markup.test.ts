import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  markupMedido, desviacionMarkup, MIN_MUESTRAS_MARKUP, TOLERANCIA_MARKUP,
  type MuestraEscaparate,
} from './pricing-markup.ts'

const m = (rateDate: string, guests: number, precioEscaparate: number, precioBase: number | null): MuestraEscaparate =>
  ({ rateDate, guests, precioEscaparate, precioBase })

test('el markup es la MEDIANA de escaparate ÷ base al aforo máximo', () => {
  const r = markupMedido([
    m('2026-12-26', 12, 1100, 1000),   // 1,10
    m('2026-12-27', 12, 1200, 1000),   // 1,20
    m('2026-12-28', 12, 1150, 1000),   // 1,15
  ], { aforoMax: 12 })
  assert.equal(r.markup, 1.15)
  assert.equal(r.muestras, 3)
})

test('las muestras de OTRO aforo no cuentan: medirían el recargo por persona, no el markup', () => {
  // Medido el 18/08/2026: 12 huéspedes 1.531,80€ vs ≤6 1.384,62€ la misma noche. Meter la de 6 en
  // la mediana bajaría el markup sin que el canal hubiera cambiado nada.
  const r = markupMedido([
    m('2026-12-26', 12, 1531.8, 1393.5),
    m('2026-12-26', 6, 1384.62, 1393.5),
    m('2026-12-26', 2, 1384.62, 1393.5),
  ], { aforoMax: 12, minMuestras: 1 })
  assert.equal(r.muestras, 1)
  assert.equal(r.markup, 1.099)
})

test('sin base conocida la muestra NO entra: un ratio desconocido no es un ratio de 1', () => {
  const r = markupMedido([
    m('2026-12-26', 12, 1100, null),
    m('2026-12-27', 12, 1200, null),
  ], { aforoMax: 12, minMuestras: 1 })
  assert.equal(r.markup, null)
  assert.equal(r.motivo, 'sin_muestras')
})

test('muestra corta = no lo sé, NO un markup inventado', () => {
  const r = markupMedido([m('2026-12-26', 12, 1100, 1000)], { aforoMax: 12 })
  assert.equal(r.markup, null)
  assert.equal(r.muestras, 1)
  assert.equal(r.motivo, 'muestra_corta')
  assert.ok(MIN_MUESTRAS_MARKUP > 1)
})

test('una base o un escaparate a 0 o negativo no envenenan la mediana', () => {
  const r = markupMedido([
    m('2026-12-26', 12, 1100, 1000),
    m('2026-12-27', 12, 0, 1000),
    m('2026-12-28', 12, 1200, 0),
    m('2026-12-29', 12, 1300, 1000),
    m('2026-12-30', 12, 1500, 1000),
  ], { aforoMax: 12 })
  assert.equal(r.muestras, 3)
  assert.equal(r.markup, 1.3)
})

test('sin medición el estado es SIN DATOS, nunca ok', () => {
  // Un check que se pone verde porque no hay datos es el fallo más caro que hay.
  const d = desviacionMarkup({ configurado: 1.2, medido: null })
  assert.equal(d.estado, 'sin_datos')
  assert.equal(d.sesgo, null)
})

test('el caso real: configurado 1,20 contra un escaparate medido a 1,10', () => {
  const d = desviacionMarkup({ configurado: 1.2, medido: 1.1 })
  assert.equal(d.estado, 'desviado')
  // Listamos un 9% por debajo del mercado que el propio motor mide.
  assert.equal(d.sesgo, 0.0909)
})

test('dentro de la tolerancia no se avisa (el canal no es un reloj)', () => {
  const d = desviacionMarkup({ configurado: 1.2, medido: 1.23 })
  assert.equal(d.estado, 'ok')
  assert.ok(Math.abs(d.sesgo!) < TOLERANCIA_MARKUP)
})

test('el sesgo tiene SIGNO: negativo cuando listamos por encima', () => {
  const d = desviacionMarkup({ configurado: 1.0, medido: 1.2 })
  assert.equal(d.estado, 'desviado')
  assert.ok(d.sesgo! < 0)
})
