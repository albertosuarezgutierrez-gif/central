/**
 * N1: pagas extra, embargos (art. 607 LEC), atrasos, integración del IRPF en el motor y TEST DE PROPIEDAD
 * (neto = devengos − deducciones · suma de conceptos = total). Importes en CÉNTIMOS; cálculos a mano en cada caso.
 */
import { describe, it, expect } from 'vitest'
import { calcularNominaCentimos, type EntradaNomina } from './motor'
import { CifraPendienteError } from './cifras'
import { calendarioPagas, retribucionAnualPrevisible } from './pagas'
import { calcularEmbargo, embargoDeNomina } from './embargo'
import { procesarAtrasos } from './atrasos'
import { tablaIrpfDePrueba } from './irpf-prueba'
import type { SituacionFamiliar } from './situacion-familiar'

const T = tablaIrpfDePrueba()
const sf = (p: Partial<SituacionFamiliar> = {}): SituacionFamiliar => ({
  vigenteDesde: '2026-01-01', vigenteHasta: null, situacion: 3, fechaNacimientoContribuyente: '1990-05-10',
  discapacidad: 'ninguna', descendientes: [], ascendientes: [], ...p,
})
const entrada = (p: Partial<EntradaNomina>): EntradaNomina => ({
  periodo: '2026-04', grupo: 1, duracion: 'indefinido', jornadaPct: 100, salarioBase: 0, complementosFijos: [],
  pagas: 12, prorrataExtras: false, irpfPct: 15, atEp: 15_000, incidencias: [], ...p,
})

describe('pagas extra', () => {
  it('14 pagas sin prorrata: 2 extras en sus meses (junio y diciembre por defecto)', () => {
    const c = calendarioPagas({ salarioEf: 200_000, pagas: 14, prorrataExtras: false })
    expect(c.meses.filter(m => m.pagaExtra > 0).map(m => m.mes)).toEqual([6, 12])
    expect(c.totalExtras).toBe(400_000)
    expect(c.ajusteRedondeo).toBe(0)
  })
  it('14 pagas prorrateadas: 12 × round(2 × 2.000 / 12 = 333,33) = 3.999,96 → ajuste de 4 céntimos', () => {
    const c = calendarioPagas({ salarioEf: 200_000, pagas: 14, prorrataExtras: true })
    expect(c.meses.every(m => m.prorrata === 33_333 && m.pagaExtra === 0)).toBe(true)
    expect(c.totalExtras).toBe(399_996)
    expect(c.ajusteRedondeo).toBe(4)
  })
  it('12 pagas: sin extras; meses de paga extra inválidos o repetidos → error', () => {
    expect(calendarioPagas({ salarioEf: 150_000, pagas: 12, prorrataExtras: false }).totalExtras).toBe(0)
    expect(() => calendarioPagas({ salarioEf: 1, pagas: 14, prorrataExtras: false, mesesPagaExtra: [6, 6] })).toThrow()
    expect(() => calendarioPagas({ salarioEf: 1, pagas: 14, prorrataExtras: false, mesesPagaExtra: [6, 13] })).toThrow()
  })
  it('retribución anual previsible: (2.000 + 100) × 12 + 2 × 2.000 = 29.200 €', () => {
    expect(retribucionAnualPrevisible({ salarioEf: 200_000, complementosMensuales: 10_000, pagas: 14 })).toBe(2_920_000)
    expect(retribucionAnualPrevisible({ salarioEf: 200_000, complementosMensuales: 10_000, pagas: 12 })).toBe(2_520_000)
  })
  it('el motor coincide con el calendario (mes con paga extra, mes normal, prorrata)', () => {
    const base = { grupo: 1 as const, salarioBase: 200_000, pagas: 14 as const }
    const jun = calcularNominaCentimos(entrada({ ...base, periodo: '2026-06' }), { modo: 'simulacion' })
    const abr = calcularNominaCentimos(entrada({ ...base, periodo: '2026-04' }), { modo: 'simulacion' })
    const pro = calcularNominaCentimos(entrada({ ...base, prorrataExtras: true }), { modo: 'simulacion' })
    expect(jun.devengos.pagaExtra).toBe(200_000)
    expect(abr.devengos.pagaExtra).toBe(0)
    expect(pro.devengos.prorrataExtras).toBe(33_333)
  })
})

