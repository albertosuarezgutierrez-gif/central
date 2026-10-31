// Runner: `node --test lib/base-fiscal-devengo.test.ts` (type-stripping). Puro: sin BD.
import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  AMORTIZACION_INMUEBLES, avisosDatos, calcularCostesUnitarios, calcularPeriodo, compararConjuntaIndividual, costeReserva, diasOcupados,
  estimarCierre, periodoCierre, type CostesUnitarios, type EntradaBase, type PropiedadFiscal,
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

const COSTES: CostesUnitarios = {
  limpiezaPorEstancia: { S: 100, R: null }, lavanderiaPorEstancia: { S: 20, R: null },
  luzMes: { S: 50, R: null }, aguaMes: { S: null, R: null }, fijosMes: { S: 30, R: 0 }, comisionBooking: 0.2,
}
const ESTANCIAS_ESC = (): Partial<EntradaBase> => ({
  costes: COSTES,
  ingresos: [
    { propertyId: 'S', checkIn: '2026-03-01', checkOut: '2026-03-11', bruto: 1000, neto: 800, portal: 'BOOKING' },
    { propertyId: 'S', checkIn: '2026-11-10', checkOut: '2026-11-20', bruto: 2000, neto: 1600, portal: 'BOOKING' }, // futura: 10 días
    { propertyId: 'S', checkIn: '2026-12-01', checkOut: '2026-12-06', bruto: 1000, neto: 1000, portal: 'AIRBNB' }, // sin comisión registrada
  ],
  referencia: [
    { propertyId: 'S', checkIn: '2025-11-02', checkOut: '2025-11-04', bruto: 500, neto: 400, portal: 'BOOKING' },
    { propertyId: 'S', checkIn: '2025-11-10', checkOut: '2025-11-12', bruto: 500, neto: 400, portal: 'BOOKING' },
    { propertyId: 'S', checkIn: '2025-12-01', checkOut: '2025-12-03', bruto: 500, neto: 400, portal: 'BOOKING' },
    { propertyId: 'S', checkIn: '2025-12-10', checkOut: '2025-12-12', bruto: 500, neto: 400, portal: 'BOOKING' },
  ],
  gastosCompartidos: [{ mes: '2026-05', importe: 900, categoria: 'LAVANDERIA' }], // la lavandería no se promedia como compartido
})

test('coste por reserva: comisión real, Booking por defecto, resto null; unidades faltantes null', () => {
  const r = (portal: string | null, neto: number, id = 'S') => costeReserva({ propertyId: id, checkIn: '2026-11-10', checkOut: '2026-11-13', bruto: 1000, neto, portal }, COSTES)
  assert.equal(r('BOOKING', 800).comision, 200) // real
  assert.equal(r('BOOKING', 1000).comision, 200) // Booking sin dato → 20 % por defecto
  assert.equal(r('AIRBNB', 1000).comision, null) // sin dato, no 0
  assert.equal(r(null, 1000).comision, null)
  const c = r('BOOKING', 800)
  assert.equal(c.limpieza, 100); assert.equal(c.lavanderia, 20); assert.equal(c.noches, 3)
  const sinUnit = r('BOOKING', 800, 'R')
  assert.equal(sinUnit.limpieza, null); assert.equal(sinUnit.lavanderia, null)
})

test('escenarios: base, ocupación tipo año anterior y pesimista (−10 %)', () => {
  const e = entrada(ESTANCIAS_ESC())
  const real = calcularPeriodo(e, '2026-01-01', '2026-10-31')
  assert.equal(real.lineas[0].bruto, 1000) // las reservas de nov-dic no están en «hasta hoy»
  const est = estimarCierre(e, real)
  cerca(est.mesesRestantes, 2.0, 0.05)
  const [base, ocu, pes] = est.escenarios
  assert.deepEqual(est.escenarios.map(x => x.id), ['base', 'ocupacion', 'pesimista'])
  // base: 2 reservas, 3000 brutos, comisión 400 + null (Airbnb) → 400 conocida, 1 reserva sin dato (1000 brutos)
  const s = base.desglose.find(d => d.propertyId === 'S')!
  cerca(s.reservas, 2); cerca(s.bruto, 3000); cerca(s.comision, 400)
  cerca(s.limpieza, 200); cerca(s.lavanderia, 40)
  cerca(s.luz, 100, 1); cerca(s.fijos, 60, 1); assert.equal(s.agua, null) // × mesesRestantes (≈2,0)
  cerca(s.compartidos, 0) // sin compartidos distintos de lavandería
  cerca(s.amortizacion, 3650 * 15 / 365) // 10 + 5 días = 150
  cerca(s.neto, 3000 - 400 - 200 - 40 - 100 - 60 - 150, 2)
  const sd = base.sinDato.filter(d => d.propertyId === 'S')
  assert.ok(sd.some(d => d.concepto === 'agua'))
  const com = sd.find(d => d.concepto === 'comision')!
  assert.equal(com.reservas, 1); cerca(com.bruto!, 1000)
  // ocupación: 2025 tuvo 4 estancias, hay 2 hechas → +2 (mitad de la referencia: 2 estancias × 500 brutos, 100 comisión cada una)
  const so = ocu.desglose.find(d => d.propertyId === 'S')!
  cerca(so.reservas, 4); cerca(so.bruto, 3000 + 1000); cerca(so.comision, 400 + 200)
  cerca(so.limpieza, 400); cerca(so.lavanderia, 80)
  cerca(so.amortizacion, 3650 * (15 + 4) / 365) // +2 estancias de 2 días
  assert.ok(ocu.baseGeneral !== base.baseGeneral)
  // pesimista: reservas, bruto y costes variables × 0,9; fijos (luz, fijos) NO escalan
  const sp = pes.desglose.find(d => d.propertyId === 'S')!
  cerca(sp.reservas, 1.8); cerca(sp.bruto, 2700); cerca(sp.comision, 360); cerca(sp.limpieza, 180)
  cerca(sp.luz, 100, 1); cerca(sp.fijos, 60, 1); cerca(sp.luz!, s.luz!, 1e-9) // fijos: no escalan
  cerca(sp.amortizacion, 135)
  assert.equal(base.bloques.actividad_correduria.estimado, null)
  const cierre = periodoCierre(real, base, 2026)
  cerca(cierre.baseGeneral, base.baseGeneral)
})

