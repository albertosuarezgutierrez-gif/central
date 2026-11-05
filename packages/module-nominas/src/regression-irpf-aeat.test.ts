/**
 * Guardián `regression-irpf-aeat` (N1): el algoritmo de retenciones por tramo, el mínimo exento y «145 ausente → tipo máximo»,
 * con casos calculados A MANO (aritmética en cada caso) y contrastados con una implementación independiente en Python
 * (`fractions.Fraction`, sin compartir código). 🚨 NO son cifras de un simulador oficial de la AEAT: la validación contra
 * el simulador queda pendiente (spec N1 «≥30 casos contrastados»). Las cifras de la tabla son `probable`/`PENDIENTE`.
 *
 * Fórmulas (ver irpf.ts): RN = RA − SS − 2.000 [− 3.500/7.750]; base = RN − reducción art. 20 − pensión; cuota = esc(base) − esc(mínimo);
 * esc = 19 % hasta 12.450 · 24 % hasta 20.200 · 30 % hasta 35.200 · 37 % hasta 60.000 · 45 % hasta 300.000 · 47 %;
 * cuotas acumuladas de tramos: 2.365,50 · 4.225,50 · 8.725,50 · 17.901,50 · 125.901,50; esc(5.550) = 1.054,50;
 * tipo = cuota / RA con 2 decimales. Importes en céntimos.
 */
import { describe, it, expect } from 'vitest'
import { CifraDesconocidaError, CifraPendienteError, PENDIENTE_VERIFICAR, type Cifra } from './cifras'
import { calcularTipoIrpf, regularizarTipo, type EntradaIrpf } from './irpf'
import { EXENTO_ILUSTRATIVO, tablaIrpfDePrueba } from './irpf-prueba'
import { situacionVigente, validarHistorial, validarSituacionFamiliar, type SituacionFamiliar } from './situacion-familiar'
import { TABLA_IRPF_2026, tablaIrpfDelAño } from './tablas'
import { TablaNoDisponibleError } from './cifras'

const T = tablaIrpfDePrueba()
const SMI_REGLA = 'regla:irpf_deduccion_smi'

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