describe('embargo de salario (art. 607 LEC)', () => {
  // SMI 2026: 1.221,00 €/mes en 14 pagas (122.100 c); 17.094 €/año → 1.424,50 €/mes en 12 (142.450 c)
  it('hasta 1 SMI es inembargable', () => {
    expect(calcularEmbargo(122_100, 122_100).embargable).toBe(0)
    expect(calcularEmbargo(100_000, 122_100).embargable).toBe(0)
  })
  it('2.000 € con SMI 1.221: (2.000 − 1.221) × 30 % = 233,70 €', () => {
    expect(calcularEmbargo(200_000, 122_100).embargable).toBe(23_370)
  })
  it('7.000 € con SMI 1.221: 366,30 + 610,50 + 732,60 + 915,75 + (7.000 − 6.105)×90 % (805,50) = 3.430,65 €', () => {
    const r = calcularEmbargo(700_000, 122_100)
    expect(r.embargable).toBe(343_065)
    expect(r.inembargable).toBe(700_000 - 343_065)
  })
  it('nómina de 12 pagas, líquido 3.000 €: SMI/12 = 1.424,50 → 427,35 + (3.000 − 2.849)×50 % (75,50) = 502,85 €', () => {
    const r = embargoDeNomina({ año: 2026, netoOrdinario: 300_000, pagas: 12, prorrataExtras: false, modo: 'calculo' })
    expect(r.ordinaria.embargable).toBe(50_285)
    expect(r.cifrasPendientes).toEqual([])
  })
  it('14 pagas sin prorrata usa el SMI de 14 pagas; con prorrata, SMI/12', () => {
    expect(embargoDeNomina({ año: 2026, netoOrdinario: 200_000, pagas: 14, prorrataExtras: false, modo: 'calculo' }).embargableTotal).toBe(23_370)
    // prorrateadas: (2.000 − 1.424,50) × 30 % = 172,65
    expect(embargoDeNomina({ año: 2026, netoOrdinario: 200_000, pagas: 14, prorrataExtras: true, modo: 'calculo' }).embargableTotal).toBe(17_265)
  })
  it('mes con paga extra: percepción aparte con SMI 14 pagas: (1.500 − 1.221)×30 % + (1.300 − 1.221)×30 % = 83,70 + 23,70 = 107,40 € — regla pendiente: bloquea en cálculo', () => {
    const e = { año: 2026, netoOrdinario: 150_000, netoPagaExtra: 130_000, pagas: 14 as const, prorrataExtras: false }
    const r = embargoDeNomina({ ...e, modo: 'simulacion' })
    expect(r.embargableTotal).toBe(10_740)
    expect(r.cifrasPendientes).toEqual(['regla:embargo_paga_extra'])
    expect(() => embargoDeNomina({ ...e, modo: 'calculo' })).toThrow(CifraPendienteError)
  })
  it('año sin tabla → error; entradas no enteras → error', () => {
    expect(() => embargoDeNomina({ año: 2031, netoOrdinario: 1, pagas: 12, prorrataExtras: false, modo: 'simulacion' })).toThrow()
    expect(() => calcularEmbargo(10.5, 100)).toThrow()
  })
})

