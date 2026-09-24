import test from 'node:test'
import assert from 'node:assert/strict'
import { estadoCuadre, remesaInferida, remesaEfectiva, brutoEfectivo, totalEsCerrado, cuantosPendientes, mesEnPeriodo, finDeMes, type EntradaCuadre } from './cuadre.ts'

const base: EntradaCuadre = {
  leidoOk: true,
  tieneCobertura: true,
  esperadoBruto: null,
  liqBruto: null,
  liqRetencion: null,
  liqRemesa: null,
  bancoTotal: null,
}

// ── «No se ha mirado» ≠ «no hay» ────────────────────────────────────────────

test('una lectura fallida es no-comprobado, no «no hay comisiones»', () => {
  assert.equal(estadoCuadre({ ...base, leidoOk: false }), 'no-comprobado')
  // Y manda sobre todo lo demás: aunque haya importes cargados de una pasada
  // anterior, si esta lectura falló no se puede afirmar nada del periodo.
  assert.equal(
    estadoCuadre({ ...base, leidoOk: false, liqBruto: 95.03, liqRetencion: 14.26, liqRemesa: 80.77, bancoTotal: 80.77 }),
    'no-comprobado',
  )
})

test('una compañía sin ninguna fuente es sin-cobertura, no sin-datos', () => {
  // Generali: la diferencia importa porque «sin-datos» invita a esperar y
  // «sin-cobertura» dice que hay una gestión pendiente (pedirlo a TIREA).
  assert.equal(estadoCuadre({ ...base, tieneCobertura: false }), 'sin-cobertura')
})

test('con cobertura y sin nada llegado es sin-datos', () => {
  assert.equal(estadoCuadre(base), 'sin-datos')
})

// ── Casos reales medidos el 01/09/2026 ──────────────────────────────────────

test('Allianz feb/2026 cuadra: 95,03 − 14,26 = 80,77 = banco', () => {
  assert.equal(
    estadoCuadre({
      ...base,
      esperadoBruto: 95.03,
      liqBruto: 95.03,
      liqRetencion: 14.26,
      liqRemesa: 80.77,
      bancoTotal: 80.77,
    }),
    'cuadra',
  )
})

test('🪤 Occident con bruto negativo: si el banco trae |bruto| − retención, CUADRA (no es deudor)', () => {
  const occ = (bruto: number, ret: number, banco: number | null) =>
    estadoCuadre({ ...base, esperadoBruto: bruto, liqBruto: bruto, liqRetencion: ret, liqRemesa: 0, bancoTotal: banco })
  assert.equal(occ(-274.16, 41.12, 233.04), 'cuadra')   // abr/2026
  assert.equal(occ(-561.9, 84.28, 477.62), 'cuadra')    // may/2026 (dos abonos)
  assert.equal(occ(-346.2, 51.9, 294.3), 'cuadra')      // jul/2026
  assert.equal(occ(-287.68, 43.15, 279.68), 'descuadra') // jun/2026: +35,15€ sin explicar
  assert.equal(occ(-144.44, 21.67, 98.85), 'descuadra')  // ago/2026: −23,92€
  assert.equal(occ(-346.2, 51.9, null), 'liquidado-sin-cobrar') // sin abono: como cualquier otra compañía
  assert.equal(occ(-10, 15, null), 'deudor')            // ni invirtiendo el signo queda nada que ingresar
  assert.equal(remesaEfectiva(-274.16, 41.12, 0), 233.04)
  assert.equal(remesaEfectiva(95.03, 14.26, 80.77), 80.77)
  assert.equal(brutoEfectivo(-274.16, 0), 274.16)
  assert.equal(brutoEfectivo(95.03, 80.77), 95.03)
  assert.equal(remesaInferida(-274.16, 41.12), 233.04)
})

test('Mapfre: 3.614,65€ devengados y ninguna liquidación', () => {
  assert.equal(estadoCuadre({ ...base, esperadoBruto: 3614.65 }), 'esperado-sin-liquidar')
})