const CASOS: Caso[] = [
  { n: '01 · soltero 24.000 € (tramo 30 %, sin reducción art. 20)',
    // RN = 24.000 − 1.524 − 2.000 = 20.476 > 19.747,50 → red 0 · base 20.476
    // esc(20.476) = 2.365,50 + 7.750×24 % (1.860) + 276×30 % (82,80) = 4.308,30 · cuota = 4.308,30 − 1.054,50 = 3.253,80 · 3.253,80/24.000 = 13,5575 % → 13,56
    RA: 24_000, SS: 1_524, s: sf(), x: { RN: 20_476, red: 0, base: 20_476, minimo: 5_550, c1: 4_308.3, c2: 1_054.5, cuota: 3_253.8, tipoPct: 13.56 } },
  { n: '02 · 12.000 €: la reducción art. 20 deja la base por debajo del mínimo → 0 %',
    // RN = 12.000 − 762 − 2.000 = 9.238 ≤ 14.852 → red 7.302 · base 1.936 · esc = 367,84 < 1.054,50 → cuota 0
    RA: 12_000, SS: 762, s: sf(), x: { RN: 9_238, red: 7_302, base: 1_936, minimo: 5_550, c1: 367.84, c2: 1_054.5, cuota: 0, tipoPct: 0, avisos: ['minimo_exento'], pendientes: [SMI_REGLA] } },
  { n: '03 · 16.000 €: tramo 19 % apenas supera el mínimo → 0,16 %',
    // RN = 12.984 → red 7.302 → base 5.682 · esc = 5.682×19 % = 1.079,58 · cuota = 1.079,58 − 1.054,50 = 25,08 · 25,08/16.000 = 0,1568 % → 0,16
    RA: 16_000, SS: 1_016, s: sf(), x: { RN: 12_984, red: 7_302, base: 5_682, minimo: 5_550, c1: 1_079.58, c2: 1_054.5, cuota: 25.08, tipoPct: 0.16, pendientes: [SMI_REGLA] } },
  { n: '04 · RN en el tramo 14.852-17.673,52 de la reducción',
    // RN = 18.000 − 1.143 − 2.000 = 14.857 → red = 7.302 − 1,75×5 = 7.293,25 · base 7.563,75 · esc = 7.563,75×19 % = 1.437,1125 → 1.437,11
    // cuota = 1.437,11 − 1.054,50 = 382,61 · 382,61/18.000 = 2,1256 % → 2,13
    RA: 18_000, SS: 1_143, s: sf(), x: { RN: 14_857, red: 7_293.25, base: 7_563.75, minimo: 5_550, c1: 1_437.11, c2: 1_054.5, cuota: 382.61, tipoPct: 2.13, pendientes: [SMI_REGLA] } },
  { n: '05 · 30.000 €: tramo 30 %',
    // RN = 30.000 − 1.905 − 2.000 = 26.095 → esc = 4.225,50 + 5.895×30 % (1.768,50) = 5.994 · cuota = 5.994 − 1.054,50 = 4.939,50 · /30.000 = 16,465 % → 16,47 (medio hacia arriba)
    RA: 30_000, SS: 1_905, s: sf(), x: { RN: 26_095, red: 0, base: 26_095, minimo: 5_550, c1: 5_994, c2: 1_054.5, cuota: 4_939.5, tipoPct: 16.47 } },
  { n: '06 · casado (sit. 2) con 2 hijos de 5 y 8 años, 50.000 €',
    // mínimo = 5.550 + 2.400 (1.º) + 2.700 (2.º) = 10.650 → esc(10.650) = 2.023,50 · RN = 50.000 − 3.175 − 2.000 = 44.825
    // esc = 8.725,50 + 9.625×37 % (3.561,25) = 12.286,75 · cuota = 12.286,75 − 2.023,50 = 10.263,25 · /50.000 = 20,5265 % → 20,53
    RA: 50_000, SS: 3_175,
    s: sf({ situacion: 2, descendientes: [{ fechaNacimiento: '2018-03-01', discapacidad: 'ninguna', porEntero: true }, { fechaNacimiento: '2021-01-15', discapacidad: 'ninguna', porEntero: true }] }),
    x: { RN: 44_825, red: 0, base: 44_825, minimo: 10_650, c1: 12_286.75, c2: 2_023.5, cuota: 10_263.25, tipoPct: 20.53 } },
  { n: '07 · 80.000 €: tramo 37 %',
    // RN = 80.000 − 4.000 − 2.000 = 74.000 → esc = 17.901,50 + 14.000×45 % (6.300) = 24.201,50 · cuota = 24.201,50 − 1.054,50 = 23.147 · /80.000 = 28,93375 % → 28,93
    RA: 80_000, SS: 4_000, s: sf(), x: { RN: 74_000, red: 0, base: 74_000, minimo: 5_550, c1: 24_201.5, c2: 1_054.5, cuota: 23_147, tipoPct: 28.93 } },
  { n: '08 · 400.000 €: tramo 47 %',
    // RN = 394.000 → esc = 125.901,50 + 94.000×47 % (44.180) = 170.081,50 · cuota = 169.027 · límite 85.3 = 43 %×(400.000 − 5.550) = 169.613,50 (no actúa) · /400.000 = 42,25675 % → 42,26
    RA: 400_000, SS: 4_000, s: sf(), x: { RN: 394_000, red: 0, base: 394_000, minimo: 5_550, c1: 170_081.5, c2: 1_054.5, cuota: 169_027, tipoPct: 42.26 } },
  { n: '09 · discapacidad 33 % (gastos +3.500, mínimo +3.000) y un hijo menor de 3 años',
    // RN = 26.000 − 1.826,48 − 2.000 − 3.500 = 18.673,52 → red = 2.364,34 − 1,14×1.000 = 1.224,34 · base 17.449,18
    // mínimo = 5.550 + 3.000 + 2.400 + 2.800 = 13.750 → esc = 2.365,50 + (13.750 − 12.450)×24 % (312) = 2.677,50
    // esc(17.449,18) = 2.365,50 + 4.999,18×24 % (1.199,8032) = 3.565,3032 → 3.565,30 · cuota 887,80 · /26.000 = 3,4146 % → 3,41
    RA: 26_000, SS: 1_826.48,
    s: sf({ discapacidad: '33', descendientes: [{ fechaNacimiento: '2024-06-01', discapacidad: 'ninguna', porEntero: true }] }),
    x: { RN: 18_673.52, red: 1_224.34, base: 17_449.18, minimo: 13_750, c1: 3_565.3, c2: 2_677.5, cuota: 887.8, tipoPct: 3.41 } },
  { n: '10 · contribuyente mayor de 75 años (mínimo 5.550 + 1.150 + 1.400)',
    // mínimo 8.100 → esc = 8.100×19 % = 1.539 · RN = 36.000 − 2.286 − 2.000 = 31.714 → esc = 4.225,50 + 11.514×30 % (3.454,20) = 7.679,70
    // cuota = 6.140,70 · /36.000 = 17,0575 % → 17,06
    RA: 36_000, SS: 2_286, s: sf({ fechaNacimientoContribuyente: '1950-02-02' }),
    x: { RN: 31_714, red: 0, base: 31_714, minimo: 8_100, c1: 7_679.7, c2: 1_539, cuota: 6_140.7, tipoPct: 17.06 } },
  { n: '11 · hipoteca anterior a 2013 con RA ≤ 33.007,20 € → −2 puntos',
    // RN = 28.000 − 1.778 − 2.000 = 24.222 → esc = 4.225,50 + 4.022×30 % (1.206,60) = 5.432,10 · cuota 4.377,60 · /28.000 = 15,63428… % → 15,63 − 2 = 13,63
    RA: 28_000, SS: 1_778, s: sf({ hipotecaViviendaAnterior2013: true }),
    x: { RN: 24_222, red: 0, base: 24_222, minimo: 5_550, c1: 5_432.1, c2: 1_054.5, cuota: 4_377.6, tipoPct: 13.63, avisos: ['reduccion_hipoteca_anterior_2013'] } },
  { n: '12 · contrato de duración inferior a un año → tipo mínimo 2 %',
    // RN = 17.000 − 1.080 − 2.000 = 13.920 → red 7.302 → base 6.618 → esc = 1.257,42 · cuota 202,92 · /17.000 = 1,19 % < 2 % → 2,00
    RA: 17_000, SS: 1_080, s: sf(), corto: true, x: { RN: 13_920, red: 7_302, base: 6_618, minimo: 5_550, c1: 1_257.42, c2: 1_054.5, cuota: 202.92, tipoPct: 2, avisos: ['tipo_minimo_contrato_corto'], pendientes: [SMI_REGLA] } },
  { n: '13 · 1.000.000 €: actúa el límite del art. 85.3',
    // sin límite: esc(994.000) = 125.901,50 + 694.000×47 % (326.180) = 452.081,50 → cuota 451.027
    // límite = 43 %×(1.000.000 − 5.550) = 427.613,50 → cuota = 427.613,50 · /1.000.000 = 42,76135 % → 42,76
    RA: 1_000_000, SS: 4_000, s: sf(), x: { RN: 994_000, red: 0, base: 994_000, minimo: 5_550, c1: 452_081.5, c2: 1_054.5, cuota: 427_613.5, tipoPct: 42.76, avisos: ['limite_art_85_3_aplicado'] } },
  { n: '14 · sobre el mínimo exento (ilustrativo 20.000 €): la retención no pasa del exceso',
    // RN = 20.100 − 1.277 − 2.000 = 16.823 → red = 7.302 − 1,75×1.971 = 3.852,75 · base 12.970,25 → esc = 2.365,50 + 520,25×24 % (124,86) = 2.490,36
    // cuota 1.435,86 → 7,1431 % · tope = (20.100 − 20.000)/20.100 = 0,4975 % → 0,49
    RA: 20_100, SS: 1_277, s: sf({ situacion: 2 }), x: { RN: 16_823, red: 3_852.75, base: 12_970.25, minimo: 5_550, c1: 2_490.36, c2: 1_054.5, cuota: 1_435.86, tipoPct: 0.49, avisos: ['limite_sobre_minimo_exento'] } },
  { n: '15 · ascendiente mayor de 75 que convive (1.150 + 1.400), 40.000 €',
    // mínimo = 5.550 + 2.550 = 8.100 · RN = 40.000 − 2.540 − 2.000 = 35.460 → esc = 8.725,50 + 260×37 % (96,20) = 8.821,70 · cuota = 8.821,70 − 1.539 = 7.282,70 · /40.000 = 18,2068 % → 18,21
    RA: 40_000, SS: 2_540, s: sf({ ascendientes: [{ fechaNacimiento: '1945-01-01', discapacidad: 'ninguna', porEntero: true, convive: true }] }),
    x: { RN: 35_460, red: 0, base: 35_460, minimo: 8_100, c1: 8_821.7, c2: 1_539, cuota: 7_282.7, tipoPct: 18.21 } },
  { n: '16 · pensión compensatoria al cónyuge (3.000 €) reduce la base',
    // RN = 22.000 − 1.826,48 − 2.000 = 18.173,52 → red = 2.364,34 − 1,14×500 = 1.794,34 · base = 18.173,52 − 1.794,34 − 3.000 = 13.379,18
    // esc = 2.365,50 + 929,18×24 % (223,0032) = 2.588,5032 → 2.588,50 · cuota 1.534 · /22.000 = 6,9727 % → 6,97
    RA: 22_000, SS: 1_826.48, s: sf({ pensionCompensatoriaAnual: E(3_000) }),
    x: { RN: 18_173.52, red: 1_794.34, base: 13_379.18, minimo: 5_550, c1: 2_588.5, c2: 1_054.5, cuota: 1_534, tipoPct: 6.97 } },
  { n: '17 · cuatro hijos (2.400 + 2.700 + 4.000 + 4.500), 60.000 €',
    // mínimo = 5.550 + 13.600 = 19.150 → esc = 2.365,50 + (19.150 − 12.450)×24 % (1.608) = 3.973,50 · RN = 60.000 − 3.810 − 2.000 = 54.190
    // esc = 8.725,50 + (54.190 − 35.200)×37 % (7.026,30) = 15.751,80 · cuota = 11.778,30 · /60.000 = 19,6305 % → 19,63
    RA: 60_000, SS: 3_810,
    s: sf({ situacion: 2, descendientes: ['2010-01-01', '2012-01-01', '2014-01-01', '2016-01-01'].map(f => ({ fechaNacimiento: f, discapacidad: 'ninguna' as const, porEntero: true })) }),
    x: { RN: 54_190, red: 0, base: 54_190, minimo: 19_150, c1: 15_751.8, c2: 3_973.5, cuota: 11_778.3, tipoPct: 19.63 } },
  { n: '18 · hipoteca anterior a 2013 pero RA > 33.007,20 €: no se reduce',
    // RA 35.000, SS 2.222,50 → RN = 30.777,50 → esc = 4.225,50 + 10.577,50×30 % (3.173,25) = 7.398,75 · cuota 6.344,25 · /35.000 = 18,1264 % → 18,13
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
      for (const a of c.x.avisos ?? []) expect(d.avisos).toContain(a)
      expect(d.cifrasPendientes).toEqual(c.x.pendientes ?? [])
    })
  }
  it('los casos con retribución > 20.048 € se calculan en modo CÁLCULO (tabla de prueba sin pendientes) y los demás bloquean por la deducción SMI', () => {
    for (const c of CASOS) {
      const e: EntradaIrpf = { retribucionAnual: E(c.RA), cotizacionesAnual: E(c.SS), situacion: c.s, duracionInferiorAño: c.corto }
      if (c.x.pendientes?.length) expect(() => calcularTipoIrpf(e, { año: 2026, modo: 'calculo', tabla: T }), c.n).toThrow(CifraPendienteError)
      else expect(calcularTipoIrpf(e, { año: 2026, modo: 'calculo', tabla: T }).cifrasPendientes, c.n).toEqual([])
    }
  })
})

