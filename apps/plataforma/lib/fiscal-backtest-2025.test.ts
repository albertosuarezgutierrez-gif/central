// Backtest PERMANENTE del motor fiscal contra la renta 2025 REAL (conjunta, presentada el 30/06/2026,
// resultado −2.968,26€). Si alguien toca el motor y deja de cuadrar al céntimo (tolerancia < 10€ por casilla),
// esto se pone rojo. Runner: `node --test lib/fiscal-backtest-2025.test.ts` (puro: sin BD).
//
// Datos ANONIMIZADOS: sin nombres ni fechas de nacimiento reales. Las fechas son EQUIVALENTES (mismo año y mes,
// que es lo único que mira el motor: menor de 3, meses de maternidad, año de nacimiento). Los importes son los
// de las casillas de la declaración.
import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  IMPUTACION_INMUEBLES, TIPO_IMPUTACION_REVISADO, calcularPeriodo, estimarCierre, periodoCierre, rentaImputada,
  type EntradaBase, type PropiedadFiscal,
} from './base-fiscal-devengo.ts'
import {
  calcularDeducciones, calcularMaternidadGuarderia, calcularResultadoFiscal, deduccionDeportivaAndalucia, importesDe,
  mesesFamiliaNumerosa, type Descendiente, type PerfilFiscal,
} from './fiscal-deducciones.ts'
import { SIN_PALANCAS, declarar, parametrosIrpf, type EntradaSimulador } from './simulador-irpf.ts'

const TOL = 10 // € (criterio de aceptación)
const cerca = (a: number | null | undefined, b: number, tol = 0.01) => assert.ok(a != null && Math.abs(a - b) <= tol, `${a} ≉ ${b}`)

// ── Unidad familiar 2025 (anonimizada) ──────────────────────────────────────────────────────────
// Hijo 1 > 3 años; hijo 2 nacido en abril de 2024 (< 3 todo 2025, escuela infantil 10 meses según el modelo 233;
// el banco tiene 3.295,50€ de recibos en 2025); hijo 3 nacido en noviembre de 2025.
const HIJOS: Descendiente[] = [
  { nombre: 'H1', fechaNacimiento: '2018-03-15', gradoDiscapacidad: 0, computoCompleto: true },
  { nombre: 'H2', fechaNacimiento: '2024-04-20', gradoDiscapacidad: 0, computoCompleto: true, gastoGuarderia: 3295.5, mesesGuarderia: 10 },
  { nombre: 'H3', fechaNacimiento: '2025-11-20', gradoDiscapacidad: 0, computoCompleto: true },
]
const PERFIL: PerfilFiscal = {
  comunidadAutonoma: 'andalucia', declaracionConjunta: true, familiaNumerosa: 'general',
  familiaNumerosaDesde: '2025-11-20', // título con efectos en noviembre de 2025 (casilla 0650; fecha equivalente)
  conyugeTrabaja: true, gastoGuarderiaAnual: 3295.5, aportacionPlanPensiones: 0,
  gradoDiscapacidadTitular: 0, gradoDiscapacidadConyuge: 0, ascendientesACargo: 0, ascendientesMayores75: 0,
  donativosAnual: 215, gastoDeportivoAnual: 864, gastoDeportivoPorDeclarante: [432, 432],
  cuotasSSMadreAnual: 2356.2, // casilla 0218 de la actividad de la cónyuge
  abonoAnticipadoMaternidad: 1200, // casilla 0612
}
const PROPS: PropiedadFiscal[] = [
  { id: 'prop_house_sevillana', nombre: 'Piso A', bloque: 'capital_inmobiliario', titulares: [{ titular: 'alberto', porcentaje: 50 }, { titular: 'pilar', porcentaje: 50 }] },
  { id: 'prop_duplex_center', nombre: 'Piso B', bloque: 'capital_inmobiliario', titulares: [{ titular: 'alberto', porcentaje: 100 }] },
]
const mes = (m: number) => `2025-${String(m).padStart(2, '0')}`
// Base 2025 por devengo con las cifras de la declaración: piso A a disposición todo el año (sin ingresos),
// piso B arrendado 240 días con rendimiento neto 15.554,21€ (0154), actividad del declarante 3.628,15€
// (8.593,76 − 4.965,61) y de la cónyuge 6.147,97€ (8.827,75 − 2.679,78).
const ENTRADA: EntradaBase = {
  anio: 2025, hoy: '2025-12-31', propiedades: PROPS,
  ingresos: [{ propertyId: 'prop_duplex_center', checkIn: '2025-01-01', checkOut: '2025-08-29', bruto: 15554.21, neto: 15554.21 }], // 240 noches
  gastosPiso: [], gastosCompartidos: [], amortizacion: {},
  correduria: { ingresosPorMes: { [mes(12)]: 8593.76 * 0.85 }, gastosPorMes: { [mes(12)]: 4965.61 } },
  pilar: { ingresosPorMes: { [mes(12)]: 8827.75 }, gastosPorMes: { [mes(12)]: 2679.78 } },
}
const PERIODO = calcularPeriodo(ENTRADA, '2025-01-01', '2025-12-31')
const PARAMS = parametrosIrpf(2025, HIJOS)
const SIM: EntradaSimulador = {
  periodo: PERIODO, propiedades: PROPS, params: PARAMS,
  rendimientosTrabajo: { alberto: 0, pilar: 0 }, retenciones: { alberto: 2591.79, pilar: 0 }, pagosFraccionados: { alberto: 0, pilar: 0 },
}
const CONJ = declarar(SIM, { ...SIN_PALANCAS, donativos: { alberto: 0, pilar: 215 } }, 'conjunta').contribuyentes[0]
const DED = calcularDeducciones(PERFIL, HIJOS, 2025, importesDe(2025), CONJ.baseLiquidable ?? undefined)
const ded = (k: string) => DED.find(d => d.clave === k)
const RES = calcularResultadoFiscal(CONJ.baseLiquidable!, 2591.79, PERFIL, HIJOS, 2025)

