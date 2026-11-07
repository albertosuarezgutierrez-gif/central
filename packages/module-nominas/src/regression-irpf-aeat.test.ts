/**
 * Guardián `regression-irpf-aeat`: el procedimiento de retención del RIRPF (arts. 81-88, BOE consolidado 07/10/2026) con
 * casos calculados A MANO (aritmética en cada caso) y contrastados con una implementación independiente en Python
 * (`fractions.Fraction`, sin compartir código). 🚨 NO son cifras del simulador oficial de la AEAT (no accesible desde el
 * contenedor): la validación contra el simulador sigue pendiente (spec N1 «≥30 casos contrastados»).
 *
 * Fórmulas (ver irpf.ts): RNr = RA − SS; reducción art. 83.3.d) sobre RNr; gastos 2.000 [+3.500/7.750] con tope RNr;
 * base = RNr − gastos − reducción − 600 (> 2 desc.) − pensión; cuota = esc(base) − esc(mínimo), 0 si base ≤ mínimo;
 * art. 85.3: si RA ≤ 35.200, cuota ≤ 43 % × (RA − límite excluyente art. 81 de su situación);
 * esc = 19 % hasta 12.450 · 24 % hasta 20.200 · 30 % hasta 35.200 · 37 % hasta 60.000 · 45 % hasta 300.000 · 47 %;
 * cuotas acumuladas de tramos: 2.365,50 · 4.225,50 · 8.725,50 · 17.901,50 · 125.901,50; esc(5.550) = 1.054,50;
 * límites art. 81.1: 3.ª 15.876 / 16.342 / 16.867 · 2.ª 17.197 / 18.130 / 19.262 · 1.ª — / 17.644 / 18.694.
 * tipo = cuota / RA con 2 decimales. Importes en céntimos.
 */
import { describe, it, expect } from 'vitest'
import { CifraDesconocidaError, CifraPendienteError, PENDIENTE_VERIFICAR, type Cifra } from './cifras'
import { calcularTipoIrpf, regularizarTipo, type EntradaIrpf } from './irpf'
import { tablaIrpfDePrueba } from './irpf-prueba'
import { situacionVigente, validarHistorial, validarSituacionFamiliar, type SituacionFamiliar } from './situacion-familiar'
import { TABLA_IRPF_2026, tablaIrpfDelAño } from './tablas'
import { TablaNoDisponibleError } from './cifras'

const T = tablaIrpfDePrueba()

function sf(p: Partial<SituacionFamiliar> = {}): SituacionFamiliar {
  return {
    vigenteDesde: '2026-01-01', vigenteHasta: null, situacion: 3, fechaNacimientoContribuyente: '1990-05-10',
    discapacidad: 'ninguna', descendientes: [], ascendientes: [], ...p,
  }
}
const E = (x: number) => Math.round(x * 100) // euros de la tabla de casos → céntimos (SOLO en tests, importes con ≤ 2 decimales)

interface Caso {
  n: string
  RA: number // €
  SS: number // €
  s: SituacionFamiliar | null
  corto?: boolean
  x: { RN: number; red: number; base: number; minimo: number; c1: number; c2: number; cuota: number; tipoPct: number; avisos?: string[]; pendientes?: string[]; motivo?: string }
}

