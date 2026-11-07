/**
 * 15 nóminas de referencia (2026) calculadas A MANO — no con el motor. Fórmula (ver cabecera de motor.ts):
 *   cuota(base, tipo) = round(base × tipo)  · un redondeo por línea, medio céntimo hacia arriba
 *   CC trab 4,70 · desempleo trab 1,55 (indef.) / 1,60 (temp.) · FP trab 0,10 · MEI trab 0,15 (sobre base CC)
 *   CC emp 23,60 · desempleo emp 5,50 / 6,70 · FOGASA 0,20 · FP emp 0,60 · AT/EP 1,50 · MEI emp 0,75
 *   Bases 2026: máx 5.101,20 €/mes (170,04 €/día) · mín. grupo 1 1.989,30 · grupos 4-7 1.424,40 · 8-11 47,48 €/día
 *   Solidaridad: tramo 1 (exceso ≤ 510,12 €) 1,15 % · tramo 2 (≤ 2.550,60 €) 1,25 % · tramo 3 1,46 %;
 *   parte trabajador = round(total × 4,70 / 28,30)
 * Todos los importes en CÉNTIMOS. Contrastado además con una implementación independiente en Python (Decimal).
 * Pendientes 2026 siempre presentes: mei_empresa, mei_trabajador (reparto sin verificar).
 */
import { describe, it, expect } from 'vitest'
import { calcularNominaCentimos, type EntradaNomina } from './motor'
import { CifraDesconocidaError, CifraPendienteError, TablaNoDisponibleError } from './cifras'
import { TABLA_2026 } from './tablas'
import type { TablaAnual } from './tablas'

const MEI: string[] = [] // MEI 0,75/0,15 verificado (Orden PJC/297/2026 art. 16): ya no queda pendiente
const G47: string[] = [] // grupos 4-7 1.424,40 verificado (art. 3)

function entrada(p: Partial<EntradaNomina>): EntradaNomina {
  return {
    periodo: '2026-04', grupo: 1, duracion: 'indefinido', jornadaPct: 100, salarioBase: 0,
    complementosFijos: [], pagas: 12, prorrataExtras: false, irpfPct: 15, atEp: 15_000, incidencias: [], ...p,
  }
}

type Esperado = {
  total: number; baseCC: number; baseCP: number; exceso: number
  T: [cc: number, des: number, fp: number, mei: number, sol: number, irpf: number, total: number]
  E: [cc: number, des: number, fogasa: number, fp: number, atep: number, mei: number, sol: number, total: number]
  neto: number; coste: number; pendientes: string[]
}

