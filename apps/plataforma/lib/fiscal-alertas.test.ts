// Runner: `node --test lib/fiscal-alertas.test.ts`. Puro: sin BD ni reloj.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { AvisosDatos, Periodo, PropiedadFiscal } from './base-fiscal-devengo.ts'
import { parametrosIrpf, type EntradaSimulador } from './simulador-irpf.ts'
import {
  CUENTAS_CUBIERTAS_POR, avisoCuentas, avisoDiciembre, avisoFacturasMeses, avisoUmbral, construirAlertas, decidirEnvios, hashTexto, mejorPalanca,
} from './fiscal-alertas.ts'

const PROPS: PropiedadFiscal[] = [{ id: 'prop_a', nombre: 'A', bloque: 'capital_inmobiliario', titulares: [{ titular: 'alberto', porcentaje: 100 }] }]
function entrada(neto: number, corr: number | null = 0): EntradaSimulador {
  const p: Periodo = {
    desde: '2026-01-01', hasta: '2026-12-31', porMes: [], compartidosSinRepartir: 0,
    correduria: { cobrado: null, bruto: null, retencion: null, gastos: null, neto: corr }, pilar: { ingresos: null, gastos: null, neto: 0 },
    lineas: [{ propertyId: 'prop_a', nombre: 'A', bloque: 'capital_inmobiliario', bruto: neto * 2, comision: 0, gastosDirectos: 0, mobiliario: 0, compartidos: 0, amortizacion: null, dias: 0, neto }],
    bloques: { capital_inmobiliario: neto, capital_mobiliario: 0, actividad_correduria: corr, actividad_pilar: 0 },
    baseGeneral: corr == null ? null : neto + corr,
  }
  return {
    periodo: p, propiedades: PROPS, params: parametrosIrpf(2026, []),
    rendimientosTrabajo: { alberto: 0, pilar: 0 }, retenciones: { alberto: null, pilar: null }, pagosFraccionados: { alberto: null, pilar: null },
    intereses: { prop_a: 0 },
  }
}
const sinAvisos: AvisosDatos = { cuentasSinActualizar: [], mesesSinLimpieza: [], mesesSinSuministros: [] }

// ── 1. Umbral ───────────────────────────────────────────────────────────────────────────────
test('umbral: base individual a menos de 3.000€ → aviso con cifra, margen y mejor palanca', () => {
  const a = avisoUmbral(entrada(58000), [], 2026)!
  assert.ok(a, 'debe avisar')
  assert.match(a.texto, /58\.000,00€/)
  assert.match(a.texto, /margen 2\.000,00€/)
  assert.match(a.texto, /Mejor palanca: .+ahorra \d/)
})
test('umbral: por encima de 60.000€ → «por ENCIMA en X»', () => {
  assert.match(avisoUmbral(entrada(65000), [], 2026)!.texto, /por ENCIMA en 5\.000,00€/)
})
test('umbral: margen justo de 3.000€ NO avisa; 2.999€ sí (frontera)', () => {
  assert.equal(avisoUmbral(entrada(57000), [], 2026), null)
  assert.ok(avisoUmbral(entrada(57001), [], 2026))
})
test('umbral: lejos del umbral no avisa', () => {
  assert.equal(avisoUmbral(entrada(40000), [], 2026), null)
})
test('umbral: sin dato de base → lo dice, no calla ni inventa 0', () => {
  const a = avisoUmbral(entrada(58000, null), [], 2026)!
  assert.match(a.texto, /sin dato/)
  assert.doesNotMatch(a.texto, /0,00€/)
})
test('mejorPalanca: mayor ahorro positivo; null/≤0 se ignoran', () => {
  assert.equal(mejorPalanca({ donativos: null, compras: 0 }), null)
  assert.equal(mejorPalanca({ donativos: 100, plan_conyuge: 300, compras: null })!.id, 'plan_conyuge')
})