// ── Casillas de la declaración ─────────────────────────────────────────────────────────────────
test('backtest 2025: imputación de rentas inmobiliarias = 3.287,87€ (0155: 1.505,49 × 2 + 276,89)', () => {
  cerca(PERIODO.imputacionTotal, 3287.87, 0.02)
  cerca(PERIODO.imputaciones!.find(l => l.propertyId === 'prop_duplex_center')!.importe, 276.89)
  assert.equal(PERIODO.imputaciones!.find(l => l.propertyId === 'prop_duplex_center')!.diasNoArrendados, 125)
})
test('backtest 2025: base imponible general 28.618,20€ (0435) y liquidable 25.218,20€ (0500)', () => {
  cerca(PERIODO.baseGeneral, 28618.2, TOL)
  cerca(CONJ.baseImponible, 28618.2, TOL)
  cerca(CONJ.baseLiquidable, 25218.2, TOL)
})
test('backtest 2025: mínimos 20.250 estatal (0519) / 21.130 autonómico (0520)', () => {
  assert.equal(CONJ.minimo, 20250)
  assert.equal(CONJ.minimoAutonomico, 21130)
})
test('backtest 2025: cuota íntegra estatal 745,23€ (0545) y autonómica 613,23€ (0546)', () => {
  cerca(CONJ.cuota!.estatal, 745.23, TOL)
  cerca(CONJ.cuota!.autonomica, 613.23, TOL)
  cerca(RES.cuotaIntegraEstatal, 745.23, TOL)
  cerca(RES.cuotaIntegraAutonomica, 613.23, TOL)
})
test('backtest 2025: deducciones (donativos 172, nacimiento 200, deporte 129,60, maternidad 1.400, guardería 833,33, FN 200; sin FN andaluza)', () => {
  cerca(ded('donativos')?.importe, 172, TOL)
  cerca(ded('and_nacimiento')?.importe, 200, TOL)
  cerca(ded('and_deportiva')?.importe, 129.6, TOL)
  cerca(ded('maternidad')?.importe, 1400, TOL)
  cerca(ded('guarderia')?.importe, 833.33, TOL)
  cerca(ded('fn_general')?.importe, 200, TOL)
  assert.equal(ded('and_fn'), undefined, 'la FN andaluza es incompatible con la de nacimiento del mismo año')
})
test('backtest 2025: cuota líquida 856,86€ (0587) y resultado −2.968,26€ (0670)', () => {
  cerca(RES.cuotaLiquida, 856.86, TOL)
  cerca(RES.abonosAnticipados, 1200)
  cerca(RES.resultado, -2968.26, TOL)
})