const DA61 = 'deduccion_da61_en_declaracion'
const L853 = 'limite_art_85_3_aplicado'
const CASOS: Caso[] = [
  { n: '01 · soltero 24.000 € (tramo 30 %, sin reducción art. 20)',
    // RNr = 24.000 − 1.524 = 22.476 > 19.747,50 → red 0 · base 22.476 − 2.000 = 20.476
    // esc(20.476) = 2.365,50 + 7.750×24 % (1.860) + 276×30 % (82,80) = 4.308,30 · cuota = 4.308,30 − 1.054,50 = 3.253,80
    // 85.3: 43 % × (24.000 − 15.876) = 3.493,32 (no actúa) · 3.253,80/24.000 = 13,5575 % → 13,56
    RA: 24_000, SS: 1_524, s: sf(), x: { RN: 20_476, red: 0, base: 20_476, minimo: 5_550, c1: 4_308.3, c2: 1_054.5, cuota: 3_253.8, tipoPct: 13.56 } },
  { n: '02 · 12.000 €: la reducción art. 20 deja la base por debajo del mínimo → 0 % (y bajo el límite excluyente)',
    // RNr = 11.238 ≤ 14.852 → red 7.302 · base = 11.238 − 2.000 − 7.302 = 1.936 < 5.550 → tipo 0 (art. 86.1)
    RA: 12_000, SS: 762, s: sf(), x: { RN: 9_238, red: 7_302, base: 1_936, minimo: 5_550, c1: 367.84, c2: 1_054.5, cuota: 0, tipoPct: 0, avisos: ['minimo_exento', DA61], motivo: 'minimo_exento' } },
  { n: '03 · 16.000 €: reducción art. 20 sobre RA − SS (no tras los 2.000 €) y límite del art. 85.3',
    // RNr = 14.984 → red = 7.302 − 1,75×132 = 7.071 · base = 14.984 − 2.000 − 7.071 = 5.913 · esc = 1.123,47 · cuota 68,97
    // 85.3: 43 % × (16.000 − 15.876) = 53,32 → cuota 53,32 · 53,32/16.000 = 0,333 % → 0,33
    RA: 16_000, SS: 1_016, s: sf(), x: { RN: 12_984, red: 7_071, base: 5_913, minimo: 5_550, c1: 1_123.47, c2: 1_054.5, cuota: 53.32, tipoPct: 0.33, avisos: [L853, DA61] } },
  { n: '04 · RNr en el tramo 14.852-17.673,52 de la reducción',
    // RNr = 18.000 − 1.143 = 16.857 → red = 7.302 − 1,75×2.005 = 3.793,25 · base = 16.857 − 2.000 − 3.793,25 = 11.063,75
    // esc = 2.102,1125 → 2.102,11 · cuota 1.047,61 · 85.3: 43 % × 2.124 = 913,32 → cuota 913,32 · /18.000 = 5,074 % → 5,07
    RA: 18_000, SS: 1_143, s: sf(), x: { RN: 14_857, red: 3_793.25, base: 11_063.75, minimo: 5_550, c1: 2_102.11, c2: 1_054.5, cuota: 913.32, tipoPct: 5.07, avisos: [L853, DA61] } },
  { n: '05 · 30.000 €: tramo 30 %',
    // base = 30.000 − 1.905 − 2.000 = 26.095 → esc = 4.225,50 + 5.895×30 % = 5.994 · cuota 4.939,50 · 85.3: 43 %×14.124 = 6.073,32 (no) · → 16,47
    RA: 30_000, SS: 1_905, s: sf(), x: { RN: 26_095, red: 0, base: 26_095, minimo: 5_550, c1: 5_994, c2: 1_054.5, cuota: 4_939.5, tipoPct: 16.47 } },
  { n: '06 · casado (sit. 2) con 2 hijos de 5 y 8 años, 50.000 €',
    // mínimo = 5.550 + 2.400 + 2.700 = 10.650 → esc = 2.023,50 · base = 50.000 − 3.175 − 2.000 = 44.825 → esc = 12.286,75
    // cuota = 10.263,25 · RA > 35.200: sin límite 85.3 · /50.000 = 20,5265 % → 20,53
    RA: 50_000, SS: 3_175,
    s: sf({ situacion: 2, descendientes: [{ fechaNacimiento: '2018-03-01', discapacidad: 'ninguna', porEntero: true }, { fechaNacimiento: '2021-01-15', discapacidad: 'ninguna', porEntero: true }] }),
    x: { RN: 44_825, red: 0, base: 44_825, minimo: 10_650, c1: 12_286.75, c2: 2_023.5, cuota: 10_263.25, tipoPct: 20.53 } },
  { n: '07 · 80.000 €: tramo 37 %',
    RA: 80_000, SS: 4_000, s: sf(), x: { RN: 74_000, red: 0, base: 74_000, minimo: 5_550, c1: 24_201.5, c2: 1_054.5, cuota: 23_147, tipoPct: 28.93 } },
  { n: '08 · 400.000 €: tramo 47 %',
    // base 394.000 → esc = 125.901,50 + 94.000×47 % = 170.081,50 · cuota 169.027 · /400.000 = 42,25675 % → 42,26
    RA: 400_000, SS: 4_000, s: sf(), x: { RN: 394_000, red: 0, base: 394_000, minimo: 5_550, c1: 170_081.5, c2: 1_054.5, cuota: 169_027, tipoPct: 42.26 } },
  { n: '09 · discapacidad 33 % (gastos +3.500, mínimo +3.000) y un hijo menor de 3 años',
    // RNr = 26.000 − 1.826,48 = 24.173,52 > 19.747,50 → red 0 · base = 24.173,52 − 5.500 = 18.673,52
    // mínimo = 5.550 + 3.000 + 2.400 + 2.800 = 13.750 → esc = 2.365,50 + 1.300×24 % = 2.677,50
    // esc(18.673,52) = 2.365,50 + 6.223,52×24 % (1.493,6448) = 3.859,14 · cuota 1.181,64 · 85.3 (3:1): 43 %×9.658 = 4.152,94 (no) · → 4,54
    RA: 26_000, SS: 1_826.48,
    s: sf({ discapacidad: '33', descendientes: [{ fechaNacimiento: '2024-06-01', discapacidad: 'ninguna', porEntero: true }] }),
    x: { RN: 18_673.52, red: 0, base: 18_673.52, minimo: 13_750, c1: 3_859.14, c2: 2_677.5, cuota: 1_181.64, tipoPct: 4.54 } },
  { n: '10 · contribuyente mayor de 75 años (mínimo 5.550 + 1.150 + 1.400)',
    RA: 36_000, SS: 2_286, s: sf({ fechaNacimientoContribuyente: '1950-02-02' }),
    x: { RN: 31_714, red: 0, base: 31_714, minimo: 8_100, c1: 7_679.7, c2: 1_539, cuota: 6_140.7, tipoPct: 17.06 } },
  { n: '11 · hipoteca anterior a 2013 con RA < 33.007,20 € → −2 puntos',
    // base = 28.000 − 1.778 − 2.000 = 24.222 → esc = 5.432,10 · cuota 4.377,60 · 85.3: 43 %×12.124 = 5.213,32 (no) · 15,63 − 2 = 13,63
    RA: 28_000, SS: 1_778, s: sf({ hipotecaViviendaAnterior2013: true }),
    x: { RN: 24_222, red: 0, base: 24_222, minimo: 5_550, c1: 5_432.1, c2: 1_054.5, cuota: 4_377.6, tipoPct: 13.63, avisos: ['reduccion_hipoteca_anterior_2013'] } },
  { n: '12 · contrato de duración inferior a un año (tipo mínimo 2 %, aquí no actúa)',
    // RNr = 15.920 → red = 7.302 − 1,75×1.068 = 5.433 · base = 8.487 → esc 1.612,53 · cuota 558,03 · 85.3: 43 %×1.124 = 483,32 → 2,84 %
    RA: 17_000, SS: 1_080, s: sf(), corto: true, x: { RN: 13_920, red: 5_433, base: 8_487, minimo: 5_550, c1: 1_612.53, c2: 1_054.5, cuota: 483.32, tipoPct: 2.84, avisos: [L853, DA61] } },
  { n: '13 · 1.000.000 €: el art. 85.3 NO actúa por encima de 35.200 €',
    // esc(994.000) = 125.901,50 + 694.000×47 % = 452.081,50 → cuota 451.027 · /1.000.000 = 45,1027 % → 45,10
    RA: 1_000_000, SS: 4_000, s: sf(), x: { RN: 994_000, red: 0, base: 994_000, minimo: 5_550, c1: 452_081.5, c2: 1_054.5, cuota: 451_027, tipoPct: 45.1 } },
  { n: '14 · casado (sit. 2.ª), 20.100 €: límite 85.3 sobre el límite excluyente de su situación (17.197 €)',
    // RNr = 18.823 → red = 2.364,34 − 1,14×1.149,48 (1.310,41) = 1.053,93 · base = 18.823 − 2.000 − 1.053,93 = 15.769,07
    // esc = 2.365,50 + 3.319,07×24 % (796,5768) = 3.162,08 · cuota 2.107,58 · 85.3: 43 % × (20.100 − 17.197) = 1.248,29 → 6,21 %
    RA: 20_100, SS: 1_277, s: sf({ situacion: 2 }), x: { RN: 16_823, red: 1_053.93, base: 15_769.07, minimo: 5_550, c1: 3_162.08, c2: 1_054.5, cuota: 1_248.29, tipoPct: 6.21, avisos: [L853] } },
  { n: '15 · ascendiente mayor de 75 que convive (1.150 + 1.400), 40.000 €',
    RA: 40_000, SS: 2_540, s: sf({ ascendientes: [{ fechaNacimiento: '1945-01-01', discapacidad: 'ninguna', porEntero: true, convive: true }] }),
    x: { RN: 35_460, red: 0, base: 35_460, minimo: 8_100, c1: 8_821.7, c2: 1_539, cuota: 7_282.7, tipoPct: 18.21 } },
  { n: '16 · pensión compensatoria al cónyuge (3.000 €) reduce la base',
    // RNr = 20.173,52 > 19.747,50 → red 0 · base = 20.173,52 − 2.000 − 3.000 = 15.173,52
    // esc = 2.365,50 + 2.723,52×24 % (653,6448) = 3.019,14 · cuota 1.964,64 · 85.3: 43 %×6.124 = 2.633,32 (no) · /22.000 = 8,93 %
    RA: 22_000, SS: 1_826.48, s: sf({ pensionCompensatoriaAnual: E(3_000) }),
    x: { RN: 18_173.52, red: 0, base: 15_173.52, minimo: 5_550, c1: 3_019.14, c2: 1_054.5, cuota: 1_964.64, tipoPct: 8.93 } },
  { n: '17 · cuatro hijos (2.400 + 2.700 + 4.000 + 4.500) y −600 € por más de dos (art. 83.3.e), 60.000 €',
    // mínimo = 19.150 → esc = 3.973,50 · base = 60.000 − 3.810 − 2.000 − 600 = 53.590
    // esc = 8.725,50 + 18.390×37 % (6.804,30) = 15.529,80 · cuota = 11.556,30 · /60.000 = 19,2605 % → 19,26
    RA: 60_000, SS: 3_810,
    s: sf({ situacion: 2, descendientes: ['2010-01-01', '2012-01-01', '2014-01-01', '2016-01-01'].map(f => ({ fechaNacimiento: f, discapacidad: 'ninguna' as const, porEntero: true })) }),
    x: { RN: 54_190, red: 0, base: 53_590, minimo: 19_150, c1: 15_529.8, c2: 3_973.5, cuota: 11_556.3, tipoPct: 19.26 } },
  { n: '18 · hipoteca anterior a 2013 pero RA > 33.007,20 €: no se reduce',
    RA: 35_000, SS: 2_222.5, s: sf({ hipotecaViviendaAnterior2013: true }),
    x: { RN: 30_777.5, red: 0, base: 30_777.5, minimo: 5_550, c1: 7_398.75, c2: 1_054.5, cuota: 6_344.25, tipoPct: 18.13 } },
]

