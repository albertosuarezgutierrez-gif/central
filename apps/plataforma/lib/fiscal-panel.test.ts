// Runner: `node --test lib/fiscal-panel.test.ts`. Puro: sin BD ni reloj (el «hoy» se inyecta).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { Periodo, PropiedadFiscal } from './base-fiscal-devengo.ts'
import {
  MARGEN_CERCA, ahorroPorPalanca, comparar, comprasParaMotor, construirAcciones, nivelUmbral, palancasActivas, rangoDe, serieAcumulada, tablaTramos,
  contribuyenteDe,
} from './fiscal-panel.ts'
import { SIN_PALANCAS, declarar, palancasPorDefecto, parametrosIrpf, simularEscenario, type EntradaSimulador } from './simulador-irpf.ts'

const cerca = (a: number | null | undefined, b: number, tol = 0.01) => assert.ok(a != null && Math.abs(a - b) <= tol, `${a} ≉ ${b}`)

// ── Semáforo ────────────────────────────────────────────────────────────────────────────────
test('semáforo: frontera exacta 60.000€ no «pasa»; 60.000,01€ sí', () => {
  assert.equal(nivelUmbral(60000, 60000), 'cerca')
  assert.equal(nivelUmbral(60000.01, 60000.01), 'pasa')
})
test('semáforo: «cerca» = margen < 3.000€ (2.999,99 cerca; 3.000 seguro)', () => {
  assert.equal(MARGEN_CERCA, 3000)
  assert.equal(nivelUmbral(57000.01, 57000.01), 'cerca')
  assert.equal(nivelUmbral(57000, 57000), 'seguro')
})
test('semáforo: el peor caso del rango manda (central seguro, peor cruza → cerca)', () => {
  assert.equal(nivelUmbral(50000, 61000), 'cerca')
  assert.equal(nivelUmbral(50000, 55000), 'seguro')
})
test('semáforo: null → sin_dato, nunca verde', () => {
  assert.equal(nivelUmbral(null, 40000), 'sin_dato')
  assert.equal(nivelUmbral(null, null), 'sin_dato')
})
test('rangoDe: ignora null pero avisa de que está incompleto', () => {
  assert.deepEqual(rangoDe([null, null]), null)
  assert.deepEqual(rangoDe([100, null, 300]), { min: 100, max: 300, completo: false })
})

// ── Serie acumulada ─────────────────────────────────────────────────────────────────────────
const mes = (n: number) => `2026-${String(n).padStart(2, '0')}`
test('serie: acumula, resta la reducción conjunta y proyecta hasta el cierre', () => {
  const porMes = Array.from({ length: 10 }, (_, i) => ({ mes: mes(i + 1), total: 5000 }))
  const s = serieAcumulada(porMes, 60000, { min: 55000, max: 66000 }, 2026)
  cerca(s[9].real, 50000 - 3400)
  assert.equal(s[10].real, null)
  cerca(s[9].proy, 50000 - 3400)
  cerca(s[11].proy, 60000 - 3400)
  assert.deepEqual(s[11].banda?.map(Math.round), [55000 - 3400, 66000 - 3400])
  assert.equal(s[3].proy, null, 'la proyección no pisa los meses reales')
})
test('serie: un mes sin dato rompe lo real y NO se proyecta desde un origen desconocido', () => {
  const porMes = [{ mes: mes(1), total: 1000 }, { mes: mes(2), total: null }, { mes: mes(3), total: 1000 }]
  const s = serieAcumulada(porMes, 20000, null, 2026)
  cerca(s[0].real, 0) // 1000 − 3400 → 0
  assert.equal(s[1].real, null)
  assert.equal(s[2].real, null)
  assert.ok(s.slice(1).every(p => p.proy == null))
})
test('serie: cierre sin dato → sin proyección (no 0)', () => {
  const s = serieAcumulada([{ mes: mes(1), total: 9000 }], null, null, 2026)
  assert.ok(s.every(p => p.proy == null))
})

// ── Motor sobre un caso mínimo ──────────────────────────────────────────────────────────────
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

