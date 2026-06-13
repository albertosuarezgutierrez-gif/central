// Tests de la lógica PURA del cuadre de caja (@central/module-contabilidad/caja).
// Se ejecutan con el runner de Node (type-stripping): `node --test`.
// Riesgo: un descuadre mal calculado da falsos positivos/negativos de robo o error
// de caja → el operador desconfía del módulo. Cubrimos signos, conteo y bordes.

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { calcularCuadreCaja, totalDesglose, DENOMINACIONES_EUR } from '../src/caja.ts'
import type { MovimientoCaja } from '../src/types.ts'

// ── totalDesglose ─────────────────────────────────────────────────────────────
test('totalDesglose: suma billetes y monedas mixtos', () => {
  // 2×50 + 3×20 + 10×0.50 = 100 + 60 + 5 = 165
  assert.equal(totalDesglose({ '50': 2, '20': 3, '0.5': 10 }), 165)
})

test('totalDesglose: null/undefined/vacío → 0', () => {
  assert.equal(totalDesglose(null), 0)
  assert.equal(totalDesglose(undefined), 0)
  assert.equal(totalDesglose({}), 0)
})

test('totalDesglose: ignora claves/cantidades no válidas', () => {
  assert.equal(totalDesglose({ '50': 1, basura: 5, '20': -2, '10': 0 }), 50)
})

test('totalDesglose: céntimos sin errores de coma flotante', () => {
  // 3×0.01 + 1×0.02 = 0.05 (no 0.05000000001)
  assert.equal(totalDesglose({ '0.01': 3, '0.02': 1 }), 0.05)
})

test('DENOMINACIONES_EUR: contiene billetes y monedas estándar de mayor a menor', () => {
  assert.equal(DENOMINACIONES_EUR[0], 500)
  assert.equal(DENOMINACIONES_EUR[DENOMINACIONES_EUR.length - 1], 0.01)
})

// ── calcularCuadreCaja ────────────────────────────────────────────────────────
const movsBase: MovimientoCaja[] = [
  { tipo: 'apertura', importe: 100 },
  { tipo: 'cobro_efectivo', importe: 50 },
  { tipo: 'cobro_efectivo', importe: 30 },
  { tipo: 'retiro', importe: -20 }, // salidas guardadas en negativo
  { tipo: 'gasto', importe: -10 },
]

test('calcularCuadreCaja: saldo teórico = apertura + cobros − salidas', () => {
  const c = calcularCuadreCaja(movsBase)
  assert.equal(c.fondo_inicial, 100)
  assert.equal(c.cobros_efectivo, 80)
  assert.equal(c.salidas_caja, 30)
  assert.equal(c.saldo_teorico, 150) // 100 + 80 − 30
})

test('calcularCuadreCaja: sin conteo físico → diferencia 0 y conteo_realizado false', () => {
  const c = calcularCuadreCaja(movsBase)
  assert.equal(c.conteo_realizado, false)
  assert.equal(c.fondo_final, 0)
  assert.equal(c.diferencia_caja, 0)
})

test('calcularCuadreCaja: conteo manual exacto → descuadre 0', () => {
  const c = calcularCuadreCaja(movsBase, { fondoFinalManual: 150 })
  assert.equal(c.conteo_realizado, true)
  assert.equal(c.fondo_final, 150)
  assert.equal(c.diferencia_caja, 0)
})

test('calcularCuadreCaja: falta dinero → descuadre negativo', () => {
  const c = calcularCuadreCaja(movsBase, { fondoFinalManual: 145 })
  assert.equal(c.diferencia_caja, -5)
})

test('calcularCuadreCaja: sobra dinero → descuadre positivo', () => {
  const c = calcularCuadreCaja(movsBase, { fondoFinalManual: 152.5 })
  assert.equal(c.diferencia_caja, 2.5)
})

test('calcularCuadreCaja: conteo por desglose físico', () => {
  // 2×50 + 2×20 + 1×10 = 150 → cuadra
  const c = calcularCuadreCaja(movsBase, { desgloseManual: { '50': 2, '20': 2, '10': 1 } })
  assert.equal(c.fondo_final, 150)
  assert.equal(c.diferencia_caja, 0)
})

test('calcularCuadreCaja: manual tiene prioridad sobre desglose', () => {
  const c = calcularCuadreCaja(movsBase, { fondoFinalManual: 140, desgloseManual: { '50': 3 } })
  assert.equal(c.fondo_final, 140)
})

test('calcularCuadreCaja: usa el último arqueo/cierre con desglose si no hay manual', () => {
  const movs: MovimientoCaja[] = [
    ...movsBase,
    { tipo: 'arqueo', importe: 0, desglose_monedas: { '50': 2, '20': 1 } }, // 120 (intermedio)
    { tipo: 'cierre', importe: 0, desglose_monedas: { '50': 2, '20': 2, '10': 1 } }, // 150 (final)
  ]
  const c = calcularCuadreCaja(movs)
  assert.equal(c.conteo_realizado, true)
  assert.equal(c.fondo_final, 150) // toma el ÚLTIMO control
  assert.equal(c.diferencia_caja, 0)
})

test('calcularCuadreCaja: arqueo/cierre no alteran el saldo teórico', () => {
  const movs: MovimientoCaja[] = [
    { tipo: 'apertura', importe: 100 },
    { tipo: 'cobro_efectivo', importe: 50 },
    { tipo: 'arqueo', importe: 0, desglose_monedas: { '50': 3 } },
    { tipo: 'cierre', importe: 0, desglose_monedas: { '50': 3 } },
  ]
  const c = calcularCuadreCaja(movs)
  assert.equal(c.saldo_teorico, 150)
  assert.equal(c.fondo_final, 150)
  assert.equal(c.diferencia_caja, 0)
})

test('calcularCuadreCaja: sin movimientos → todo a cero', () => {
  const c = calcularCuadreCaja([])
  assert.deepEqual(c, {
    fondo_inicial: 0,
    cobros_efectivo: 0,
    salidas_caja: 0,
    saldo_teorico: 0,
    fondo_final: 0,
    diferencia_caja: 0,
    conteo_realizado: false,
  })
})