const CASOS: { n: string; e: Partial<EntradaNomina>; x: Esperado }[] = [
  { n: '01 · grupo 1 indefinido 12 pagas 3.000 € (dentro de bases)',
    // CC 300000×4,70%=14100 · des 300000×1,55%=4650 · FP 300 · MEI 450 · IRPF 15% 45000
    e: { grupo: 1, salarioBase: 300_000, irpfPct: 15 },
    x: { total: 300_000, baseCC: 300_000, baseCP: 300_000, exceso: 0, T: [14_100, 4_650, 300, 450, 0, 45_000, 64_500],
      E: [70_800, 16_500, 600, 1_800, 4_500, 2_250, 0, 96_450], neto: 235_500, coste: 396_450, pendientes: MEI } },
  { n: '02 · grupo 1 por debajo del mínimo → base CC mínima 1.989,30; la base CP solo tiene el tope mínimo 1.424,40 (arts. 1.2 y 2.2)',
    // CC 198930×4,70%=9349,71→9350 · MEI 298,395→298 (sobre CC) · des 150000×1,55%=2325 · FP 150 · IRPF 2% de 150000 = 3000
    // empresa: CC 46947 · des 8250 · FOGASA 300 · FP 900 · AT 2250 · MEI 198930×0,75%=1491,975→1492
    e: { grupo: 1, salarioBase: 150_000, irpfPct: 2 },
    x: { total: 150_000, baseCC: 198_930, baseCP: 150_000, exceso: 0, T: [9_350, 2_325, 150, 298, 0, 3_000, 15_123],
      E: [46_947, 8_250, 300, 900, 2_250, 1_492, 0, 60_139], neto: 134_877, coste: 210_139, pendientes: MEI } },
  { n: '03 · grupo 7 indefinido 1.800 €',
    e: { grupo: 7, salarioBase: 180_000, irpfPct: 10 },
    x: { total: 180_000, baseCC: 180_000, baseCP: 180_000, exceso: 0, T: [8_460, 2_790, 180, 270, 0, 18_000, 29_700],
      E: [42_480, 9_900, 360, 1_080, 2_700, 1_350, 0, 57_870], neto: 150_300, coste: 237_870, pendientes: [...G47, ...MEI] } },
  { n: '04 · grupo 4 TEMPORAL 2.000 € (desempleo 1,60 / 6,70)',
    e: { grupo: 4, duracion: 'temporal', salarioBase: 200_000, irpfPct: 12 },
    x: { total: 200_000, baseCC: 200_000, baseCP: 200_000, exceso: 0, T: [9_400, 3_200, 200, 300, 0, 24_000, 37_100],
      E: [47_200, 13_400, 400, 1_200, 3_000, 1_500, 0, 66_700], neto: 162_900, coste: 266_700, pendientes: [...G47, ...MEI] } },
  { n: '05 · grupo 5, 14 pagas sin prorratear, marzo (no hay extra): base = 1.500 + prorrata 250',
    // prorrata = 150000×2/12 = 25000 → base 175000 ; devengo 150000 ; IRPF 8% de 150000 = 12000
    e: { grupo: 5, salarioBase: 150_000, pagas: 14, periodo: '2026-03', irpfPct: 8 },
    x: { total: 150_000, baseCC: 175_000, baseCP: 175_000, exceso: 0, T: [8_225, 2_713, 175, 263, 0, 12_000, 23_376],
      E: [41_300, 9_625, 350, 1_050, 2_625, 1_313, 0, 56_263], neto: 126_624, coste: 206_263, pendientes: [...G47, ...MEI] } },
  { n: '06 · mismo contrato en JUNIO: cobra la extra; la base NO cambia (la extra ya va prorrateada en la base)',
    // devengo 300000 (IRPF 8% = 24000) ; base sigue 175000
    e: { grupo: 5, salarioBase: 150_000, pagas: 14, periodo: '2026-06', irpfPct: 8 },
    x: { total: 300_000, baseCC: 175_000, baseCP: 175_000, exceso: 0, T: [8_225, 2_713, 175, 263, 0, 24_000, 35_376],
      E: [41_300, 9_625, 350, 1_050, 2_625, 1_313, 0, 56_263], neto: 264_624, coste: 356_263, pendientes: [...G47, ...MEI] } },
  { n: '07 · grupo 6, 14 pagas PRORRATEADAS: devengo 1.750 = base',
    e: { grupo: 6, salarioBase: 150_000, pagas: 14, prorrataExtras: true, periodo: '2026-03', irpfPct: 8 },
    x: { total: 175_000, baseCC: 175_000, baseCP: 175_000, exceso: 0, T: [8_225, 2_713, 175, 263, 0, 14_000, 25_376],
      E: [41_300, 9_625, 350, 1_050, 2_625, 1_313, 0, 56_263], neto: 149_624, coste: 231_263, pendientes: [...G47, ...MEI] } },
  { n: '08 · grupo 1 6.000 € → base máxima 5.101,20 y solidaridad tramos 1-2 (reparto del art. 17.1 por tramo)',
    // exceso 89880: tramo1 51012 → emp 0,96% 489,7152→490 · trab 0,19% 96,9228→97 ; tramo2 38868 → emp 1,04% 404,2272→404 · trab 0,21% 81,6228→82
    e: { grupo: 1, salarioBase: 600_000, irpfPct: 30 },
    x: { total: 600_000, baseCC: 510_120, baseCP: 510_120, exceso: 89_880, T: [23_976, 7_907, 510, 765, 179, 180_000, 213_337],
      E: [120_388, 28_057, 1_020, 3_061, 7_652, 3_826, 894, 164_898], neto: 386_663, coste: 764_898, pendientes: MEI } },
  { n: '09 · grupo 1 9.000 € → solidaridad los tres tramos',
    // exceso 389880: t1 51012 → 490/97 · t2 204048 → 1,04% 2122,0992→2122 / 0,21% 428,5008→429 · t3 134820 → 1,22% 1644,804→1645 / 0,24% 323,568→324
    e: { grupo: 1, salarioBase: 900_000, irpfPct: 40 },
    x: { total: 900_000, baseCC: 510_120, baseCP: 510_120, exceso: 389_880, T: [23_976, 7_907, 510, 765, 850, 360_000, 394_008],
      E: [120_388, 28_057, 1_020, 3_061, 7_652, 3_826, 4_257, 168_261], neto: 505_992, coste: 1_068_261, pendientes: MEI } },
  { n: '10 · PARCIAL 50 % indefinido grupo 7 (1.800 → 900)',
    e: { grupo: 7, jornadaPct: 50, salarioBase: 180_000, irpfPct: 2 },
    x: { total: 90_000, baseCC: 90_000, baseCP: 90_000, exceso: 0, T: [4_230, 1_395, 90, 135, 0, 1_800, 7_650],
      E: [21_240, 4_950, 180, 540, 1_350, 675, 0, 28_935], neto: 82_350, coste: 118_935,
      pendientes: [...G47, ...MEI, 'regla:base_min_parcial'] } },
  { n: '11 · PARCIAL 50 % temporal por debajo del mínimo proporcional (1.424,40×50% = 712,20)',
    e: { grupo: 7, jornadaPct: 50, duracion: 'temporal', salarioBase: 120_000, irpfPct: 0 },
    x: { total: 60_000, baseCC: 71_220, baseCP: 71_220, exceso: 0, T: [3_347, 1_140, 71, 107, 0, 0, 4_665],
      E: [16_808, 4_772, 142, 427, 1_068, 534, 0, 23_751], neto: 55_335, coste: 83_751,
      pendientes: [...G47, ...MEI, 'regla:base_min_parcial'] } },
  { n: '12 · PARCIAL 62,5 % SIN duración conocida → desempleo provisional a tipo temporal + pendiente',
    e: { grupo: 7, jornadaPct: 62.5, duracion: null, salarioBase: 160_000, irpfPct: 2 },
    x: { total: 100_000, baseCC: 100_000, baseCP: 100_000, exceso: 0, T: [4_700, 1_600, 100, 150, 0, 2_000, 8_550],
      E: [23_600, 6_700, 200, 600, 1_500, 750, 0, 33_350], neto: 91_450, coste: 133_350,
      pendientes: [...G47, ...MEI, 'regla:base_min_parcial', 'regla:duracion_contrato'] } },
  { n: '13 · grupo 8 (DIARIO), febrero 28 días: mínimo 47,48×28 = 1.329,44',
    e: { grupo: 8, periodo: '2026-02', salarioBase: 130_000, irpfPct: 2 },
    x: { total: 130_000, baseCC: 132_944, baseCP: 132_944, exceso: 0, T: [6_248, 2_061, 133, 199, 0, 2_600, 11_241],
      E: [31_375, 7_312, 266, 798, 1_994, 997, 0, 42_742], neto: 118_759, coste: 172_742, pendientes: MEI } },
  { n: '14 · grupo 10 (DIARIO) temporal, julio 31 días: máximo 170,04×31 = 5.271,24 y solidaridad',
    // exceso 72876: t1 52712 → 0,96% 506,0352→506 / 0,19% 100,1528→100 · t2 20164 → 1,04% 209,7056→210 / 0,21% 42,3444→42 → trab 142, emp 716
    e: { grupo: 10, periodo: '2026-07', duracion: 'temporal', salarioBase: 600_000, irpfPct: 30 },
    x: { total: 600_000, baseCC: 527_124, baseCP: 527_124, exceso: 72_876, T: [24_775, 8_434, 527, 791, 142, 180_000, 214_669],
      E: [124_401, 35_317, 1_054, 3_163, 7_907, 3_953, 716, 176_511], neto: 385_331, coste: 776_511,
      pendientes: MEI } },
  { n: '15 · horas extra: fuera de la base CC, dentro de la base CP (desempleo/FP/FOGASA/AT)',
    // 10 h × 2400/160 = 150 € ; base CC 2400 ; base CP 2550
    e: { grupo: 1, salarioBase: 240_000, irpfPct: 15, incidencias: [{ tipo: 'horas_extra', concepto: 'HE', horas: 10 }] },
    x: { total: 255_000, baseCC: 240_000, baseCP: 255_000, exceso: 0, T: [11_280, 3_953, 255, 360, 0, 38_250, 54_098],
      E: [56_640, 14_025, 510, 1_530, 3_825, 1_800, 0, 78_330], neto: 200_902, coste: 333_330,
      pendientes: [...MEI, 'regla:horas_extra_cotizacion_adicional'] } },
]

