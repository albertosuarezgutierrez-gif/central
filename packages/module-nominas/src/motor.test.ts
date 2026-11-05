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

const MEI = ['mei_empresa', 'mei_trabajador']
const G47 = 'base_min_grupos_4_7'

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
  { n: '02 · grupo 1 por debajo del mínimo → base mínima 1.989,30',
    // base 198930: CC 9349,71→9350 · des 3083,415→3083 · FP 198,93→199 · MEI 298,395→298 · IRPF 2% de 150000 = 3000
    e: { grupo: 1, salarioBase: 150_000, irpfPct: 2 },
    x: { total: 150_000, baseCC: 198_930, baseCP: 198_930, exceso: 0, T: [9_350, 3_083, 199, 298, 0, 3_000, 15_930],
      E: [46_947, 10_941, 398, 1_194, 2_984, 1_492, 0, 63_956], neto: 134_070, coste: 213_956, pendientes: MEI } },
  { n: '03 · grupo 7 indefinido 1.800 €',
    e: { grupo: 7, salarioBase: 180_000, irpfPct: 10 },
    x: { total: 180_000, baseCC: 180_000, baseCP: 180_000, exceso: 0, T: [8_460, 2_790, 180, 270, 0, 18_000, 29_700],
      E: [42_480, 9_900, 360, 1_080, 2_700, 1_350, 0, 57_870], neto: 150_300, coste: 237_870, pendientes: [G47, ...MEI] } },
  { n: '04 · grupo 4 TEMPORAL 2.000 € (desempleo 1,60 / 6,70)',
    e: { grupo: 4, duracion: 'temporal', salarioBase: 200_000, irpfPct: 12 },
    x: { total: 200_000, baseCC: 200_000, baseCP: 200_000, exceso: 0, T: [9_400, 3_200, 200, 300, 0, 24_000, 37_100],
      E: [47_200, 13_400, 400, 1_200, 3_000, 1_500, 0, 66_700], neto: 162_900, coste: 266_700, pendientes: [G47, ...MEI] } },
  { n: '05 · grupo 5, 14 pagas sin prorratear, marzo (no hay extra): base = 1.500 + prorrata 250',
    // prorrata = 150000×2/12 = 25000 → base 175000 ; devengo 150000 ; IRPF 8% de 150000 = 12000
    e: { grupo: 5, salarioBase: 150_000, pagas: 14, periodo: '2026-03', irpfPct: 8 },
    x: { total: 150_000, baseCC: 175_000, baseCP: 175_000, exceso: 0, T: [8_225, 2_713, 175, 263, 0, 12_000, 23_376],
      E: [41_300, 9_625, 350, 1_050, 2_625, 1_313, 0, 56_263], neto: 126_624, coste: 206_263, pendientes: [G47, ...MEI] } },
  { n: '06 · mismo contrato en JUNIO: cobra la extra; la base NO cambia (la extra ya va prorrateada en la base)',
    // devengo 300000 (IRPF 8% = 24000) ; base sigue 175000
    e: { grupo: 5, salarioBase: 150_000, pagas: 14, periodo: '2026-06', irpfPct: 8 },
    x: { total: 300_000, baseCC: 175_000, baseCP: 175_000, exceso: 0, T: [8_225, 2_713, 175, 263, 0, 24_000, 35_376],
      E: [41_300, 9_625, 350, 1_050, 2_625, 1_313, 0, 56_263], neto: 264_624, coste: 356_263, pendientes: [G47, ...MEI] } },
  { n: '07 · grupo 6, 14 pagas PRORRATEADAS: devengo 1.750 = base',
    e: { grupo: 6, salarioBase: 150_000, pagas: 14, prorrataExtras: true, periodo: '2026-03', irpfPct: 8 },
    x: { total: 175_000, baseCC: 175_000, baseCP: 175_000, exceso: 0, T: [8_225, 2_713, 175, 263, 0, 14_000, 25_376],
      E: [41_300, 9_625, 350, 1_050, 2_625, 1_313, 0, 56_263], neto: 149_624, coste: 231_263, pendientes: [G47, ...MEI] } },
  { n: '08 · grupo 1 6.000 € → base máxima 5.101,20 y solidaridad tramos 1-2',
    // exceso 89880: tramo1 51012×1,15%=586,638→587 ; tramo2 38868×1,25%=485,85→486 ; total 1073 → trab round(1073×47/283)=178, emp 895
    e: { grupo: 1, salarioBase: 600_000, irpfPct: 30 },
    x: { total: 600_000, baseCC: 510_120, baseCP: 510_120, exceso: 89_880, T: [23_976, 7_907, 510, 765, 178, 180_000, 213_336],
      E: [120_388, 28_057, 1_020, 3_061, 7_652, 3_826, 895, 164_899], neto: 386_664, coste: 764_899,
      pendientes: [...MEI, 'solidaridad_reparto', 'solidaridad_tramo_1', 'solidaridad_tramo_2'] } },
  { n: '09 · grupo 1 9.000 € → solidaridad los tres tramos',
    // exceso 389880: 51012×1,15%=587 · 204048×1,25%=2550,6→2551 · 134820×1,46%=1968,372→1968 ; total 5106 → trab 848, emp 4258
    e: { grupo: 1, salarioBase: 900_000, irpfPct: 40 },
    x: { total: 900_000, baseCC: 510_120, baseCP: 510_120, exceso: 389_880, T: [23_976, 7_907, 510, 765, 848, 360_000, 394_006],
      E: [120_388, 28_057, 1_020, 3_061, 7_652, 3_826, 4_258, 168_262], neto: 505_994, coste: 1_068_262,
      pendientes: [...MEI, 'solidaridad_reparto', 'solidaridad_tramo_1', 'solidaridad_tramo_2', 'solidaridad_tramo_3'] } },
  { n: '10 · PARCIAL 50 % indefinido grupo 7 (1.800 → 900)',
    e: { grupo: 7, jornadaPct: 50, salarioBase: 180_000, irpfPct: 2 },
    x: { total: 90_000, baseCC: 90_000, baseCP: 90_000, exceso: 0, T: [4_230, 1_395, 90, 135, 0, 1_800, 7_650],
      E: [21_240, 4_950, 180, 540, 1_350, 675, 0, 28_935], neto: 82_350, coste: 118_935,
      pendientes: [G47, ...MEI, 'regla:base_min_parcial'] } },
  { n: '11 · PARCIAL 50 % temporal por debajo del mínimo proporcional (1.424,40×50% = 712,20)',
    e: { grupo: 7, jornadaPct: 50, duracion: 'temporal', salarioBase: 120_000, irpfPct: 0 },
    x: { total: 60_000, baseCC: 71_220, baseCP: 71_220, exceso: 0, T: [3_347, 1_140, 71, 107, 0, 0, 4_665],
      E: [16_808, 4_772, 142, 427, 1_068, 534, 0, 23_751], neto: 55_335, coste: 83_751,
      pendientes: [G47, ...MEI, 'regla:base_min_parcial'] } },
  { n: '12 · PARCIAL 62,5 % SIN duración conocida → desempleo provisional a tipo temporal + pendiente',
    e: { grupo: 7, jornadaPct: 62.5, duracion: null, salarioBase: 160_000, irpfPct: 2 },
    x: { total: 100_000, baseCC: 100_000, baseCP: 100_000, exceso: 0, T: [4_700, 1_600, 100, 150, 0, 2_000, 8_550],
      E: [23_600, 6_700, 200, 600, 1_500, 750, 0, 33_350], neto: 91_450, coste: 133_350,
      pendientes: [G47, ...MEI, 'regla:base_min_parcial', 'regla:duracion_contrato'] } },
  { n: '13 · grupo 8 (DIARIO), febrero 28 días: mínimo 47,48×28 = 1.329,44',
    e: { grupo: 8, periodo: '2026-02', salarioBase: 130_000, irpfPct: 2 },
    x: { total: 130_000, baseCC: 132_944, baseCP: 132_944, exceso: 0, T: [6_248, 2_061, 133, 199, 0, 2_600, 11_241],
      E: [31_375, 7_312, 266, 798, 1_994, 997, 0, 42_742], neto: 118_759, coste: 172_742, pendientes: MEI } },
  { n: '14 · grupo 10 (DIARIO) temporal, julio 31 días: máximo 170,04×31 = 5.271,24 y solidaridad',
    // exceso 72876: tramo1 52712×1,15%=606,188→606 · 20164×1,25%=252,05→252 ; total 858 → trab 142, emp 716
    e: { grupo: 10, periodo: '2026-07', duracion: 'temporal', salarioBase: 600_000, irpfPct: 30 },
    x: { total: 600_000, baseCC: 527_124, baseCP: 527_124, exceso: 72_876, T: [24_775, 8_434, 527, 791, 142, 180_000, 214_669],
      E: [124_401, 35_317, 1_054, 3_163, 7_907, 3_953, 716, 176_511], neto: 385_331, coste: 776_511,
      pendientes: [...MEI, 'solidaridad_reparto', 'solidaridad_tramo_1', 'solidaridad_tramo_2'] } },
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
  t.basesMensuales[2].min.valor = 160_000 // ficticio, solo test
  t.basesMensuales[3].min.valor = 140_000
  return t
}