describe('atrasos', () => {
  const lineas = [{ concepto: 'Revisión convenio 2025', importe: 100_000, añoDevengo: 2025 }, { concepto: 'Plus enero', importe: 50_000, añoDevengo: 2026 }]
  it('concepto separado: ejercicio anterior al 15 % FIJO (art. 80.1.5.º RIRPF), año en curso al tipo del pagador', () => {
    // tipo del pagador 9 %: 1.000 × 15 % = 150,00 (2025) + 500 × 9 % = 45,00 (2026) → retención 195,00; líquido 1.305,00
    const r = procesarAtrasos(lineas, '2026-03', 90_000, 'simulacion')
    expect(r.total).toBe(150_000)
    expect(r.lineas.map(l => l.retencion)).toEqual([15_000, 4_500])
    expect(r.retencion).toBe(19_500)
    expect(r.neto).toBe(130_500)
    expect(r.lineas.map(l => l.ejercicioAnterior)).toEqual([true, false])
    expect(r.cifrasPendientes).toEqual(['regla:cotizacion_atrasos'])
  })
  it('modo cálculo bloquea; atraso solo del año en curso sigue pendiente de la cotización', () => {
    expect(() => procesarAtrasos(lineas, '2026-03', 150_000, 'calculo')).toThrow(CifraPendienteError)
    expect(procesarAtrasos([lineas[1]], '2026-03', 150_000, 'simulacion').cifrasPendientes).toEqual(['regla:cotizacion_atrasos'])
    expect(procesarAtrasos([], '2026-03', 150_000, 'calculo').cifrasPendientes).toEqual([])
  })
  it('valida año de devengo (no futuro) e importe (céntimos enteros > 0); avisa de posible prescripción', () => {
    expect(() => procesarAtrasos([{ concepto: 'x', importe: 100, añoDevengo: 2027 }], '2026-03', 0, 'simulacion')).toThrow()
    expect(() => procesarAtrasos([{ concepto: 'x', importe: 10.5, añoDevengo: 2025 }], '2026-03', 0, 'simulacion')).toThrow()
    expect(() => procesarAtrasos([{ concepto: 'x', importe: 0, añoDevengo: 2025 }], '2026-03', 0, 'simulacion')).toThrow()
    expect(procesarAtrasos([{ concepto: 'viejo', importe: 100, añoDevengo: 2020 }], '2026-03', 0, 'simulacion').avisos).toEqual(['atraso_posible_prescripcion:viejo'])
  })
})

describe('motor con IRPF por algoritmo', () => {
  it('2.000 € × 14 pagas prorrateadas, soltero: tipo 15,59 % → IRPF 36.377 c', () => {
    // RA = 2.000×12 + 2×2.000 = 28.000 · SS mensual = 109,67 + 36,17 + 2,33 + 3,50 = 151,67 → ×12 = 1.820,04
    // RN = 28.000 − 1.820,04 − 2.000 = 24.179,96 → esc = 4.225,50 + 3.979,96×30 % (1.193,988) = 5.419,49 · cuota = 4.364,99 · /28.000 = 15,589 % → 15,59
    // devengado del mes = 2.000 + 333,33 = 2.333,33 → IRPF = 2.333,33 × 15,59 % = 363,77
    const r = calcularNominaCentimos(
      entrada({ salarioBase: 200_000, pagas: 14, prorrataExtras: true, irpfAlgoritmo: { situacion: sf() } }),
      { modo: 'simulacion', tablaIrpf: T },
    )
    expect(r.devengos.total).toBe(233_333)
    expect(r.irpf?.tipoPpm).toBe(155_900)
    expect(r.irpf?.cotizacionesAnual).toBe(182_004)
    expect(r.trabajador.irpf).toBe(36_377)
    expect(r.neto).toBe(r.devengos.total - r.trabajador.total)
  })
  it('sin irpfAlgoritmo se mantiene el % plano y irpf es null (compatibilidad N0)', () => {
    const r = calcularNominaCentimos(entrada({ salarioBase: 300_000, irpfPct: 15 }), { modo: 'simulacion' })
    expect(r.trabajador.irpf).toBe(45_000)
    expect(r.irpf).toBeNull()
  })
  it('con la tabla IRPF 2026 REAL (verificada en el BOE) el IRPF ya no bloquea el modo cálculo', () => {
    const e = entrada({ salarioBase: 300_000, irpfAlgoritmo: { situacion: sf() } })
    const r = calcularNominaCentimos(e, { modo: 'calculo' })
    expect(r.cifrasPendientes).toEqual([])
    expect(r.irpf?.motivo).toBe('algoritmo')
  })
  it('sin modelo 145: art. 88.2 → mismo tipo que un soltero sin hijos ni circunstancias, sin regla pendiente', () => {
    const sin = calcularNominaCentimos(entrada({ salarioBase: 300_000, irpfAlgoritmo: { situacion: null } }), { modo: 'calculo' })
    const soltero = calcularNominaCentimos(entrada({ salarioBase: 300_000, irpfAlgoritmo: { situacion: sf() } }), { modo: 'calculo' })
    expect(sin.trabajador.irpf).toBe(soltero.trabajador.irpf)
    expect(sin.avisos).toContain('irpf:sin_modelo_145_sin_circunstancias')
    expect(sin.cifrasPendientes).toEqual([])
  })
})

