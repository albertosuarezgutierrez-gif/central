import { test } from 'node:test'
import assert from 'node:assert/strict'
import { estadoCargo, esAviso, sumaDias, DIAS_GRACIA } from './domiciliados.ts'

// Caso fundacional (26/08/2026): DIGI emite la factura el 21, avisa el 25 y cobra el 28.
// El 26 no hay nada que reclamar — es justo el día en que saltó la falsa alarma.
test('DIGI: entre la emisión y la domiciliación NO se avisa', () => {
  const v = estadoCargo({ fechaCargo: '2026-08-28', hoy: '2026-08-26', cargoCasado: false, bancoHasta: '2026-08-25' })
  assert.equal(v.estado, 'pendiente')
  assert.equal(esAviso(v), false)
  assert.match(v.motivo, /2026-08-28/)
})

test('cargo ya casado → cobrado, sin importar fechas', () => {
  const v = estadoCargo({ fechaCargo: '2026-07-30', hoy: '2026-08-26', cargoCasado: true, bancoHasta: null })
  assert.equal(v.estado, 'cobrado')
  assert.equal(esAviso(v), false)
})

test('vencida con el banco cubriendo la fecha → aviso', () => {
  const v = estadoCargo({ fechaCargo: '2026-07-30', hoy: '2026-08-26', cargoCasado: false, bancoHasta: '2026-08-25' })
  assert.equal(v.estado, 'sin_cargo')
  assert.equal(esAviso(v), true)
})

// El corazón de la regla "dato que no hay ≠ dato que no se ha mirado".
test('extracto que no llega a la fecha del cargo → sin_cobertura, NUNCA sin_cargo', () => {
  const v = estadoCargo({ fechaCargo: '2026-08-28', hoy: '2026-09-10', cargoCasado: false, bancoHasta: '2026-08-20' })
  assert.equal(v.estado, 'sin_cobertura')
  assert.equal(esAviso(v), false)
  assert.match(v.motivo, /2026-08-20/)
})

test('sin saber hasta dónde llega el banco → sin_cobertura', () => {
  const v = estadoCargo({ fechaCargo: '2026-08-28', hoy: '2026-09-10', cargoCasado: false, bancoHasta: null })
  assert.equal(v.estado, 'sin_cobertura')
  assert.equal(esAviso(v), false)
})

test('factura sin fecha de cargo: se declara el hueco, no se da por buena', () => {
  const v = estadoCargo({ fechaCargo: null, hoy: '2026-08-26', cargoCasado: false, bancoHasta: '2026-08-25' })
  assert.equal(v.estado, 'sin_fecha')
  assert.equal(esAviso(v), false)
})

test('el margen de gracia cubre el finde y la fecha valor', () => {
  const dentro = estadoCargo({ fechaCargo: '2026-08-28', hoy: '2026-08-31', cargoCasado: false, bancoHasta: '2026-08-31' })
  assert.equal(dentro.estado, 'pendiente')
  const fuera = estadoCargo({ fechaCargo: '2026-08-28', hoy: '2026-09-01', cargoCasado: false, bancoHasta: '2026-09-01' })
  assert.equal(fuera.estado, 'sin_cargo')
  assert.equal(DIAS_GRACIA, 3)
})

test('el margen de gracia es configurable', () => {
  const v = estadoCargo({ fechaCargo: '2026-08-28', hoy: '2026-09-01', cargoCasado: false, bancoHasta: '2026-09-01', diasGracia: 10 })
  assert.equal(v.estado, 'pendiente')
})

test('sumaDias cruza mes y año sin desfase de zona horaria', () => {
  assert.equal(sumaDias('2026-08-30', 3), '2026-09-02')
  assert.equal(sumaDias('2026-12-30', 3), '2027-01-02')
  assert.equal(sumaDias('2026-02-26', 3), '2026-03-01')
  assert.equal(sumaDias('2026-03-01', -1), '2026-02-28')
})

import { esDomiciliacionExplicita, cuentasParadas } from './domiciliados.ts'
import { test as t2 } from 'node:test'
import assert2 from 'node:assert/strict'

const base = { fechaCargo: '2026-09-10', hoy: '2026-10-04', cargoCasado: false, bancoHasta: null }
const fresca = { nombre: 'A', ultimo: '2026-10-03' }
const parada = { nombre: 'Tarjeta 3059', ultimo: '2026-07-05' }

t2('domiciliado null/ausente/false → fuera del detector', () => {
  assert2.equal(esDomiciliacionExplicita({ domiciliado: null }), false)
  assert2.equal(esDomiciliacionExplicita({}), false)
  assert2.equal(esDomiciliacionExplicita(null), false)
  assert2.equal(esDomiciliacionExplicita({ domiciliado: false }), false)
  assert2.equal(esDomiciliacionExplicita({ domiciliado: true }), true)
})
t2('domiciliado + cargo casado → cobrado', () => {
  assert2.equal(estadoCargo({ ...base, cargoCasado: true, cuentas: [fresca] }).estado, 'cobrado')
})
t2('todas las cuentas frescas y sin cargo → sin_cargo', () => {
  assert2.equal(estadoCargo({ ...base, cuentas: [fresca, { nombre: 'B', ultimo: '2026-10-04' }] }).estado, 'sin_cargo')
})
t2('una cuenta parada → sin_cobertura y la nombra', () => {
  const v = estadoCargo({ ...base, cuentas: [fresca, parada] })
  assert2.equal(v.estado, 'sin_cobertura')
  assert2.match(v.motivo, /Tarjeta 3059/)
  assert2.deepEqual(cuentasParadas([fresca, parada], '2026-09-10').map((c) => c.nombre), ['Tarjeta 3059'])
})
t2('sin cuentas con movimientos → sin_cobertura', () => {
  assert2.equal(estadoCargo({ ...base, cuentas: [] }).estado, 'sin_cobertura')
})