test('comparar: conjunta e individual usan la MISMA base total', () => {
  const e = entrada(70000)
  const c = declarar(e, SIN_PALANCAS, 'conjunta'), i = declarar(e, SIN_PALANCAS, 'individual')
  cerca(contribuyenteDe(c, 'conjunta')!.baseImponible, 70000)
  cerca(contribuyenteDe(i, 'alberto')!.baseImponible! + contribuyenteDe(i, 'pilar')!.baseImponible!, 70000)
  const r = comparar(c, i)
  assert.ok(r.masBarata != null && r.ahorro! >= 0 && r.conjunta! > 0 && r.individual! > 0)
})
test('comparar: sin dato en una modalidad → todo null (nunca ahorro 0)', () => {
  const e = entrada(70000, null)
  const r = comparar(declarar(e, SIN_PALANCAS, 'conjunta'), declarar(e, SIN_PALANCAS, 'individual'))
  assert.equal(r.masBarata, null); assert.equal(r.ahorro, null); assert.equal(r.conjunta, null)
})

test('ahorroPorPalanca coincide con el motor (paridad) y con la suma activada en el interruptor', () => {
  const e = entrada(70000)
  const def = palancasPorDefecto(e)
  const a = ahorroPorPalanca(e, def, [], 'alberto')
  const res = simularEscenario(e, def)
  const donativos = res.palancas.find(p => p.id === 'donativos')!
  assert.ok(a.donativos! > 0 && a.donativos! <= donativos.ahorro.individual! + 0.01)
  const sin = contribuyenteDe(declarar(e, SIN_PALANCAS, 'individual'), 'alberto')!.cuotaLiquida!
  const con = contribuyenteDe(declarar(e, palancasActivas({ donativos: true }, def, []), 'individual'), 'alberto')!.cuotaLiquida!
  cerca(a.donativos, sin - con)
})

test('acciones: ordenadas por ahorro; ahorroPorEuro<1 NUNCA sale en verde; sin dato va al final', () => {
  const e = entrada(70000)
  const res = simularEscenario(e, palancasPorDefecto(e))
  const ah = ahorroPorPalanca(e, palancasPorDefecto(e), [], 'alberto')
  const acc = construirAcciones(res, { ...ah, plan_conyuge: null }, '2026-10-31', 2026)
  for (const x of acc) if (x.ahorroPorEuro != null && x.ahorroPorEuro < 1) assert.equal(x.verde, false, x.titulo)
  const ahorros = acc.map(x => x.ahorro ?? -Infinity)
  assert.deepEqual([...ahorros].sort((p, q) => q - p), ahorros)
  const plan = acc.find(x => x.id === 'plan_conyuge')
  assert.ok(plan, 'ahorro sin dato se conserva, no se descarta'); assert.equal(plan.ahorro, null)
  assert.equal(acc[acc.length - 1].id, 'plan_conyuge')
  const d = acc.find(x => x.id === 'donativos')!
  assert.equal(d.diasRestantes, 61)
  assert.equal(d.plazo, 'hasta 31/12/2026')
})

test('tablaTramos: columna sin dato → celdas null (no 0) y total null', () => {
  const e = entrada(70000)
  const c = contribuyenteDe(declarar(e, SIN_PALANCAS, 'conjunta'), 'conjunta')
  const t = tablaTramos([c, null])
  assert.ok(t.filas.every(f => f.celdas[1] === null))
  assert.equal(t.totales[1], null)
  assert.ok(t.totales[0]!.cuotaIntegra > 0)
  cerca(t.totales[0]!.cuotaIntegra, c!.cuota!.total)
  // «cada 1.000€»: sobre 60k combinado sube al 45 % → 450€
  const alto = contribuyenteDe(declarar(entrada(80000), SIN_PALANCAS, 'conjunta'), 'conjunta')!
  cerca(alto.cada1000, 450)
})

test('compras: fecha fuera del año → se evalúa el 15/12; tipo null se conserva (no cuenta)', () => {
  const r = comprasParaMotor([
    { id: '1', descripcion: '', importe: 500, propertyId: 'prop_a', tipo: null, fechaPrevista: '2027-02-01' },
    { id: '2', descripcion: '', importe: 500, propertyId: 'prop_a', tipo: 'reparacion', fechaPrevista: '2026-11-20' },
  ], 2026)
  assert.equal(r[0].fecha, '2026-12-15'); assert.equal(r[0].tipo, null); assert.equal(r[1].fecha, '2026-11-20')
})