describe('mínimo exento (art. 81.1)', () => {
  it('retribución ≤ límite → 0 % aunque el algoritmo diera más o el contrato sea corto', () => {
    const d = calcularTipoIrpf({ retribucionAnual: E(15_000), cotizacionesAnual: E(950), situacion: sf(), duracionInferiorAño: true }, { año: 2026, modo: 'simulacion', tabla: T })
    expect(d.tipoPpm).toBe(0)
    expect(d.motivo).toBe('minimo_exento')
  })
  it('justo en el límite ilustrativo (15.876 €) → 0 %; un euro por encima → tope = exceso / retribución', () => {
    const base = { cotizacionesAnual: E(1_000), situacion: sf(), duracionInferiorAño: true }
    const enLimite = calcularTipoIrpf({ ...base, retribucionAnual: EXENTO_ILUSTRATIVO['3:0'] }, { año: 2026, modo: 'simulacion', tabla: T })
    expect(enLimite.tipoPpm).toBe(0)
    expect(enLimite.motivo).toBe('minimo_exento')
    // 15.877 €: el 2 % del contrato corto daría 317,54 € pero solo se pueden retener 1 € → floor(1/15.877 = 0,0063 %) = 0,00 %
    expect(calcularTipoIrpf({ ...base, retribucionAnual: EXENTO_ILUSTRATIVO['3:0'] + 100 }, { año: 2026, modo: 'simulacion', tabla: T }).tipoPpm).toBe(0)
  })
  it('con hijos usa su columna (0/1/2+) y la situación: sit. 2 con 2 hijos → clave 2:2', () => {
    const hijos = ['2015-01-01', '2016-01-01'].map(f => ({ fechaNacimiento: f, discapacidad: 'ninguna' as const, porEntero: true }))
    const d = calcularTipoIrpf({ retribucionAnual: EXENTO_ILUSTRATIVO['2:2'], cotizacionesAnual: 0, situacion: sf({ situacion: 2, descendientes: hijos }) }, { año: 2026, modo: 'simulacion', tabla: T })
    expect(d.motivo).toBe('minimo_exento')
  })
  it('tabla 2026 REAL: el límite excluyente no tiene cifra verificada → no se aplica y queda pendiente (nunca se arrastra el de 2025)', () => {
    const d = calcularTipoIrpf({ retribucionAnual: E(15_000), cotizacionesAnual: E(950), situacion: sf() }, { año: 2026, modo: 'simulacion' })
    expect(d.cifrasPendientes).toContain('irpf_exento_3_0')
    expect(d.avisos).toContain('minimo_exento_desconocido')
    expect(Object.values(TABLA_IRPF_2026.exento).every(c => c?.valor === null && c.certeza === 'PENDIENTE_VERIFICAR')).toBe(true)
  })
})