describe('IRPF AEAT: casos a mano por tramo (≥10)', () => {
  for (const c of CASOS) {
    it(c.n, () => {
      const e: EntradaIrpf = { retribucionAnual: E(c.RA), cotizacionesAnual: E(c.SS), situacion: c.s, duracionInferiorAño: c.corto }
      const d = calcularTipoIrpf(e, { año: 2026, modo: 'simulacion', tabla: T })
      expect(d.rendimientoNeto).toBe(E(c.x.RN))
      expect(d.reduccionTrabajo).toBe(E(c.x.red))
      expect(d.baseTipo).toBe(E(c.x.base))
      expect(d.minimoPersonalFamiliar).toBe(E(c.x.minimo))
      expect(d.cuota1).toBe(E(c.x.c1))
      expect(d.cuota2).toBe(E(c.x.c2))
      expect(d.cuota).toBe(E(c.x.cuota))
      expect(d.tipoPpm).toBe(Math.round(c.x.tipoPct * 10_000))
      expect([...d.avisos].sort()).toEqual([...(c.x.avisos ?? [])].sort())
      if (c.x.motivo) expect(d.motivo).toBe(c.x.motivo)
      expect(d.cifrasPendientes).toEqual(c.x.pendientes ?? [])
    })
  }
  it('con la tabla 2026 REAL (todo verificado en el BOE) todos los casos se calculan en modo CÁLCULO y dan lo mismo', () => {
    for (const c of CASOS) {
      const e: EntradaIrpf = { retribucionAnual: E(c.RA), cotizacionesAnual: E(c.SS), situacion: c.s, duracionInferiorAño: c.corto }
      const d = calcularTipoIrpf(e, { año: 2026, modo: 'calculo' })
      expect(d.cifrasPendientes, c.n).toEqual([])
      expect(d.tipoPpm, c.n).toBe(Math.round(c.x.tipoPct * 10_000))
    }
  })
  it('la reducción del art. 20 se calcula sobre RA − cotizaciones (RIRPF 83.3.d último párrafo), no tras los 2.000 €', () => {
    const d = calcularTipoIrpf({ retribucionAnual: E(16_000), cotizacionesAnual: E(1_016), situacion: sf() }, { año: 2026, modo: 'calculo' })
    expect(d.rendimientoNetoReduccion).toBe(E(14_984))
    expect(d.reduccionTrabajo).toBe(E(7_071)) // con 12.984 (tras gastos) habría salido 7.302
  })
  it('discapacidad ≥ 65 %: mínimo 9.000 + 3.000 de asistencia aunque no se marque (art. 60.1 LIRPF)', () => {
    const d = calcularTipoIrpf({ retribucionAnual: E(40_000), cotizacionesAnual: 0, situacion: sf({ discapacidad: '65' }) }, { año: 2026, modo: 'calculo' })
    expect(d.minimoPersonalFamiliar).toBe(E(5_550 + 9_000 + 3_000))
  })
})