describe('15 nóminas de referencia 2026 (céntimos, a mano)', () => {
  it('son 15', () => expect(CASOS).toHaveLength(15))
  for (const c of CASOS) {
    it(c.n, () => {
      const r = calcularNominaCentimos(entrada(c.e), { modo: 'simulacion' })
      const { x } = c
      expect(r.devengos.total).toBe(x.total)
      expect(r.bases.contingenciasComunes).toBe(x.baseCC)
      expect(r.bases.contingenciasProfesionales).toBe(x.baseCP)
      expect(r.bases.excesoSolidaridad).toBe(x.exceso)
      const t = r.trabajador
      expect([t.contingenciasComunes, t.desempleo, t.fp, t.mei, t.solidaridad, t.irpf, t.total]).toEqual(x.T)
      const e = r.empresa
      expect([e.contingenciasComunes, e.desempleo, e.fogasa, e.fp, e.atEp, e.mei, e.solidaridad, e.total]).toEqual(x.E)
      expect(r.neto).toBe(x.neto)
      expect(r.costeEmpresa).toBe(x.coste)
      expect(r.cifrasPendientes).toEqual([...x.pendientes].sort())
      // Propiedades: todo entero; neto = devengado − deducciones; coste = devengado + cuota empresa.
      for (const v of [...x.T, ...x.E, r.neto, r.costeEmpresa]) expect(Number.isSafeInteger(v)).toBe(true)
      expect(r.neto + t.total).toBe(r.devengos.total)
    })
  }
})

