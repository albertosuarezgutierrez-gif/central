// Runner: `node --test lib/base-fiscal-devengo.test.ts` (type-stripping). Puro: sin BD.
import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  AMORTIZACION_INMUEBLES, avisosDatos, calcularPeriodo, compararConjuntaIndividual, diasOcupados,
  estimarCierre, periodoCierre, type EntradaBase, type PropiedadFiscal,
} from './base-fiscal-devengo.ts'
import { importesDe } from './fiscal-deducciones.ts'

const cerca = (a: number | null, b: number, tol = 0.02) => {
  assert.ok(a != null && Math.abs(a - b) <= tol, `${a} ≉ ${b}`)
}

const PROPS: PropiedadFiscal[] = [
  { id: 'S', nombre: 'Socorro', bloque: 'capital_inmobiliario', titulares: [{ titular: 'alberto', porcentaje: 50 }, { titular: 'pilar', porcentaje: 50 }] },
  { id: 'R', nombre: 'Bustos', bloque: 'capital_mobiliario', titulares: [{ titular: 'alberto', porcentaje: 100 }] },
]
const vacio = { ingresosPorMes: {}, gastosPorMes: {} }
function entrada(p: Partial<EntradaBase> = {}): EntradaBase {
  return {
    anio: 2026, hoy: '2026-10-31', propiedades: PROPS, ingresos: [], gastosPiso: [], gastosCompartidos: [],
    correduria: vacio, pilar: vacio, amortizacion: { S: { anual: 3650 } }, ...p,
  }
}

test('amortización: días distintos con reserva, recortando estancias que cruzan el límite', () => {
  const ing = [
    { propertyId: 'S', checkIn: '2026-10-28', checkOut: '2026-11-02', bruto: 500, neto: 400 }, // 28-31 oct = 4 días dentro
    { propertyId: 'S', checkIn: '2026-10-30', checkOut: '2026-11-01', bruto: 100, neto: 80 },   // solapa: no duplica
  ]
  assert.equal(diasOcupados(ing, 'S', '2026-01-01', '2026-10-31').size, 4)
  const p = calcularPeriodo(entrada({ ingresos: ing }), '2026-01-01', '2026-10-31')
  cerca(p.lineas[0].amortizacion, 3650 * 4 / 365) // 40
  assert.equal(p.lineas[0].dias, 4)
})

test('días: 1/1 y 31/10 incluidos, check-out excluido, estancia previa al año recortada', () => {
  const ing = [
    { propertyId: 'S', checkIn: '2025-12-26', checkOut: '2026-01-04', bruto: 1, neto: 1 }, // 1,2,3 ene = 3
    { propertyId: 'S', checkIn: '2026-10-30', checkOut: '2026-11-02', bruto: 1, neto: 1 }, // 30,31 oct = 2
  ]
  const d = diasOcupados(ing, 'S', '2026-01-01', '2026-10-31')
  assert.equal(d.size, 5)
  assert.ok(d.has('2026-01-01') && d.has('2026-10-31') && !d.has('2026-01-04') && !d.has('2026-11-01'))
})

test('porMes: la suma de los meses cuadra con el periodo (estancia que cruza de mes + compartidos)', () => {
  const e = entrada({
    ingresos: [{ propertyId: 'S', checkIn: '2026-03-28', checkOut: '2026-04-05', bruto: 800, neto: 800 }],
    gastosCompartidos: [{ mes: '2026-05', importe: 90 }],
  })
  const p = calcularPeriodo(e, '2026-01-01', '2026-10-31')
  const totalMeses = p.porMes.reduce((s, m) => s + (m.porBloque.capital_inmobiliario ?? 0), 0)
  cerca(totalMeses, p.bloques.capital_inmobiliario as number)
})

test('subarriendo (capital mobiliario) no amortiza: null, no 0', () => {
  const p = calcularPeriodo(entrada({ ingresos: [{ propertyId: 'R', checkIn: '2026-03-01', checkOut: '2026-03-03', bruto: 200, neto: 160 }] }), '2026-01-01', '2026-10-31')
  assert.equal(p.lineas.find(l => l.propertyId === 'R')!.amortizacion, null)
})

test('bruto − comisión − gastos (mobiliario íntegro) − compartidos repartidos por bruto − amortización', () => {
  const e = entrada({
    ingresos: [
      { propertyId: 'S', checkIn: '2026-02-01', checkOut: '2026-02-11', bruto: 3000, neto: 2400 },
      { propertyId: 'R', checkIn: '2026-02-01', checkOut: '2026-02-04', bruto: 1000, neto: 800 },
    ],
    gastosPiso: [
      { propertyId: 'S', mes: '2026-02', importe: 100, categoria: 'SUMINISTROS' },
      { propertyId: 'S', mes: '2026-10', importe: 1749, categoria: 'MOBILIARIO' },
    ],
    gastosCompartidos: [{ mes: '2026-03', importe: 400 }],
  })
  const p = calcularPeriodo(e, '2026-01-01', '2026-10-31')
  const s = p.lineas.find(l => l.propertyId === 'S')!
  cerca(s.compartidos, 300) // 3000/4000 × 400
  cerca(s.mobiliario, 1749)
  cerca(s.amortizacion, 100) // 10 días × 3650/365
  cerca(s.neto, 3000 - 600 - 1849 - 300 - 100)
  const r = p.lineas.find(l => l.propertyId === 'R')!
  cerca(r.neto, 1000 - 200 - 100)
  cerca(p.bloques.capital_inmobiliario, s.neto)
  cerca(p.bloques.capital_mobiliario, r.neto)
})