describe('modelo 145 ausente → tipo máximo', () => {
  it('sin 145 el tipo es el máximo de la tabla (47 %) con aviso y regla pendiente', () => {
    const d = calcularTipoIrpf({ retribucionAnual: E(24_000), cotizacionesAnual: E(1_524), situacion: null }, { año: 2026, modo: 'simulacion', tabla: T })
    expect(d.tipoPpm).toBe(470_000)
    expect(d.motivo).toBe('sin_145_tipo_maximo')
    expect(d.avisos).toContain('sin_modelo_145_tipo_maximo')
    expect(d.cifrasPendientes).toEqual(['regla:irpf_sin_145'])
    expect(d.cuota).toBe(E(11_280)) // 24.000 × 47 %
  })
  it('es independiente del importe (ni mínimo exento ni reducciones) y bloquea en modo cálculo', () => {
    for (const ra of [5_000, 24_000, 150_000]) {
      const e: EntradaIrpf = { retribucionAnual: E(ra), cotizacionesAnual: 0, situacion: null }
      expect(calcularTipoIrpf(e, { año: 2026, modo: 'simulacion', tabla: T }).tipoPpm).toBe(470_000)
      expect(() => calcularTipoIrpf(e, { año: 2026, modo: 'calculo', tabla: T })).toThrow(CifraPendienteError)
    }
  })
  it('con 145 el tipo es menor que el máximo (la ausencia penaliza, no premia)', () => {
    const con = calcularTipoIrpf({ retribucionAnual: E(24_000), cotizacionesAnual: E(1_524), situacion: sf() }, { año: 2026, modo: 'simulacion', tabla: T })
    expect(con.tipoPpm).toBeLessThan(470_000)
  })
})