/** Tabla 2026 con TODO lo pendiente dado por bueno (solo para probar que el modo cálculo funciona cuando se verifica). */
function tablaVerificada(): TablaAnual {
  const t = structuredClone(TABLA_2026)
  const marcar = (o: unknown): void => {
    if (o && typeof o === 'object') {
      const c = o as Record<string, unknown>
      if ('certeza' in c && c.certeza === 'PENDIENTE_VERIFICAR') c.certeza = 'seguro'
      for (const v of Object.values(c)) marcar(v)
    }
  }
  marcar(t)
  return t
}

describe('fail-closed: modo «cálculo»', () => {
  it('2026 tal cual (Orden PJC/297/2026 verificada): un caso ordinario CALCULA sin pendientes', () => {
    const r = calcularNominaCentimos(entrada({ grupo: 7, salarioBase: 180_000, irpfPct: 10 }), { modo: 'calculo' })
    expect(r.cifrasPendientes).toEqual([])
    expect(r.neto).toBe(150_300)
  })
  it('una cifra PENDIENTE sigue bloqueando el modo cálculo (cepo de la mecánica)', () => {
    const t = structuredClone(TABLA_2026)
    t.tipos.mei.trabajador.certeza = 'PENDIENTE_VERIFICAR'
    let err: unknown
    try { calcularNominaCentimos(entrada({ grupo: 7, salarioBase: 180_000 }), { modo: 'calculo', tabla: t }) } catch (e) { err = e }
    expect(err).toBeInstanceOf(CifraPendienteError)
    expect((err as CifraPendienteError).claves).toEqual(['mei_trabajador'])
  })
  it('con la tabla verificada, el mismo caso calcula y coincide con la simulación', () => {
    const t = tablaVerificada()
    const a = calcularNominaCentimos(entrada({ salarioBase: 300_000 }), { modo: 'calculo', tabla: t })
    expect(a.cifrasPendientes).toEqual([])
    expect(a.neto).toBe(235_500)
  })
  it('una REGLA no implementada también bloquea (baja IT, AT/EP desconocido)', () => {
    const t = tablaVerificada()
    const it_ = entrada({ salarioBase: 300_000, incidencias: [{ tipo: 'baja_it', concepto: 'IT', dias: 3 }] })
    expect(() => calcularNominaCentimos(it_, { modo: 'calculo', tabla: t })).toThrow(/regla:it_prestacion/)
    expect(() => calcularNominaCentimos(entrada({ salarioBase: 300_000, atEp: null }), { modo: 'calculo', tabla: t })).toThrow(/regla:at_ep_empresa/)
  })
  it('grupos 2 y 3 de 2026: mínimos 1.649,70 y 1.435,20 (art. 3); la base CP baja hasta el tope mínimo 1.424,40', () => {
    const g2 = calcularNominaCentimos(entrada({ grupo: 2, salarioBase: 160_000 }), { modo: 'calculo' })
    expect([g2.bases.contingenciasComunes, g2.bases.contingenciasProfesionales]).toEqual([164_970, 160_000])
    const g3 = calcularNominaCentimos(entrada({ grupo: 3, salarioBase: 140_000 }), { modo: 'calculo' })
    expect([g3.bases.contingenciasComunes, g3.bases.contingenciasProfesionales]).toEqual([143_520, 142_440])
  })
  it('grupo sin cifra (null) no se calcula ni en simulación', () => {
    const t = structuredClone(TABLA_2026)
    t.basesMensuales[2].min.valor = null
    expect(() => calcularNominaCentimos(entrada({ grupo: 2, salarioBase: 200_000 }), { modo: 'simulacion', tabla: t })).toThrow(CifraDesconocidaError)
  })
  it('año sin tabla: error, nunca la de otro año', () => {
    expect(() => calcularNominaCentimos(entrada({ periodo: '2027-01', salarioBase: 300_000 }), { modo: 'simulacion' })).toThrow(TablaNoDisponibleError)
    expect(() => calcularNominaCentimos(entrada({ periodo: '2027-01' }), { modo: 'simulacion', tabla: TABLA_2026 })).toThrow(/Tabla de 2026/)
  })
})