describe('propiedad: neto = devengos − deducciones y suma por conceptos = total', () => {
  // LCG determinista (sin dependencias): mismos casos en cada ejecución.
  let semilla = 20261105
  const rnd = (n: number) => { semilla = (Math.imul(semilla, 1664525) + 1013904223) >>> 0; return semilla % n }
  const pick = <X>(xs: X[]): X => xs[rnd(xs.length)]

  function aleatoria(): EntradaNomina {
    const grupo = pick([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] as const)
    const pagas = pick([12, 14] as const)
    const algoritmo = rnd(3) > 0
    return {
      periodo: `2026-${String(1 + rnd(12)).padStart(2, '0')}`, grupo, duracion: pick(['indefinido', 'temporal'] as const),
      jornadaPct: pick([100, 100, 75, 50, 20]), salarioBase: 100_000 + rnd(900_000),
      complementosFijos: rnd(2) ? [{ concepto: 'Plus transporte', importe: rnd(30_000) }] : [],
      pagas, prorrataExtras: rnd(2) === 1, irpfPct: rnd(30), atEp: pick([null, 15_000, 36_700]),
      incidencias: [
        ...(rnd(3) === 0 ? [{ tipo: 'horas_extra' as const, concepto: 'HE', horas: rnd(20) }] : []),
        ...(rnd(3) === 0 ? [{ tipo: 'plus_puntual' as const, concepto: 'Plus', importe: rnd(20_000) }] : []),
        ...(rnd(4) === 0 ? [{ tipo: 'ausencia_injustificada' as const, concepto: 'Aus', dias: rnd(4) }] : []),
        ...(rnd(5) === 0 ? [{ tipo: 'descuento' as const, concepto: 'Desc', importe: rnd(10_000) }] : []),
      ],
      irpfAlgoritmo: algoritmo
        ? { situacion: rnd(5) === 0 ? null : sf({ situacion: pick([1, 2, 3] as const), descendientes: Array.from({ length: rnd(4) }, (_, i) => ({ fechaNacimiento: `${2010 + i * 3}-01-01`, discapacidad: 'ninguna' as const, porEntero: rnd(2) === 1 })) }), duracionInferiorAño: rnd(4) === 0 }
        : undefined,
    }
  }

  it('600 nóminas aleatorias cumplen las identidades contables y solo producen céntimos enteros', () => {
    for (let i = 0; i < 600; i++) {
      const e = aleatoria()
      const r = calcularNominaCentimos(e, { modo: 'simulacion', tablaIrpf: T })
      const ctx = JSON.stringify(e)
      const d = r.devengos
      // suma por conceptos = total devengado
      const conceptos = d.salarioBase + d.complementosFijos.reduce((s, c) => s + c.importe, 0) + d.prorrataExtras + d.pagaExtra + d.horasExtra + d.pluses.reduce((s, c) => s + c.importe, 0) - d.descuentos
      expect(conceptos, ctx).toBe(d.total)
      // deducciones del trabajador = suma de sus líneas; neto = devengos − deducciones
      const t = r.trabajador
      expect(t.contingenciasComunes + t.desempleo + t.fp + t.mei + t.solidaridad + t.irpf, ctx).toBe(t.total)
      expect(r.neto, ctx).toBe(d.total - t.total)
      // cuota de empresa = suma de líneas; coste = devengos + cuota
      const em = r.empresa
      expect(em.contingenciasComunes + em.desempleo + em.fogasa + em.fp + em.atEp + em.mei + em.solidaridad, ctx).toBe(em.total)
      expect(r.costeEmpresa, ctx).toBe(d.total + em.total)
      // IRPF: nunca negativo ni mayor que el devengado; todo entero
      expect(t.irpf, ctx).toBeGreaterThanOrEqual(0)
      expect(t.irpf, ctx).toBeLessThanOrEqual(Math.max(0, d.total))
      for (const v of [d.total, t.total, t.irpf, r.neto, r.costeEmpresa, em.total, r.bases.contingenciasComunes]) expect(Number.isSafeInteger(v), ctx).toBe(true)
    }
  })
})
