// Runner: `node --test lib/simulador-irpf.test.ts` (type-stripping). Puro: sin BD ni reloj.
import { test } from 'node:test'
import assert from 'node:assert/strict'

import type { Periodo, PropiedadFiscal } from './base-fiscal-devengo.ts'
import {
  ESCALA_ANDALUCIA_2026, ESCALA_ESTATAL_2026, SIN_PALANCAS, cuotaEscala, declarar, deduccionDonativos, fraccionDeducible,
  limitePlanConyuge, limitePlanPropio, parametrosIrpf, simularEscenario, tipoMarginal, type EntradaSimulador,
} from './simulador-irpf.ts'

const cerca = (a: number | null | undefined, b: number, tol = 0.01) => assert.ok(a != null && Math.abs(a - b) <= tol, `${a} ≉ ${b}`)

// 3 descendientes, 2 menores de 3 años (fechas relativas al ejercicio, no al reloj).
const P = parametrosIrpf(2026, [
  { nombre: 'h1', fechaNacimiento: '2019-05-01', gradoDiscapacidad: 0, computoCompleto: true },
  { nombre: 'h2', fechaNacimiento: '2024-05-01', gradoDiscapacidad: 0, computoCompleto: true },
  { nombre: 'h3', fechaNacimiento: '2025-05-01', gradoDiscapacidad: 0, computoCompleto: true },
])

const PROPS: PropiedadFiscal[] = [
  { id: 'S', nombre: 'Socorro', bloque: 'capital_inmobiliario', titulares: [{ titular: 'alberto', porcentaje: 50 }, { titular: 'pilar', porcentaje: 50 }] },
  { id: 'D', nombre: 'Dúplex', bloque: 'capital_inmobiliario', titulares: [{ titular: 'alberto', porcentaje: 100 }] },
  { id: 'B', nombre: 'Bustos', bloque: 'capital_mobiliario', titulares: [{ titular: 'alberto', porcentaje: 100 }] },
]
const linea = (propertyId: string, bloque: 'capital_inmobiliario' | 'capital_mobiliario', bruto: number, neto: number, gastosDirectos = 0) =>
  ({ propertyId, nombre: propertyId, bloque, bruto, comision: 0, gastosDirectos, mobiliario: 0, compartidos: 0, amortizacion: null, dias: 0, neto })
function periodo(o: { S?: number; D?: number; B?: number; corr?: number | null; pilar?: number | null; gastosD?: number; brutoD?: number } = {}): Periodo {
  const S = o.S ?? 50000, D = o.D ?? 14000, B = o.B ?? 21000
  const corr = o.corr === undefined ? -3000 : o.corr, pil = o.pilar === undefined ? 1513.68 : o.pilar
  return {
    desde: '2026-01-01', hasta: '2026-12-31', porMes: [], compartidosSinRepartir: 0,
    correduria: { cobrado: null, bruto: null, retencion: null, gastos: null, neto: corr }, pilar: { ingresos: null, gastos: null, neto: pil },
    lineas: [linea('S', 'capital_inmobiliario', 80000, S), linea('D', 'capital_inmobiliario', o.brutoD ?? 25000, D, o.gastosD ?? 0), linea('B', 'capital_mobiliario', 36000, B)],
    bloques: { capital_inmobiliario: S + D, capital_mobiliario: B, actividad_correduria: corr, actividad_pilar: pil },
    baseGeneral: S + D + B + (corr ?? 0) + (pil ?? 0),
  }
}
function entrada(p: Partial<EntradaSimulador> = {}): EntradaSimulador {
  return {
    periodo: periodo(), propiedades: PROPS, params: P,
    rendimientosTrabajo: { alberto: 0, pilar: 0 }, retenciones: { alberto: 1300, pilar: 300 }, pagosFraccionados: { alberto: 0, pilar: 0 },
    intereses: { S: 0, D: 0 }, ...p,
  }
}

// ── Escalas ─────────────────────────────────────────────────────────────────────────────────
test('escala estatal 2026: cuota de 60.000€ = 8.950,75€', () => {
  cerca(cuotaEscala(60000, ESCALA_ESTATAL_2026), 12450 * 0.095 + 7750 * 0.12 + 15000 * 0.15 + 24800 * 0.185)
})
test('escala andaluza 2026: cortes 13.000/21.100 → cuota de 60.000€ = 8.910€', () => {
  cerca(cuotaEscala(60000, ESCALA_ANDALUCIA_2026), 8910)
})
test('escala estatal: tramo > 300.000€ al 24,5 %', () => {
  cerca(cuotaEscala(300001, ESCALA_ESTATAL_2026) - cuotaEscala(300000, ESCALA_ESTATAL_2026), 0.245, 1e-6)
})