describe('límite excluyente (art. 81.1) y tipo mínimo (art. 86.2 + 81.3)', () => {
  it('retribución ≤ límite de su situación → 0 %', () => {
    const d = calcularTipoIrpf({ retribucionAnual: E(15_000), cotizacionesAnual: E(950), situacion: sf() }, { año: 2026, modo: 'calculo' })
    expect(d.tipoPpm).toBe(0)
    expect(d.motivo).toBe('minimo_exento')
  })
  it('justo en el límite (3.ª sin hijos, 15.876 €) → 0 %; un euro por encima el art. 85.3 limita la cuota a 43 % × 1 € = 0,43 € → 0,00 %', () => {
    const base = { cotizacionesAnual: E(1_000), situacion: sf() }
    const enLimite = calcularTipoIrpf({ ...base, retribucionAnual: E(15_876) }, { año: 2026, modo: 'calculo' })
    expect(enLimite.motivo).toBe('minimo_exento')
    const encima = calcularTipoIrpf({ ...base, retribucionAnual: E(15_877) }, { año: 2026, modo: 'calculo' })
    expect(encima.motivo).toBe('algoritmo')
    expect(encima.cuota).toBe(43)
    expect(encima.tipoPpm).toBe(0)
  })
  it('contrato de duración inferior al año: el límite excluyente NO se aplica (art. 81.3) y el tipo es al menos 2 %', () => {
    const d = calcularTipoIrpf({ retribucionAnual: E(15_000), cotizacionesAnual: E(950), situacion: sf(), duracionInferiorAño: true }, { año: 2026, modo: 'calculo' })
    expect(d.tipoPpm).toBe(20_000)
    expect(d.motivo).toBe('algoritmo')
    expect(d.avisos).toEqual(expect.arrayContaining(['tipo_minimo_contrato_corto', 'limite_excluyente_no_aplica_contrato_corto']))
  })
  it('columnas por situación e hijos: sit. 2 con 2 hijos → 19.262 € exento; sit. 3 con 2 hijos → 16.867 €', () => {
    const hijos = ['2015-01-01', '2016-01-01'].map(f => ({ fechaNacimiento: f, discapacidad: 'ninguna' as const, porEntero: true }))
    const op = { año: 2026, modo: 'calculo' as const }
    expect(calcularTipoIrpf({ retribucionAnual: E(19_262), cotizacionesAnual: 0, situacion: sf({ situacion: 2, descendientes: hijos }) }, op).motivo).toBe('minimo_exento')
    expect(calcularTipoIrpf({ retribucionAnual: E(16_867), cotizacionesAnual: 0, situacion: sf({ situacion: 3, descendientes: hijos }) }, op).motivo).toBe('minimo_exento')
    expect(calcularTipoIrpf({ retribucionAnual: E(16_868), cotizacionesAnual: 0, situacion: sf({ situacion: 3, descendientes: hijos }) }, op).motivo).toBe('algoritmo')
  })
  it('situación 1.ª sin descendientes no existe en el cuadro → se trata como 3.ª, con aviso', () => {
    const d = calcularTipoIrpf({ retribucionAnual: E(15_876), cotizacionesAnual: 0, situacion: sf({ situacion: 1 }) }, { año: 2026, modo: 'calculo' })
    expect(d.motivo).toBe('minimo_exento')
    expect(d.avisos).toContain('situacion_1_sin_descendientes_como_3')
  })
  it('límite excluyente sin cifra (null) → no se aplica y queda pendiente (nunca se arrastra el de otro año)', () => {
    const t = tablaIrpfDePrueba()
    ;(t.exento['3:0'] as Cifra<number>).valor = null
    ;(t.exento['3:0'] as Cifra<number>).certeza = PENDIENTE_VERIFICAR
    const d = calcularTipoIrpf({ retribucionAnual: E(15_000), cotizacionesAnual: E(950), situacion: sf() }, { año: 2026, modo: 'simulacion', tabla: t })
    expect(d.cifrasPendientes).toContain('irpf_exento_3_0')
    expect(d.avisos).toContain('minimo_exento_desconocido')
    expect(() => calcularTipoIrpf({ retribucionAnual: E(15_000), cotizacionesAnual: E(950), situacion: sf() }, { año: 2026, modo: 'calculo', tabla: t })).toThrow(CifraPendienteError)
  })
})

