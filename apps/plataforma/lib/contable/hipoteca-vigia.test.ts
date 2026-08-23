// apps/plataforma/lib/contable/hipoteca-vigia.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { avisosHipoteca, refPrestamo, type CuotaMov, type FichaHipoteca } from './hipoteca-vigia.ts'

const FICHA_MC: FichaHipoteca = {
  id: 'act_monte_carmelo',
  nombre: 'Monte Carmelo 68 — vivienda habitual',
  cuotaMensual: 772.86,
  notas: 'CAJASUR nº 856289293-5, abr-2021 …',
}

const mov = (fecha: string, importe: number, concepto = 'CUOTA PTMO 856289293-5'): CuotaMov => ({ fecha, importe, concepto })

test('extrae la referencia del préstamo del concepto bancario', () => {
  assert.equal(refPrestamo('CUOTA PTMO 856289293-5'), '856289293-5')
  assert.equal(refPrestamo('cuota ptmo. 123456'), '123456')
  assert.equal(refPrestamo('TRANSFERENCIA RECIBIDA'), null)
})

test('cuota estable y ficha al día → silencio (nada que decir)', () => {
  const avisos = avisosHipoteca([mov('2026-08-05', -772.86), mov('2026-07-06', -772.86)], [FICHA_MC])
  assert.deepEqual(avisos, [])
})

test('cambio de cuota → aviso con importes en formato español y fecha del recibo', () => {
  const avisos = avisosHipoteca([mov('2026-04-06', -754.67), mov('2026-05-05', -772.86)], [{ ...FICHA_MC, cuotaMensual: 772.86 }])
  assert.equal(avisos.length, 1)
  assert.ok(avisos[0].includes('754,67€'))
  assert.ok(avisos[0].includes('772,86€'))
  assert.ok(avisos[0].includes('2026-05-05'))
  assert.ok(avisos[0].includes('856289293-5'))
})

test('ficha desincronizada con lo que cobra el banco → aviso de actualizar patrimonio_activos', () => {
  const avisos = avisosHipoteca([mov('2026-08-05', -772.86), mov('2026-07-06', -772.86)], [{ ...FICHA_MC, cuotaMensual: 754.67 }])
  assert.equal(avisos.length, 1)
  assert.ok(avisos[0].includes('act_monte_carmelo'))
  assert.ok(avisos[0].includes('772,86€'))
})

test('sin movimientos de cuota → NO se afirma nada (no hay datos ≠ todo en orden)', () => {
  assert.deepEqual(avisosHipoteca([], [FICHA_MC]), [])
})

test('ficha con cuota NULL no dispara desincronización (no se sabe, no se compara)', () => {
  const avisos = avisosHipoteca([mov('2026-08-05', -772.86)], [{ ...FICHA_MC, cuotaMensual: null }])
  assert.deepEqual(avisos, [])
})

test('un solo recibo → sin comparación de cambio (no hay anterior)', () => {
  const avisos = avisosHipoteca([mov('2026-08-05', -772.86)], [FICHA_MC])
  assert.deepEqual(avisos, [])
})

test('desordenado en el tiempo → compara los DOS últimos recibos reales', () => {
  const avisos = avisosHipoteca(
    [mov('2026-03-05', -754.67), mov('2026-08-05', -772.86), mov('2026-07-06', -772.86)],
    [FICHA_MC],
  )
  assert.deepEqual(avisos, []) // últimos dos son iguales (772,86) — el salto de marzo ya es viejo
})

test('dos préstamos distintos se vigilan por separado', () => {
  const avisos = avisosHipoteca(
    [
      mov('2026-08-05', -772.86),
      mov('2026-07-06', -772.86),
      mov('2026-08-10', -300, 'CUOTA PTMO 111222333'),
      mov('2026-07-10', -280, 'CUOTA PTMO 111222333'),
    ],
    [FICHA_MC],
  )
  assert.equal(avisos.length, 1)
  assert.ok(avisos[0].includes('111222333'))
})
