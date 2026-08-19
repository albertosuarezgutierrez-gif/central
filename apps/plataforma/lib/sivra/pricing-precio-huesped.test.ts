import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  precioHuesped, baseDondeLaCuotaMandaya, TOPE_CARO,
  type FechaHuesped,
} from './pricing-precio-huesped.ts'

// Parámetros REALES de House medidos el 19/08/2026, con su estancia típica de 2 noches:
// la cuota fija de 597€ son 298,5€ POR NOCHE que el motor no ve.
const HOUSE = { markup: 0.902, cuotaFija: 597, nochesRef: 2 }
const f = (fecha: string, baseAplicada: number, medMercadoGuest: number | null): FechaHuesped =>
  ({ fecha, baseAplicada, medMercadoGuest })

test('🚨 el punto ciego: el motor en su SUELO y el huésped viendo casi el doble del mercado', () => {
  // El motor baja House a su min_price (300€) creyendo que regala la noche. El huésped ve 569€,
  // contra un mercado de 320€: un 78% por encima. Ningún raíl del motor lo ve, porque todos
  // razonan en base y en base estamos en el mínimo.
  const r = precioHuesped([f('2027-02-10', 300, 320)], HOUSE)
  assert.equal(r.fechas[0].guest, 569)
  assert.equal(r.fechas[0].estado, 'caro')
  assert.ok(r.fechas[0].ratio! > 1.7, `ratio ${r.fechas[0].ratio}`)
  // Y más de la mitad de lo que paga el huésped es cuota fija.
  assert.ok(r.fechas[0].pesoCuota > 0.5, `peso ${r.fechas[0].pesoCuota}`)
})

test('en fechas CARAS la cuota fija apenas pesa y el precio sigue a la base', () => {
  // Navidad: base 1.400€, el huésped ve 1.562€ contra un mercado de 1.500€. Cuadra.
  const r = precioHuesped([f('2026-12-27', 1400, 1500)], HOUSE)
  assert.equal(r.fechas[0].estado, 'ok')
  assert.ok(r.fechas[0].pesoCuota < 0.25, `peso ${r.fechas[0].pesoCuota}`)
})

test('sin cuota fija el punto ciego no existe: el peso es 0 a cualquier precio', () => {
  const sinCuota = { markup: 1.0, cuotaFija: 0, nochesRef: 2 }
  const r = precioHuesped([f('a', 300, 320), f('b', 1400, 1500)], sinCuota)
  assert.ok(r.fechas.every(v => v.pesoCuota === 0))
  assert.ok(r.fechas.every(v => v.estado === 'ok'))
})

test('🚨 una fecha SIN mercado no es una fecha que cuadre: va en su propio recuento', () => {
  const r = precioHuesped([f('a', 300, null), f('b', 1400, 1500)], HOUSE)
  assert.equal(r.sinMercado, 1)
  assert.equal(r.ok, 1)
  assert.equal(r.caras, 0)
  // Y nunca encabeza el aviso: no se puede decir «estás caro» de algo que no se ha comparado.
  assert.ok(r.peores.every(v => v.ratio != null))
})

test('regalar la noche también se detecta', () => {
  const r = precioHuesped([f('a', 300, 900)], HOUSE)
  assert.equal(r.fechas[0].estado, 'barato')
  assert.equal(r.baratas, 1)
})

test('las peores salen ordenadas y acotadas para el aviso', () => {
  const r = precioHuesped([
    f('a', 300, 320), f('b', 300, 300), f('c', 1400, 1500), f('d', 500, 400),
  ], HOUSE, { maxPeores: 2 })
  assert.equal(r.peores.length, 2)
  assert.ok(r.peores[0].ratio! >= r.peores[1].ratio!)
  assert.ok(r.peores[0].ratio! > TOPE_CARO)
})

test('la base sin base aplicada no se juzga', () => {
  const r = precioHuesped([f('a', 0, 400)], HOUSE)
  assert.equal(r.fechas.length, 0)
})

// ─── El punto en el que bajar la base deja de servir ───────────────────────────────────────────

test('el suelo ÚTIL de House: por debajo de ~331€ de base, la cuota manda', () => {
  // 298,5€/noche de cuota fija. Con base 331€: 0,902×331 = 298,6€ de parte variable → 50/50.
  const b = baseDondeLaCuotaMandaya(HOUSE, 0.5)
  assert.ok(b !== null && Math.abs(b - 331) <= 2, `base ${b}`)
  // Verificación cruzada con el propio cálculo del precio del huésped.
  const r = precioHuesped([f('x', b!, 1000)], HOUSE)
  assert.ok(Math.abs(r.fechas[0].pesoCuota - 0.5) < 0.02, `peso ${r.fechas[0].pesoCuota}`)
})

test('sin cuota fija no hay tal punto, y se dice con null en vez de un número inventado', () => {
  assert.equal(baseDondeLaCuotaMandaya({ markup: 1.1, cuotaFija: 0, nochesRef: 2 }), null)
})

test('repartir la cuota entre más noches mueve el punto: la estancia típica importa', () => {
  const dos = baseDondeLaCuotaMandaya({ ...HOUSE, nochesRef: 2 })!
  const cinco = baseDondeLaCuotaMandaya({ ...HOUSE, nochesRef: 5 })!
  assert.ok(cinco < dos, `${cinco} debería ser menor que ${dos}`)
})