test('null que se propaga: sin coste unitario el piso queda «sin dato», no 0; mezcla de nulls solo contamina lo que usa', () => {
  const e = entrada({
    hoy: '2026-10-31', costes: COSTES,
    ingresos: [{ propertyId: 'R', checkIn: '2026-11-10', checkOut: '2026-11-13', bruto: 600, neto: 480, portal: 'BOOKING' }],
  })
  const est = estimarCierre(e, calcularPeriodo(e, '2026-01-01', '2026-10-31'))
  const r = est.escenarios[0].desglose.find(d => d.propertyId === 'R')!
  cerca(r.comision, 120)
  assert.equal(r.limpieza, null); assert.equal(r.lavanderia, null); assert.equal(r.luz, null)
  cerca(r.fijos, 0) // 0 = revisado, sin plantillas
  // Socorro sin reservas: sus costes de reserva son 0 (nada que costear), no null
  const s = est.escenarios[0].desglose.find(d => d.propertyId === 'S')!
  assert.equal(s.limpieza, 0)
  // agregado: limpieza total es null solo si NINGÚN piso tiene dato; aquí Socorro aporta 0
  assert.equal(est.escenarios[0].futuro.limpieza, 0)
  assert.ok(est.escenarios[0].sinDato.some(d => d.propertyId === 'R' && d.concepto === 'limpieza'))
  assert.ok(est.escenarios[0].sinDato.some(d => d.propertyId === 'R' && d.concepto === 'agua'))
  // sin costes en la entrada: todo sin dato
  const e2 = entrada({ ingresos: e.ingresos })
  const r2 = estimarCierre(e2, calcularPeriodo(e2, '2026-01-01', '2026-10-31')).escenarios[0].desglose.find(d => d.propertyId === 'R')!
  assert.equal(r2.limpieza, null); assert.equal(r2.luz, null)
})

test('costes unitarios: limpieza tarifa habitual con IVA, lavandería por huéspedes, luz/agua en ventana', () => {
  const est = (id: string, co: string, h: number | null) => ({ propertyId: id, checkIn: co, checkOut: co, bruto: 1, neto: 1, huespedes: h })
  const c = calcularCostesUnitarios({
    anio: 2026, hoy: '2026-10-31', propiedadIds: ['S', 'R', 'X'],
    limpieza: [
      { propertyId: 'S', sesiones: 4, importe: 360, factor: 1.21 },  // 90/sesión
      { propertyId: 'S', sesiones: 1, importe: 32.99, factor: 1.21 }, // puntual: se ignora
      { propertyId: 'R', sesiones: 3, importe: 60, factor: 1.21 },
    ],
    lavanderia: [{ mes: '2026-03', importe: 100 }],
    estancias: [est('S', '2026-02-05', 8), est('S', '2026-02-09', 8), est('R', '2026-03-03', 2), est('R', '2026-03-04', 2), est('X', '2026-03-05', null)],
    suministros: [
      { propertyId: 'S', mes: '2026-01', importe: 999, tipo: 'luz' }, // fuera de ventana (feb–oct)
      { propertyId: 'S', mes: '2026-02', importe: 90, tipo: 'luz' },
      { propertyId: 'S', mes: '2026-04', importe: 90, tipo: 'luz' },
      { propertyId: 'S', mes: '2026-03', importe: 60, tipo: 'agua' },
      { propertyId: 'S', mes: '2026-05', importe: 80, tipo: 'agua' },
    ],
    fijos: [{ propertyId: 'S', total: 40 }, { propertyId: 'S', total: 10.5 }],
  })
  cerca(c.limpiezaPorEstancia.S, 108.9); cerca(c.limpiezaPorEstancia.R, 24.2); assert.equal(c.limpiezaPorEstancia.X, null)
  // 100 € / 5 estancias = 20; huéspedes medios: cartera (8+8+2+2)/4 = 5 (X sin dato no cuenta)
  cerca(c.lavanderiaPorEstancia.S, 20 * 8 / 5); cerca(c.lavanderiaPorEstancia.R, 20 * 2 / 5); assert.equal(c.lavanderiaPorEstancia.X, null)
  cerca(c.luzMes.S, 180 / 9); assert.equal(c.luzMes.R, null)
  cerca(c.aguaMes.S, 70 / 2); assert.equal(c.aguaMes.R, null) // media por cargo bimestral
  cerca(c.fijosMes.S, 50.5); cerca(c.fijosMes.R, 0)
  // sin facturas de lavandería → sin dato
  const c2 = calcularCostesUnitarios({ anio: 2026, hoy: '2026-10-31', propiedadIds: ['S'], limpieza: [], lavanderia: [], estancias: [], suministros: [], fijos: [] })
  assert.equal(c2.lavanderiaPorEstancia.S, null); assert.equal(c2.limpiezaPorEstancia.S, null)
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