test('Allianz: liquidado y no ingresado (los 558,88€ parados)', () => {
  assert.equal(
    estadoCuadre({ ...base, liqBruto: 95.03, liqRetencion: 14.26, liqRemesa: 80.77, bancoTotal: null }),
    'liquidado-sin-cobrar',
  )
})

test('entra dinero en el banco que ninguna fuente explica', () => {
  assert.equal(estadoCuadre({ ...base, bancoTotal: 250 }), 'cobrado-sin-liquidar')
})

// ── Tolerancias ─────────────────────────────────────────────────────────────

test('bruto − retención ≠ remesa descuadra, con un céntimo de margen', () => {
  assert.equal(
    estadoCuadre({ ...base, liqBruto: 95.03, liqRetencion: 14.26, liqRemesa: 70, bancoTotal: 70 }),
    'descuadra',
  )
  assert.equal(
    estadoCuadre({ ...base, liqBruto: 95.03, liqRetencion: 14.26, liqRemesa: 80.78, bancoTotal: 80.78 }),
    'cuadra',
  )
})

test('la ventana banco↔remesa admite hasta un euro', () => {
  assert.equal(
    estadoCuadre({ ...base, liqBruto: 95.03, liqRetencion: 14.26, liqRemesa: 80.77, bancoTotal: 80.2 }),
    'cuadra',
  )
  assert.equal(
    estadoCuadre({ ...base, liqBruto: 95.03, liqRetencion: 14.26, liqRemesa: 80.77, bancoTotal: 60 }),
    'descuadra',
  )
})

test('un cero NO es un null: liquidado 0 con banco 0 cuadra', () => {
  assert.equal(estadoCuadre({ ...base, liqBruto: 0, liqRetencion: 0, liqRemesa: 0, bancoTotal: 0 }), 'cuadra')
  // …mientras que sin liquidación y sin banco sigue siendo «no ha llegado».
  assert.equal(estadoCuadre(base), 'sin-datos')
})

// ── Total anual ─────────────────────────────────────────────────────────────

test('un año con un hueco NO se presenta como cerrado', () => {
  assert.equal(totalEsCerrado(['cuadra', 'cuadra', 'sin-datos']), false)
  assert.equal(totalEsCerrado(['cuadra', 'deudor', 'descuadra']), true)
  assert.equal(cuantosPendientes(['cuadra', 'sin-datos', 'sin-cobertura', 'no-comprobado']), 3)
})

// ── Solape mes ↔ periodo ────────────────────────────────────────────────────

test('un mes natural cae en el periodo de la compañía aunque no coincidan', () => {
  // Periodo real de CIMA para Allianz: 31/05/2026 → 01/07/2026. Toca mayo,
  // junio y julio; un 'YYYY-MM' habría perdido justo esto.
  assert.equal(mesEnPeriodo('2026-05', '2026-05-31', '2026-07-01'), true)
  assert.equal(mesEnPeriodo('2026-06', '2026-05-31', '2026-07-01'), true)
  assert.equal(mesEnPeriodo('2026-07', '2026-05-31', '2026-07-01'), true)
  assert.equal(mesEnPeriodo('2026-04', '2026-05-31', '2026-07-01'), false)
  assert.equal(mesEnPeriodo('2026-08', '2026-05-31', '2026-07-01'), false)
})

test('finDeMes acierta en febrero bisiesto y en los de 30', () => {
  assert.equal(finDeMes('2026-07'), '2026-07-31')
  assert.equal(finDeMes('2026-04'), '2026-04-30')
  assert.equal(finDeMes('2028-02'), '2028-02-29')
  assert.equal(finDeMes('2026-02'), '2026-02-28')
})

test('un mes mal formado no cae en ningún periodo', () => {
  assert.equal(mesEnPeriodo('abril', '2026-01-01', '2026-12-31'), false)
})