test('correduría: bruto = cobrado/0,85, retención 15 %; sin datos → null (no 0)', () => {
  const e = entrada({ correduria: { ingresosPorMes: { '2026-03': 850 }, gastosPorMes: { '2026-03': 300 } } })
  const p = calcularPeriodo(e, '2026-01-01', '2026-10-31')
  cerca(p.correduria.bruto, 1000); cerca(p.correduria.retencion, 150); cerca(p.correduria.neto, 700)
  assert.equal(p.pilar.neto, null)
  assert.equal(p.bloques.actividad_pilar, null)
  const m = p.porMes.find(x => x.mes === '2026-04')!
  assert.equal(m.total, null) // mes sin ningún dato
  assert.equal(m.porBloque.actividad_correduria, null)
})

test('comparativa: individual más barata cuando conjunta pasa de 60.000€; distancia al umbral', () => {
  const imp = importesDe(2026)
  const e = entrada({
    ingresos: [
      { propertyId: 'S', checkIn: '2026-02-01', checkOut: '2026-02-02', bruto: 90000, neto: 90000 },
      { propertyId: 'R', checkIn: '2026-02-01', checkOut: '2026-02-02', bruto: 10000, neto: 10000 },
    ],
    amortizacion: {},
  })
  const p = calcularPeriodo(e, '2026-01-01', '2026-10-31')
  const c = compararConjuntaIndividual(p, PROPS, { tramos: imp.tramos, minimoConjunta: 20250, minimoContribuyente: 5550 })
  cerca(c.conjunta.baseLiquidable, 100000 - 3400)
  cerca(c.distanciaUmbralConjunta, 60000 - 96600)
  cerca(c.excesoSobreUmbralConjunta, 36600)
  // Alberto: 45.000 + 10.000 = 55.000; Pilar 45.000 → ambos < 60.000
  cerca(c.individual.alberto.base, 55000); cerca(c.individual.pilar.base, 45000)
  assert.equal(c.masBarata, 'individual')
  assert.ok(c.ahorro > 0)
})

test('estimación: reservas futuras + gasto medio de meses completos, parte estimada marcada', () => {
  const e = entrada({
    hoy: '2026-10-31',
    ingresos: [
      { propertyId: 'S', checkIn: '2026-03-01', checkOut: '2026-03-11', bruto: 1000, neto: 800 },
      { propertyId: 'S', checkIn: '2026-11-10', checkOut: '2026-11-20', bruto: 2000, neto: 1600 }, // futura: 10 días
    ],
    gastosPiso: [
      { propertyId: 'S', mes: '2026-03', importe: 100, categoria: 'SUMINISTROS' },
      { propertyId: 'S', mes: '2026-04', importe: 300, categoria: 'SUMINISTROS' }, // media 200/mes
      { propertyId: 'S', mes: '2026-10', importe: 1749, categoria: 'MOBILIARIO' }, // puntual: no promedia
    ],
  })
  const real = calcularPeriodo(e, '2026-01-01', '2026-10-31')
  assert.equal(real.lineas[0].bruto, 1000) // la reserva de noviembre no está en «hasta hoy»
  const est = estimarCierre(e, real)
  cerca(est.mesesRestantes, 2.0, 0.05)
  cerca(est.futuro.bruto, 2000); cerca(est.futuro.comision, 400)
  cerca(est.futuro.amortizacion, 3650 * 10 / 365) // 100
  // estimado inmobiliario = 2000 − 400 − 100 − 200 × 2 meses
  cerca(est.bloques.capital_inmobiliario.estimado, 1100, 15)
  assert.equal(est.bloques.actividad_correduria.estimado, null)
  const cierre = periodoCierre(real, est, 2026)
  cerca(cierre.baseGeneral, est.baseGeneral)
  cerca(est.baseGeneral, (real.bloques.capital_inmobiliario ?? 0) + (est.bloques.capital_inmobiliario.estimado ?? 0) + (real.bloques.capital_mobiliario ?? 0) + (est.bloques.capital_mobiliario.estimado ?? 0))
})

test('avisos: cuentas con último movimiento > 30 días y meses sin facturas', () => {
  const a = avisosDatos({
    hoy: '2026-10-31', anio: 2026,
    cuentas: [
      { nombre: 'BBVA', ultimoMovimiento: '2026-10-30' },
      { nombre: 'Tarjeta Kutxabank', ultimoMovimiento: '2026-07-31' },
      { nombre: 'Vacía', ultimoMovimiento: null },
    ],
    mesesConFacturaLimpieza: ['2026-01', '2026-02'],
    mesesConSuministros: ['2026-01'],
  })
  assert.deepEqual(a.cuentasSinActualizar.map(c => c.nombre), ['Tarjeta Kutxabank', 'Vacía'])
  assert.equal(a.cuentasSinActualizar[0].dias, 92)
  assert.equal(a.cuentasSinActualizar[1].dias, null)
  assert.equal(a.mesesSinLimpieza.length, 8)
  assert.equal(a.mesesSinSuministros.length, 9)
})

test('parámetros de amortización: Socorro ≈ 6.804,55€/año, Dúplex 1.914,00€/año', () => {
  cerca(AMORTIZACION_INMUEBLES.prop_house_sevillana.anual, 6804.55, 0.05)
  cerca(AMORTIZACION_INMUEBLES.prop_duplex_center.anual, 1914.0, 0.01)
})
