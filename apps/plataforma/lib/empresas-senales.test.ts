// Tests del mapeo enriquecimiento → señales. Runner: `node --test`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { enriquecimientoASenales, mesesDesde, type FilaEnriquecimiento } from './empresas-senales.ts'

const HOY = new Date('2026-07-17T00:00:00Z')
const vacia: FilaEnriquecimiento = {
  patrimonio_neto: null, ebitda_n: null, ebitda_n1: null, fondo_maniobra: null,
  ultimo_deposito: null, incidencias_pago: null, deuda_ebitda: null, refinanciaciones: null,
}

test('fila vacía → sin señales', () => {
  assert.deepEqual(enriquecimientoASenales(vacia, HOY), {})
})

test('patrimonio neto negativo o casi cero dispara la señal', () => {
  assert.equal(enriquecimientoASenales({ ...vacia, patrimonio_neto: -5000 }, HOY).patrimonioNetoNegativo, true)
  assert.equal(enriquecimientoASenales({ ...vacia, patrimonio_neto: 500 }, HOY).patrimonioNetoNegativo, true)
  assert.equal(enriquecimientoASenales({ ...vacia, patrimonio_neto: 50000 }, HOY).patrimonioNetoNegativo, false)
})

test('EBITDA negativo 2 años requiere AMBOS ejercicios negativos', () => {
  assert.equal(enriquecimientoASenales({ ...vacia, ebitda_n: -10, ebitda_n1: -20 }, HOY).ebitdaNegativo2Anios, true)
  assert.equal(enriquecimientoASenales({ ...vacia, ebitda_n: -10, ebitda_n1: 20 }, HOY).ebitdaNegativo2Anios, false)
  assert.equal(enriquecimientoASenales({ ...vacia, ebitda_n: -10 }, HOY).ebitdaNegativo2Anios, undefined)
})

test('retraso del depósito en meses', () => {
  // depósito hace ~19 meses
  assert.equal(enriquecimientoASenales({ ...vacia, ultimo_deposito: '2024-12-01' }, HOY).cuentasRetrasoMeses, 19)
})

test('deuda/EBITDA y refinanciaciones', () => {
  const s = enriquecimientoASenales({ ...vacia, deuda_ebitda: 7.5, refinanciaciones: 3 }, HOY)
  assert.equal(s.deudaEbitda, 7.5)
  assert.equal(s.refinanciacionesFrecuentes, true)
  assert.equal(enriquecimientoASenales({ ...vacia, refinanciaciones: 1 }, HOY).refinanciacionesFrecuentes, false)
})

test('mesesDesde cuenta bien el corte por día', () => {
  assert.equal(mesesDesde('2026-01-17', HOY), 6)
  assert.equal(mesesDesde('2026-01-18', HOY), 5) // aún no ha "cumplido" el mes en curso
})