describe('tiempo parcial con horas trabajadas (Orden PJC/297/2026 arts. 38.3 y 39)', () => {
  it('grupo 7 al 50 %, 80 h: mínimo 80 × 8,58 = 686,40 para CC y CP; sin regla pendiente', () => {
    const r = calcularNominaCentimos(entrada({ grupo: 7, jornadaPct: 50, salarioBase: 120_000, horasTrabajadasMes: 80 }), { modo: 'calculo' })
    expect([r.bases.contingenciasComunes, r.bases.contingenciasProfesionales]).toEqual([68_640, 68_640])
    expect(r.cifrasPendientes).toEqual([])
  })
  it('grupo 1 al 50 %, 80 h: CC 80 × 11,98 = 958,40; CP sigue el mínimo general por hora (8,58) → la remuneración 750 €', () => {
    const r = calcularNominaCentimos(entrada({ grupo: 1, jornadaPct: 50, salarioBase: 150_000, horasTrabajadasMes: 80 }), { modo: 'calculo' })
    expect([r.bases.contingenciasComunes, r.bases.contingenciasProfesionales]).toEqual([95_840, 75_000])
  })
  it('sin horas: aproximación mínimo mensual × jornada y la regla bloquea el cálculo', () => {
    expect(() => calcularNominaCentimos(entrada({ grupo: 7, jornadaPct: 50, salarioBase: 120_000 }), { modo: 'calculo' })).toThrow(/regla:base_min_parcial/)
    expect(() => calcularNominaCentimos(entrada({ grupo: 7, jornadaPct: 50, salarioBase: 120_000, horasTrabajadasMes: -1 }), { modo: 'simulacion' })).toThrow()
  })
})

describe('otros', () => {
  it('avisa si el salario no llega al SMI 2026 (17.094 €/año)', () => {
    const r = calcularNominaCentimos(entrada({ salarioBase: 120_000, pagas: 14 }), { modo: 'simulacion' }) // 16.800 €
    expect(r.avisos.some(a => a.startsWith('bajo_smi'))).toBe(true)
    const ok = calcularNominaCentimos(entrada({ salarioBase: 122_100, pagas: 14 }), { modo: 'simulacion' })
    expect(ok.avisos.some(a => a.startsWith('bajo_smi'))).toBe(false)
  })
  it('la incidencia «descuento» descuenta su importe (antes se ignoraba)', () => {
    const r = calcularNominaCentimos(entrada({ salarioBase: 300_000, incidencias: [{ tipo: 'descuento', concepto: 'anticipo', importe: 10_000 }] }), { modo: 'simulacion' })
    expect(r.devengos.descuentos).toBe(10_000)
    expect(r.devengos.total).toBe(290_000)
  })
  it('rechaza importes no enteros', () => {
    expect(() => calcularNominaCentimos(entrada({ salarioBase: 1800.5 }), { modo: 'simulacion' })).toThrow(/céntimos/)
  })
})