describe('modelo 145 ausente → art. 88.2 RIRPF (sin circunstancias personales ni familiares)', () => {
  it('se calcula como 3.ª sin hijos con el solo mínimo personal (5.550 €), sin pendientes', () => {
    const sin = calcularTipoIrpf({ retribucionAnual: E(24_000), cotizacionesAnual: E(1_524), situacion: null }, { año: 2026, modo: 'calculo' })
    expect(sin.motivo).toBe('sin_145_sin_circunstancias')
    expect(sin.avisos).toContain('sin_modelo_145_sin_circunstancias')
    expect(sin.cifrasPendientes).toEqual([])
    expect(sin.tipoPpm).toBe(135_600) // = caso 01 (soltero sin hijos)
  })
  it('ignora lo que solo el 145 podría acreditar: hijos, edad, discapacidad (el tipo nunca baja por no comunicar)', () => {
    const op = { año: 2026, modo: 'calculo' as const }
    const e = { retribucionAnual: E(40_000), cotizacionesAnual: E(2_540) }
    const sin = calcularTipoIrpf({ ...e, situacion: null }, op)
    const con = calcularTipoIrpf({ ...e, situacion: sf({ situacion: 2, fechaNacimientoContribuyente: '1950-01-01', descendientes: [{ fechaNacimiento: '2020-01-01', discapacidad: 'ninguna', porEntero: true }] }) }, op)
    expect(sin.minimoPersonalFamiliar).toBe(E(5_550))
    expect(con.tipoPpm).toBeLessThan(sin.tipoPpm)
  })
  it('bajo el límite excluyente de 3.ª sin hijos también es 0 %; en contrato corto, 2 %', () => {
    const op = { año: 2026, modo: 'calculo' as const }
    expect(calcularTipoIrpf({ retribucionAnual: E(15_000), cotizacionesAnual: 0, situacion: null }, op).tipoPpm).toBe(0)
    expect(calcularTipoIrpf({ retribucionAnual: E(15_000), cotizacionesAnual: 0, situacion: null, duracionInferiorAño: true }, op).tipoPpm).toBe(20_000)
  })
})