// ── Mínimos ─────────────────────────────────────────────────────────────────────────────────
test('mínimos: 3 descendientes (2 < 3 años) = 14.700€ → conjunta 20.250€', () => {
  cerca(P.minimoDescendientes, 14700)
  const c = declarar(entrada(), SIN_PALANCAS, 'conjunta').contribuyentes[0]
  cerca(c.minimo, 20250)
})
test('mínimos en individual: descendientes a partes iguales → 12.900€ cada uno', () => {
  const ind = declarar(entrada(), SIN_PALANCAS, 'individual').contribuyentes
  assert.deepEqual(ind.map(c => c.minimo), [12900, 12900])
})

test('mínimos AUTONÓMICOS de Andalucía: 5.790 / 2.510 / 2.820 / 4.170 + 2.920 por menor de 3 (renta 2025: 15.340)', () => {
  cerca(P.minimoAutonomicoContribuyente, 5790)
  // 3 hijos (1.º > 3 años; 2.º y 3.º < 3): 2.510 + 2.820 + 4.170 + 2 × 2.920 = 15.340 (casilla 0514 de la renta 2025).
  cerca(P.minimoAutonomicoDescendientes, 15340)
  const c = declarar(entrada(), SIN_PALANCAS, 'conjunta').contribuyentes[0]
  cerca(c.minimo, 20250) // el estatal no cambia
  cerca(c.minimoAutonomico, 21130) // casilla 0520
  // La cuota autonómica se calcula con SU mínimo, no con el estatal.
  cerca(c.cuota?.autonomica, Math.max(0, cuotaEscala(c.baseLiquidable!, ESCALA_ANDALUCIA_2026) - cuotaEscala(21130, ESCALA_ANDALUCIA_2026)))
  cerca(c.cuota?.estatal, Math.max(0, cuotaEscala(c.baseLiquidable!, ESCALA_ESTATAL_2026) - cuotaEscala(20250, ESCALA_ESTATAL_2026)))
  const ind = declarar(entrada(), SIN_PALANCAS, 'individual').contribuyentes
  cerca(ind[0].minimoAutonomico, 5790 + 15340 / 2)
})

// ── Umbral 60.000€ ──────────────────────────────────────────────────────────────────────────
test('umbral: 59.999,99€ marginal 37 %', () => { cerca(tipoMarginal(59999.99, 12900, P), 0.37, 1e-9) })
test('umbral: 60.000€ exactos sigue al 37 %', () => { cerca(tipoMarginal(60000, 12900, P), 0.37, 1e-9) })
test('umbral: 60.000,01€ pasa al 45 %', () => { cerca(tipoMarginal(60000.01, 12900, P), 0.45, 1e-9) })
test('umbral: distancia = 60.000 − base liquidable de Alberto (negativa si se pasa)', () => {
  const e = entrada({ periodo: periodo({ D: 30000 }) }) // Alberto: 25.000 + 30.000 + 21.000 − 3.000 = 73.000
  const a = declarar(e, SIN_PALANCAS, 'individual').contribuyentes[0]
  cerca(a.distanciaUmbral, -13000)
})
test('cada 1.000€ más de base bajo el umbral cuestan 370€', () => {
  const a = declarar(entrada(), SIN_PALANCAS, 'individual').contribuyentes[0] // 57.000
  cerca(a.cada1000, 370)
})

// ── Planes de pensiones ─────────────────────────────────────────────────────────────────────
test('plan propio de Pilar: 30 % de 1.513,68€ = 454,10€ (no 1.000€)', () => {
  cerca(limitePlanPropio(0, 1513.68, P), 454.10)
})
test('plan propio con actividad negativa (correduría −2.987€): límite 0', () => {
  assert.equal(limitePlanPropio(0, -2987.4, P), 0)
})
test('plan propio: tope absoluto 1.500€', () => { assert.equal(limitePlanPropio(40000, 0, P), 1500) })
test('plan propio: rendimiento del trabajo sin dato → límite null (no 0)', () => { assert.equal(limitePlanPropio(null, 1513.68, P), null) })
test('plan del cónyuge: Pilar < 8.000€ → 1.000€', () => { assert.equal(limitePlanConyuge(0, 1513.68, P), 1000) })
test('plan del cónyuge: Pilar ≥ 8.000€ → 0', () => { assert.equal(limitePlanConyuge(0, 8000, P), 0) })
test('plan propio por encima del límite: el simulador recorta al límite legal', () => {
  const e = entrada()
  const conPlan = declarar(e, { ...SIN_PALANCAS, planPropio: { alberto: 0, pilar: 1500 } }, 'individual').contribuyentes[1]
  cerca(conPlan.reducciones, 454.10)
})

