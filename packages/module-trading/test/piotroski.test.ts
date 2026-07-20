import { test } from 'node:test'
import assert from 'node:assert/strict'
import { piotroskiFScore, type AnioFinanciero } from '../src/piotroski.ts'

// Empresa que mejora en TODO respecto al año previo → 9/9.
const previo: AnioFinanciero = {
  roa: 0.05, cfo: 100, beneficioNeto: 90, ratioDeudaLp: 0.30, ratioCorriente: 1.5,
  acciones: 1000, margenBruto: 0.35, rotacionActivos: 0.8,
}
const actualPerfecto: AnioFinanciero = {
  roa: 0.08,            // roaPositivo + roaMejora
  cfo: 150,             // cfoPositivo + calidadBeneficio (cfo>beneficio)
  beneficioNeto: 120,
  ratioDeudaLp: 0.25,   // menosDeudaLp
  ratioCorriente: 1.8,  // masLiquidez
  acciones: 1000,       // sinDilucion (igual, no aumenta)
  margenBruto: 0.38,    // mejorMargenBruto
  rotacionActivos: 0.9, // mejorRotacion
}

test('piotroskiFScore da 9 cuando la empresa mejora en todo', () => {
  const r = piotroskiFScore(actualPerfecto, previo)
  assert.equal(r.score, 9)
  assert.equal(Object.values(r.detalle).every(Boolean), true)
})

test('piotroskiFScore da 0 en una empresa que empeora en todo', () => {
  const malo: AnioFinanciero = {
    roa: -0.02,          // roa no positivo, no mejora
    cfo: -10,            // cfo no positivo; calidadBeneficio: -10 > -5? no
    beneficioNeto: -5,
    ratioDeudaLp: 0.40,  // más deuda
    ratioCorriente: 1.2, // menos liquidez
    acciones: 1200,      // dilución
    margenBruto: 0.30,   // peor margen
    rotacionActivos: 0.7,// peor rotación
  }
  const r = piotroskiFScore(malo, previo)
  assert.equal(r.score, 0)
})

test('sinDilucion puntúa con acciones IGUALES pero no si aumentan', () => {
  const base = piotroskiFScore(actualPerfecto, previo)
  assert.equal(base.detalle.sinDilucion, true)                       // iguales → cuenta
  const diluido = piotroskiFScore({ ...actualPerfecto, acciones: 1001 }, previo)
  assert.equal(diluido.detalle.sinDilucion, false)                   // +1 acción → no
  assert.equal(diluido.score, 8)
})

test('calidadBeneficio exige que la caja supere al beneficio contable (devengo)', () => {
  const conAccruals = piotroskiFScore({ ...actualPerfecto, cfo: 100, beneficioNeto: 120 }, previo)
  assert.equal(conAccruals.detalle.calidadBeneficio, false)          // cfo<beneficio → beneficio "de papel"
})