describe('fail-closed: modo «cálculo»', () => {
  it('2026 tal cual: LANZA CifraPendienteError (reparto MEI sin verificar)', () => {
    expect(() => calcularNominaCentimos(entrada({ salarioBase: 300_000 }), { modo: 'calculo' })).toThrow(CifraPendienteError)
    let err: unknown
    try { calcularNominaCentimos(entrada({ grupo: 7, salarioBase: 180_000 }), { modo: 'calculo' }) } catch (e) { err = e }
    expect(err).toBeInstanceOf(CifraPendienteError)
    expect((err as CifraPendienteError).claves).toEqual([G47, ...MEI])
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
  it('grupos 2 y 3 de 2026 no tienen cifra: no se calculan ni en simulación', () => {
    expect(() => calcularNominaCentimos(entrada({ grupo: 2, salarioBase: 200_000 }), { modo: 'simulacion' })).toThrow(CifraDesconocidaError)
    expect(() => calcularNominaCentimos(entrada({ grupo: 3, salarioBase: 200_000 }), { modo: 'simulacion' })).toThrow(CifraDesconocidaError)
  })
  it('año sin tabla: error, nunca la de otro año', () => {
    expect(() => calcularNominaCentimos(entrada({ periodo: '2027-01', salarioBase: 300_000 }), { modo: 'simulacion' })).toThrow(TablaNoDisponibleError)
    expect(() => calcularNominaCentimos(entrada({ periodo: '2027-01' }), { modo: 'simulacion', tabla: TABLA_2026 })).toThrow(/Tabla de 2026/)
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