// ── Donativos ───────────────────────────────────────────────────────────────────────────────
test('donativos: 250€ → 200€ de deducción en cuota', () => { cerca(deduccionDonativos(250, 50000, P), 200) })
test('donativos: 1.000€ → 200€ + 40 % de 750€ = 500€', () => { cerca(deduccionDonativos(1000, 50000, P), 500) })
test('donativos: base de deducción ≤ 10 % de la base liquidable', () => { cerca(deduccionDonativos(250, 1000, P), 80) })
test('donativos: no bajan la base liquidable', () => {
  const e = entrada()
  const sin = declarar(e, SIN_PALANCAS, 'individual').contribuyentes[0]
  const con = declarar(e, { ...SIN_PALANCAS, donativos: { alberto: 250, pilar: 0 } }, 'individual').contribuyentes[0]
  assert.equal(con.baseLiquidable, sin.baseLiquidable)
})

// ── Compras previstas ───────────────────────────────────────────────────────────────────────
const compra = (tipo: 'reparacion' | 'mejora' | 'mobiliario' | null, importe = 10000, propertyId = 'D') =>
  ({ id: 'c', descripcion: 'x', importe, propertyId, tipo, fecha: '2026-12-01' })
test('mejora de 10.000€ en diciembre: la base 2026 baja < 0,3 % del importe', () => {
  const e = entrada()
  const sin = declarar(e, SIN_PALANCAS, 'individual').contribuyentes[0].baseLiquidable!
  const con = declarar(e, { ...SIN_PALANCAS, compras: [compra('mejora')] }, 'individual').contribuyentes[0].baseLiquidable!
  assert.ok(sin - con < 30, `bajó ${sin - con}`)
})
test('reparación de 10.000€ en diciembre: la base 2026 baja el importe íntegro', () => {
  const e = entrada()
  const sin = declarar(e, SIN_PALANCAS, 'individual').contribuyentes[0].baseLiquidable!
  const con = declarar(e, { ...SIN_PALANCAS, compras: [compra('reparacion')] }, 'individual').contribuyentes[0].baseLiquidable!
  cerca(sin - con, 10000)
})
test('mobiliario en diciembre: 10 % × días restantes / 365', () => {
  cerca(fraccionDeducible(compra('mobiliario'), 2026), (0.1 * 31) / 365, 1e-9)
})
test('reparación: límite intereses + reparación ≤ ingresos íntegros del inmueble', () => {
  const e = entrada({ periodo: periodo({ brutoD: 5000, gastosD: 4000 }) })
  const sin = declarar(e, SIN_PALANCAS, 'individual').contribuyentes[0].baseLiquidable!
  const con = declarar(e, { ...SIN_PALANCAS, compras: [compra('reparacion', 3000)] }, 'individual').contribuyentes[0].baseLiquidable!
  cerca(sin - con, 1000)
})
test('reparación sin dato de intereses del piso → efecto null, no gasto íntegro', () => {
  const e = entrada({ intereses: {} })
  const a = declarar(e, { ...SIN_PALANCAS, compras: [compra('reparacion')] }, 'individual').contribuyentes[0]
  assert.equal(a.baseLiquidable, null)
})
test('compra sin clasificar (tipo null) no cuenta', () => {
  const e = entrada()
  const sin = declarar(e, SIN_PALANCAS, 'individual').contribuyentes[0].baseLiquidable
  const con = declarar(e, { ...SIN_PALANCAS, compras: [compra(null)] }, 'individual').contribuyentes[0].baseLiquidable
  assert.equal(con, sin)
})
test('mismo marginal en 2026 y 2027: adelantar una reparación casi no gana nada', () => {
  const r = simularEscenario(entrada(), { ...SIN_PALANCAS, compras: [compra('reparacion', 1000)] })
  assert.ok(Math.abs(r.compras[0].ventajaAdelantar!) < 1, `ventaja ${r.compras[0].ventajaAdelantar}`)
})

// ── NULL y coherencia ───────────────────────────────────────────────────────────────────────
test('retenciones sin dato → cuota diferencial null', () => {
  const r = declarar(entrada({ retenciones: { alberto: null, pilar: 300 } }), SIN_PALANCAS, 'individual')
  assert.equal(r.cuotaDiferencial, null)
})
test('correduría sin dato → base, cuota y distancia de Alberto null', () => {
  const a = declarar(entrada({ periodo: periodo({ corr: null }) }), SIN_PALANCAS, 'individual').contribuyentes[0]
  assert.deepEqual([a.baseLiquidable, a.cuota, a.distanciaUmbral], [null, null, null])
})
test('conjunta e individual usan la MISMA base total', () => {
  const e = entrada()
  const cj = declarar(e, SIN_PALANCAS, 'conjunta').contribuyentes[0]
  const ind = declarar(e, SIN_PALANCAS, 'individual').contribuyentes
  cerca(cj.baseImponible, ind[0].baseImponible! + ind[1].baseImponible!)
})
test('Bustos a nombre de Pilar: Alberto baja exactamente la base de Bustos', () => {
  const r = simularEscenario(entrada(), SIN_PALANCAS)
  const a0 = r.individual.contribuyentes[0].baseImponible!, a1 = r.bustosPilar!.individual.contribuyentes[0].baseImponible!
  cerca(a0 - a1, 21000)
})