describe('anualidades por alimentos a hijos (art. 85.2 RIRPF)', () => {
  it('escala por separado a las anualidades y al resto; mínimo + 1.980 €', () => {
    // RA 30.000, SS 1.905 → base 26.095 (caso 05) · anualidades 6.000
    // esc(6.000) = 1.140 · esc(20.095) = 2.365,50 + 7.645×24 % (1.834,80) = 4.200,30 → cuota 1 = 5.340,30
    // esc(5.550 + 1.980 = 7.530) = 1.430,70 · cuota = 3.909,60 · /30.000 = 13,032 % → 13,03 (sin anualidades: 16,47 %)
    const d = calcularTipoIrpf({ retribucionAnual: E(30_000), cotizacionesAnual: E(1_905), situacion: sf({ anualidadesAlimentosAnual: E(6_000) }) }, { año: 2026, modo: 'calculo' })
    expect(d.cuota1).toBe(E(5_340.3))
    expect(d.cuota2).toBe(E(1_430.7))
    expect(d.cuota).toBe(E(3_909.6))
    expect(d.tipoPpm).toBe(130_300)
    expect(d.avisos).toContain('anualidades_alimentos_art_85_2')
  })
  it('anualidades ≥ base → procedimiento general (art. 85.1), con aviso', () => {
    const d = calcularTipoIrpf({ retribucionAnual: E(30_000), cotizacionesAnual: E(1_905), situacion: sf({ anualidadesAlimentosAnual: E(30_000) }) }, { año: 2026, modo: 'calculo' })
    expect(d.tipoPpm).toBe(164_700)
    expect(d.avisos).toContain('anualidades_alimentos_no_inferiores_a_la_base')
  })
})

describe('fail-closed', () => {
  it('cifra sin valor (null) lanza CifraDesconocidaError en cualquier modo', () => {
    const t = tablaIrpfDePrueba()
    t.minimos.personal.valor = null
    expect(() => calcularTipoIrpf({ retribucionAnual: E(30_000), cotizacionesAnual: 0, situacion: sf() }, { año: 2026, modo: 'simulacion', tabla: t })).toThrow(CifraDesconocidaError)
  })
  it('cifra PENDIENTE_VERIFICAR: simulación la lista, cálculo lanza', () => {
    const t = tablaIrpfDePrueba()
    t.limite853.porcentaje.certeza = PENDIENTE_VERIFICAR
    const e: EntradaIrpf = { retribucionAnual: E(30_000), cotizacionesAnual: E(1_905), situacion: sf() }
    expect(calcularTipoIrpf(e, { año: 2026, modo: 'simulacion', tabla: t }).cifrasPendientes).toEqual(['irpf_limite_853_pct'])
    expect(() => calcularTipoIrpf(e, { año: 2026, modo: 'calculo', tabla: t })).toThrow(CifraPendienteError)
  })
  it('año sin tabla → error (no se usa la de otro año) y tabla de otro año → error', () => {
    expect(() => tablaIrpfDelAño(2025)).toThrow(TablaNoDisponibleError)
    expect(() => calcularTipoIrpf({ retribucionAnual: E(30_000), cotizacionesAnual: 0, situacion: sf() }, { año: 2027, modo: 'simulacion' })).toThrow(TablaNoDisponibleError)
    expect(() => calcularTipoIrpf({ retribucionAnual: E(30_000), cotizacionesAnual: 0, situacion: sf() }, { año: 2027, modo: 'simulacion', tabla: T })).toThrow(/Tabla IRPF de 2026/)
  })
  it('importes no enteros o negativos se rechazan', () => {
    expect(() => calcularTipoIrpf({ retribucionAnual: 1000.5, cotizacionesAnual: 0, situacion: sf() }, { año: 2026, modo: 'simulacion', tabla: T })).toThrow()
    expect(() => calcularTipoIrpf({ retribucionAnual: -1, cotizacionesAnual: 0, situacion: sf() }, { año: 2026, modo: 'simulacion', tabla: T })).toThrow()
  })
})