describe('fail-closed', () => {
  it('la tabla 2026 real es siempre PENDIENTE: modo cálculo lanza; simulación lista las claves', () => {
    const e: EntradaIrpf = { retribucionAnual: E(30_000), cotizacionesAnual: E(1_905), situacion: sf() }
    expect(() => calcularTipoIrpf(e, { año: 2026, modo: 'calculo' })).toThrow(CifraPendienteError)
    const d = calcularTipoIrpf(e, { año: 2026, modo: 'simulacion' })
    expect(d.cifrasPendientes).toContain('irpf_limite_853_pct')
    expect(d.tipoPpm).toBe(164_700) // mismo resultado que el caso 05: las pendientes no cambian la cuenta
  })
  it('cifra sin valor (null) lanza CifraDesconocidaError en cualquier modo', () => {
    const t = tablaIrpfDePrueba()
    t.minimos.personal.valor = null
    expect(() => calcularTipoIrpf({ retribucionAnual: E(30_000), cotizacionesAnual: 0, situacion: sf() }, { año: 2026, modo: 'simulacion', tabla: t })).toThrow(CifraDesconocidaError)
  })
  it('año sin tabla → error (no se usa la de otro año) y tabla de otro año → error', () => {
    expect(() => tablaIrpfDelAño(2025)).toThrow(TablaNoDisponibleError)
    expect(() => calcularTipoIrpf({ retribucionAnual: E(30_000), cotizacionesAnual: 0, situacion: sf() }, { año: 2027, modo: 'simulacion' })).toThrow(TablaNoDisponibleError)
    expect(() => calcularTipoIrpf({ retribucionAnual: E(30_000), cotizacionesAnual: 0, situacion: sf() }, { año: 2027, modo: 'simulacion', tabla: T })).toThrow(/Tabla IRPF de 2026/)
  })
  it('anualidades por alimentos: regla pendiente (no implementada)', () => {
    const d = calcularTipoIrpf({ retribucionAnual: E(30_000), cotizacionesAnual: 0, situacion: sf({ anualidadesAlimentosAnual: E(1_200) }) }, { año: 2026, modo: 'simulacion', tabla: T })
    expect(d.cifrasPendientes).toContain('regla:irpf_anualidades_alimentos')
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
  const ESPERADO: Record<string, [unknown, string]> = {
  irpf_escala_1_hasta: [1245000, 'probable'],
  irpf_escala_1_tipo: [190000, 'probable'],
  irpf_escala_2_hasta: [2020000, 'probable'],
  irpf_escala_2_tipo: [240000, 'probable'],
  irpf_escala_3_hasta: [3520000, 'probable'],
  irpf_escala_3_tipo: [300000, 'probable'],
  irpf_escala_4_hasta: [6000000, 'probable'],
  irpf_escala_4_tipo: [370000, 'probable'],
  irpf_escala_5_hasta: [30000000, 'probable'],
  irpf_escala_5_tipo: [450000, 'probable'],
  irpf_escala_6_tipo: [470000, 'probable'],
  irpf_tipo_maximo: [470000, 'probable'],
  irpf_tipo_min_contrato_corto: [20000, 'probable'],
  irpf_gastos_otros: [200000, 'probable'],
  irpf_gastos_disc33: [350000, 'probable'],
  irpf_gastos_disc65: [775000, 'probable'],
  irpf_red20_umbral1: [1485200, 'probable'],
  irpf_red20_max: [730200, 'probable'],
  irpf_red20_umbral2: [1767352, 'probable'],
  irpf_red20_factor1: [1750000, 'probable'],
  irpf_red20_en_umbral2: [236434, 'probable'],
  irpf_red20_umbral3: [1974750, 'probable'],
  irpf_red20_factor2: [1140000, 'probable'],
  irpf_min_personal: [555000, 'probable'],
  irpf_min_mayor65: [115000, 'probable'],
  irpf_min_mayor75: [140000, 'probable'],
  irpf_min_disc33: [300000, 'probable'],
  irpf_min_disc65: [900000, 'probable'],
  irpf_min_asistencia: [300000, 'probable'],
  irpf_min_desc_1: [240000, 'probable'],
  irpf_min_desc_2: [270000, 'probable'],
  irpf_min_desc_3: [400000, 'probable'],
  irpf_min_desc_4: [450000, 'probable'],
  irpf_min_desc_menor3: [280000, 'probable'],
  irpf_min_asc: [115000, 'probable'],
  irpf_min_asc_mayor75: [140000, 'probable'],
  irpf_hipoteca_reduccion_tipo: [20000, 'probable'],
  irpf_hipoteca_limite: [3300720, 'probable'],
  irpf_limite_853_pct: [430000, P],
  irpf_exento_1_1: [null, P],
  irpf_exento_1_2: [null, P],
  irpf_exento_2_0: [null, P],
  irpf_exento_2_1: [null, P],
  irpf_exento_2_2: [null, P],
  irpf_exento_3_0: [null, P],
  irpf_deduccion_smi_max: [59089, P],
  irpf_deduccion_smi_hasta: [2004800, P],
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
  it('toda cifra cita fuente y la escala es creciente y coherente (cuotas acumuladas del comentario de cabecera)', () => {
    for (const c of cifras().values()) expect(c.fuente.length, c.clave).toBeGreaterThan(10)
    const altos = TABLA_IRPF_2026.escala.map(t => t.hasta?.valor ?? Infinity)
    expect([...altos].sort((a, b) => a - b)).toEqual(altos)
    expect(altos.at(-1)).toBe(Infinity)
  })
})