// ── Cepos de cada regla (un brazo por aserción) ─────────────────────────────────────────────────
test('imputación: 2 % (1,1 % si revisado) × días no arrendados / días del año; sin valor o sin «revisado» ⇒ null', () => {
  cerca(rentaImputada(40425.46, false, 125, 365), 276.89)
  cerca(rentaImputada(40425.46, true, 365, 365), 40425.46 * TIPO_IMPUTACION_REVISADO)
  assert.equal(rentaImputada(null, false, 365, 365), null)
  assert.equal(rentaImputada(40425.46, null, 365, 365), null)
  assert.equal(rentaImputada(40425.46, false, 0, 365), 0) // arrendado todo el año: 0 comprobado
})
test('imputación: se reparte por titularidad (50/50) en individual y entra en la base de cada uno', () => {
  const ind = declarar(SIM, SIN_PALANCAS, 'individual').contribuyentes
  const al = ind.find(c => c.titular === 'alberto')!, pi = ind.find(c => c.titular === 'pilar')!
  cerca(al.baseImponible, 15554.21 + 1505.49 + 276.89 + 3628.15, 0.02)
  cerca(pi.baseImponible, 1505.49 + 6147.97, 0.02)
})
test('imputación: un piso de capital inmobiliario sin valor catastral ⇒ base «sin dato» (null), nunca 0', () => {
  const p = calcularPeriodo({ ...ENTRADA, imputacion: { prop_duplex_center: IMPUTACION_INMUEBLES.prop_duplex_center } }, '2025-01-01', '2025-12-31')
  assert.equal(p.imputacionTotal, null)
  assert.equal(p.baseGeneral, null)
  assert.equal(declarar({ ...SIM, periodo: p }, SIN_PALANCAS, 'individual').contribuyentes[0].baseImponible, null)
})
test('imputación en el cierre: año entero con días reales + estimados; sin días estimados ⇒ null', () => {
  const e: EntradaBase = { ...ENTRADA, anio: 2026, hoy: '2026-10-31', ingresos: [{ propertyId: 'prop_duplex_center', checkIn: '2026-01-01', checkOut: '2026-01-11', bruto: 1000, neto: 1000 }, { propertyId: 'prop_duplex_center', checkIn: '2026-11-10', checkOut: '2026-11-15', bruto: 500, neto: 500 }], correduria: { ingresosPorMes: {}, gastosPorMes: {} }, pilar: { ingresosPorMes: {}, gastosPorMes: {} } }
  const real = calcularPeriodo(e, '2026-01-01', '2026-10-31')
  const base = estimarCierre(e, real).escenarios[0]
  assert.equal(base.diasPorPiso.prop_duplex_center, 5)
  const c = periodoCierre(real, base, 2026)
  const b = c.imputaciones!.find(l => l.propertyId === 'prop_duplex_center')!
  assert.equal(b.diasNoArrendados, 365 - 10 - 5)
  cerca(b.importe, 40425.46 * 0.02 * 350 / 365)
  assert.equal(periodoCierre(real, { ...base, diasPorPiso: {} }, 2026).baseGeneral, null)
})
test('familia numerosa estatal: prorrateo por meses con título vigente el último día del mes; sin fecha ⇒ sin dato', () => {
  assert.equal(mesesFamiliaNumerosa('2025-11-18', 2025), 2)
  assert.equal(mesesFamiliaNumerosa('2025-11-30', 2025), 2)
  assert.equal(mesesFamiliaNumerosa('2025-12-01', 2025), 1)
  assert.equal(mesesFamiliaNumerosa('2025-11-18', 2026), 12)
  assert.equal(mesesFamiliaNumerosa(null, 2025), null)
  const sin = calcularDeducciones({ ...PERFIL, familiaNumerosaDesde: null }, HIJOS, 2025).find(d => d.clave === 'fn_general')!
  assert.equal(sin.sinDato, true)
  assert.equal(sin.importe, 0)
})
test('deporte Andalucía: 15 % por declarante con tope 100€ cada uno, al céntimo', () => {
  assert.deepEqual(deduccionDeportivaAndalucia({ gastoDeportivoAnual: 864, gastoDeportivoPorDeclarante: [432, 432], declaracionConjunta: true }), { importe: 129.6, estimado: false })
  assert.equal(deduccionDeportivaAndalucia({ gastoDeportivoAnual: 433, gastoDeportivoPorDeclarante: [433], declaracionConjunta: false }).importe, 64.95)
  assert.equal(deduccionDeportivaAndalucia({ gastoDeportivoAnual: 2000, gastoDeportivoPorDeclarante: [1000, 1000], declaracionConjunta: true }).importe, 200)
  assert.deepEqual(deduccionDeportivaAndalucia({ gastoDeportivoAnual: 864, declaracionConjunta: true }), { importe: 129.6, estimado: true })
})
test('guardería: el gasto POR HIJO va a su hijo (el recién nacido no se lleva la mitad); solo total con varios hijos ⇒ estimado', () => {
  const r = calcularMaternidadGuarderia(PERFIL, HIJOS, 2025)
  cerca(r.guarderia, 833.33) // 1.000 × 10/12, todo del hijo 2
  assert.equal(r.guarderiaEstimada, false)
  const soloTotal = HIJOS.map(h => ({ ...h, gastoGuarderia: undefined, mesesGuarderia: undefined }))
  const t = calcularMaternidadGuarderia({ ...PERFIL, gastoGuarderiaAnual: 833.33 }, soloTotal, 2025)
  assert.equal(t.guarderiaEstimada, true)
  assert.equal(calcularDeducciones({ ...PERFIL, gastoGuarderiaAnual: 833.33 }, soloTotal, 2025).find(d => d.clave === 'guarderia')?.estimado, true)
  // Un solo hijo con derecho: el total es suyo (no estimado).
  assert.equal(calcularMaternidadGuarderia({ ...PERFIL, gastoGuarderiaAnual: 500 }, [soloTotal[1]], 2025).guarderiaEstimada, false)
})
test('resultado: el abono anticipado de maternidad se suma (sin él saldría 1.200€ más a devolver)', () => {
  cerca(calcularResultadoFiscal(CONJ.baseLiquidable!, 2591.79, { ...PERFIL, abonoAnticipadoMaternidad: null }, HIJOS, 2025).resultado, -2968.26 - 1200, TOL)
})