describe('regularización (arts. 87-88)', () => {
  it('tipo del resto del año = (cuota nueva − retenido) / retribución pendiente', () => {
    // cuota anual 4.000 · retenido hasta junio 1.600 · retribución 24.000, percibida 12.000 → (4.000 − 1.600)/12.000 = 20,00 %
    const r = regularizarTipo({ cuotaAnual: E(4_000), retribucionAnual: E(24_000), retribucionPercibida: E(12_000), retenidoPracticado: E(1_600) })
    expect(r.tipoPpm).toBe(200_000)
    expect(r.retribucionRestante).toBe(E(12_000))
  })
  it('retenido de más → tipo 0 (no devuelve); sin retribución restante → error', () => {
    expect(regularizarTipo({ cuotaAnual: E(1_000), retribucionAnual: E(24_000), retribucionPercibida: E(12_000), retenidoPracticado: E(1_500) }).tipoPpm).toBe(0)
    expect(() => regularizarTipo({ cuotaAnual: 1, retribucionAnual: E(24_000), retribucionPercibida: E(24_000), retenidoPracticado: 0 })).toThrow()
  })
  it('regularizar con la cuota del algoritmo tras un cambio de situación (hijo nuevo en julio)', () => {
    const sin = calcularTipoIrpf({ retribucionAnual: E(24_000), cotizacionesAnual: E(1_524), situacion: sf() }, { año: 2026, modo: 'simulacion', tabla: T })
    const con = calcularTipoIrpf({ retribucionAnual: E(24_000), cotizacionesAnual: E(1_524), situacion: sf({ descendientes: [{ fechaNacimiento: '2026-07-01', discapacidad: 'ninguna', porEntero: true }] }) }, { año: 2026, modo: 'simulacion', tabla: T })
    // mínimo + 2.400 + 2.800 = 10.750 → esc = 2.365,50 + 0 … 10.750×19 % = 2.042,50 · cuota = 4.308,30 − 2.042,50 = 2.265,80
    expect(con.minimoPersonalFamiliar).toBe(E(10_750))
    expect(con.cuota).toBe(E(2_265.8))
    const retenidoSeisMeses = Math.round((sin.tipoPpm * E(12_000)) / 1_000_000) // 13,56 % × 12.000 = 1.627,20
    expect(retenidoSeisMeses).toBe(E(1_627.2))
    const r = regularizarTipo({ cuotaAnual: con.cuota, retribucionAnual: E(24_000), retribucionPercibida: E(12_000), retenidoPracticado: retenidoSeisMeses })
    // (2.265,80 − 1.627,20) / 12.000 = 5,3217 % → 5,32
    expect(r.tipoPpm).toBe(53_200)
  })
})

describe('modelo 145: vigencia / histórico', () => {
  const h = [
    sf({ vigenteDesde: '2025-01-01', vigenteHasta: '2025-12-31', situacion: 3 }),
    sf({ vigenteDesde: '2026-01-01', vigenteHasta: '2026-06-30', situacion: 3 }),
    sf({ vigenteDesde: '2026-07-01', vigenteHasta: null, situacion: 2 }),
  ]
  it('devuelve la comunicación vigente en la fecha, incluidos los extremos; sin comunicación → null (no «sin hijos»)', () => {
    expect(situacionVigente(h, '2025-12-31')?.vigenteDesde).toBe('2025-01-01')
    expect(situacionVigente(h, '2026-06-30')?.vigenteDesde).toBe('2026-01-01')
    expect(situacionVigente(h, '2026-07-01')?.situacion).toBe(2)
    expect(situacionVigente(h, '2024-12-31')).toBeNull()
    expect(situacionVigente([], '2026-01-01')).toBeNull()
  })
  it('detecta solapes y datos inválidos', () => {
    expect(validarHistorial(h)).toEqual([])
    expect(validarHistorial([...h, sf({ vigenteDesde: '2026-03-01' })])).not.toEqual([])
    expect(validarSituacionFamiliar(sf({ vigenteHasta: '2025-12-31' }))).toContain('vigenteHasta anterior a vigenteDesde')
    expect(validarSituacionFamiliar(sf({ pensionCompensatoriaAnual: 10.5 }))[0]).toMatch(/céntimos/)
    expect(validarSituacionFamiliar(sf())).toEqual([])
  })
})