// ── 2. Cuentas ──────────────────────────────────────────────────────────────────────────────
const cuentas = (...c: [string, string | null, number | null][]): AvisosDatos => ({
  ...sinAvisos, cuentasSinActualizar: c.map(([nombre, ultimoMovimiento, dias]) => ({ nombre, ultimoMovimiento, dias })),
})
test('cuentas: ninguna parada → sin aviso', () => assert.equal(avisoCuentas(sinAvisos, 2026), null))
test('cuentas: BBVA y Pilar piden extracto; las demás, reconectar; sin movimientos se dice', () => {
  const t = avisoCuentas(cuentas(['BBVA Dúplex', '2026-09-01', 60], ['Cuenta Pilar', null, null], ['Kutxabank', '2026-09-20', 41]), 2026)!.texto
  assert.match(t, /BBVA Dúplex: último movimiento 01\/09\/2026 \(hace 60 días\), envía el extracto para importarlo/)
  assert.match(t, /Cuenta Pilar: sin movimientos registrados, envía el extracto/)
  assert.match(t, /Kutxabank: .+reconecta/)
})
test('cuentas: la tarjeta Kutxabank (débito de la cuenta de pisos) NO avisa', () => {
  assert.ok(CUENTAS_CUBIERTAS_POR.length > 0)
  assert.equal(avisoCuentas(cuentas(['Tarjeta Kutxabank', '2026-08-01', 90]), 2026), null)
  assert.match(avisoCuentas(cuentas(['Tarjeta Kutxabank', '2026-08-01', 90], ['BBVA correduría', null, null]), 2026)!.texto, /BBVA correduría/)
  assert.doesNotMatch(avisoCuentas(cuentas(['Tarjeta Kutxabank', '2026-08-01', 90], ['BBVA correduría', null, null]), 2026)!.texto, /Tarjeta/)
})

// ── 3. Meses sin factura ────────────────────────────────────────────────────────────────────
test('facturas: solo meses CERRADOS (el mes en curso no cuenta)', () => {
  const a = { ...sinAvisos, mesesSinLimpieza: ['2026-09', '2026-10'], mesesSinSuministros: ['2026-10'] }
  const t = avisoFacturasMeses(a, '2026-10-31', 2026)!.texto
  assert.match(t, /Limpieza: 09\/2026$/m)
  assert.doesNotMatch(t, /10\/2026/)
  assert.equal(avisoFacturasMeses({ ...sinAvisos, mesesSinSuministros: ['2026-10'] }, '2026-10-31', 2026), null)
})

// ── 4. Diciembre ────────────────────────────────────────────────────────────────────────────
test('diciembre: solo del 1 al 31/12; fuera de diciembre no hay recordatorio', () => {
  assert.equal(avisoDiciembre(entrada(50000), [], '2026-11-30', 2026), null)
  assert.equal(avisoDiciembre(entrada(50000), [], '2027-01-01', 2026), null)
  for (const d of ['2026-12-01', '2026-12-31']) {
    const a = avisoDiciembre(entrada(50000), [], d, 2026)!
    assert.match(a.texto, /plan de pensiones de Pilar/i)
    assert.match(a.texto, /Donativos/); assert.match(a.texto, /Reparaciones/)
    assert.equal(a.soloUnaVez, true)
  }
})
test('construirAlertas: junta los avisos aplicables y omite los que no', () => {
  const k = construirAlertas({ hoy: '2026-12-05', anio: 2026, entrada: entrada(58000), avisos: sinAvisos, compras: [] }).map(a => a.clave)
  assert.deepEqual(k, ['umbral-2026', 'diciembre-2026'])
  assert.deepEqual(construirAlertas({ hoy: '2026-10-31', anio: 2026, entrada: null, avisos: null, compras: [] }), [])
})

// ── Anti-spam ───────────────────────────────────────────────────────────────────────────────
const AHORA = new Date('2026-11-09T07:41:00Z')
const dias = (n: number) => new Date(AHORA.getTime() - n * 86_400_000)
const al = { clave: 'umbral-2026', texto: 'X' }
test('dedupe: mismo contenido dentro de 7 días se omite; a los 7 días o con contenido distinto, sale', () => {
  assert.equal(decidirEnvios([al], [{ clave: 'umbral-2026', hash: hashTexto('X'), enviadoAt: dias(6) }], AHORA).length, 0)
  assert.equal(decidirEnvios([al], [{ clave: 'umbral-2026', hash: hashTexto('X'), enviadoAt: dias(7) }], AHORA).length, 1)
  assert.equal(decidirEnvios([al], [{ clave: 'umbral-2026', hash: hashTexto('otro'), enviadoAt: dias(1) }], AHORA).length, 1)
  assert.equal(decidirEnvios([al], [{ clave: 'cuentas-2026', hash: hashTexto('X'), enviadoAt: dias(1) }], AHORA).length, 1)
  assert.equal(decidirEnvios([al], [], AHORA).length, 1)
})
test('dedupe: el recordatorio de diciembre es único aunque cambie el texto', () => {
  const d = { clave: 'diciembre-2026', texto: 'nuevo', soloUnaVez: true }
  assert.equal(decidirEnvios([d], [{ clave: 'diciembre-2026', hash: hashTexto('viejo'), enviadoAt: dias(20) }], AHORA).length, 0)
})