describe('guardián de la tabla IRPF 2026 (cada cifra con su certeza)', () => {
  const P = PENDIENTE_VERIFICAR
  // RIRPF/LIRPF consolidados del BOE (07/10/2026): ninguna cifra 2026 queda PENDIENTE.
  const ESPERADO: Record<string, [unknown, string]> = {
    irpf_escala_1_hasta: [1245000, 'seguro'],
    irpf_escala_1_tipo: [190000, 'seguro'],
    irpf_escala_2_hasta: [2020000, 'seguro'],
    irpf_escala_2_tipo: [240000, 'seguro'],
    irpf_escala_3_hasta: [3520000, 'seguro'],
    irpf_escala_3_tipo: [300000, 'seguro'],
    irpf_escala_4_hasta: [6000000, 'seguro'],
    irpf_escala_4_tipo: [370000, 'seguro'],
    irpf_escala_5_hasta: [30000000, 'seguro'],
    irpf_escala_5_tipo: [450000, 'seguro'],
    irpf_escala_6_tipo: [470000, 'seguro'],
    irpf_tipo_min_contrato_corto: [20000, 'seguro'],
    irpf_gastos_otros: [200000, 'seguro'],
    irpf_gastos_disc33: [350000, 'seguro'],
    irpf_gastos_disc65: [775000, 'seguro'],
    irpf_reduccion_mas_2_desc: [60000, 'seguro'],
    irpf_red20_umbral1: [1485200, 'seguro'],
    irpf_red20_max: [730200, 'seguro'],
    irpf_red20_umbral2: [1767352, 'seguro'],
    irpf_red20_factor1: [1750000, 'seguro'],
    irpf_red20_en_umbral2: [236434, 'seguro'],
    irpf_red20_umbral3: [1974750, 'seguro'],
    irpf_red20_factor2: [1140000, 'seguro'],
    irpf_min_personal: [555000, 'seguro'],
    irpf_min_mayor65: [115000, 'seguro'],
    irpf_min_mayor75: [140000, 'seguro'],
    irpf_min_disc33: [300000, 'seguro'],
    irpf_min_disc65: [900000, 'seguro'],
    irpf_min_asistencia: [300000, 'seguro'],
    irpf_min_desc_1: [240000, 'seguro'],
    irpf_min_desc_2: [270000, 'seguro'],
    irpf_min_desc_3: [400000, 'seguro'],
    irpf_min_desc_4: [450000, 'seguro'],
    irpf_min_desc_menor3: [280000, 'seguro'],
    irpf_min_asc: [115000, 'seguro'],
    irpf_min_asc_mayor75: [140000, 'seguro'],
    irpf_hipoteca_reduccion_tipo: [20000, 'seguro'],
    irpf_hipoteca_limite: [3300720, 'seguro'],
    irpf_limite_853_pct: [430000, 'seguro'],
    irpf_limite_853_hasta: [3520000, 'seguro'],
    irpf_anualidades_incremento_minimo: [198000, 'seguro'],
    irpf_exento_1_1: [1764400, 'seguro'],
    irpf_exento_1_2: [1869400, 'seguro'],
    irpf_exento_2_0: [1719700, 'seguro'],
    irpf_exento_2_1: [1813000, 'seguro'],
    irpf_exento_2_2: [1926200, 'seguro'],
    irpf_exento_3_0: [1587600, 'seguro'],
    irpf_exento_3_1: [1634200, 'seguro'],
    irpf_exento_3_2: [1686700, 'seguro'],
    irpf_deduccion_smi_max: [59089, 'seguro'],
    irpf_deduccion_smi_plena: [1709400, 'seguro'],
    irpf_deduccion_smi_hasta: [2004845, 'seguro'],
  }
  function cifras(): Map<string, Cifra<unknown>> {
    const m = new Map<string, Cifra<unknown>>()
    const rec = (o: unknown): void => {
      if (!o || typeof o !== 'object') return
      const c = o as Record<string, unknown>
      if ('clave' in c && 'certeza' in c) { m.set(String(c.clave), c as unknown as Cifra<unknown>); return }
      for (const v of Object.values(c)) rec(v)
    }
    rec(TABLA_IRPF_2026)
    return m
  }
  it('valor y certeza de CADA cifra: cambiar una (o confirmarla) sin tocar este test lo pone rojo', () => {
    const real = Object.fromEntries([...cifras()].map(([k, c]) => [k, [c.valor, c.certeza === P ? 'P' : c.certeza]]))
    const esp = Object.fromEntries(Object.entries(ESPERADO).map(([k, [v, z]]) => [k, [v, z === P ? 'P' : z]]))
    expect(real).toEqual(esp)
  })
  it('toda cifra cita su artículo y la escala es creciente y coherente (cuotas acumuladas del comentario de cabecera)', () => {
    for (const c of cifras().values()) expect(c.fuente, c.clave).toMatch(/(RIRPF|LIRPF).*(art\.|DA)/)
    const altos = TABLA_IRPF_2026.escala.map(t => t.hasta?.valor ?? Infinity)
    expect([...altos].sort((a, b) => a - b)).toEqual(altos)
    expect(altos.at(-1)).toBe(Infinity)
  })
})
