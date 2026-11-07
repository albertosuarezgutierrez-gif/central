/**
 * Finiquito (ET arts. 38, 49.1.c, 53, 56 y DT 11.ª; LIRPF art. 7.e). Fechas INYECTADAS (nada de reloj). Cálculos a mano.
 * Salario de referencia: 2.000 €/mes, 28.000 €/año (14 pagas) → salario diario 28.000/365 = 76,7123 €.
 */
import { describe, it, expect } from 'vitest'
import { CifraPendienteError } from './cifras'
import { calcularFiniquito, diasInclusive, mesesDeServicio, LIMITE_EXENCION_INDEMNIZACION, type EntradaFiniquito } from './finiquito'

const base = (p: Partial<EntradaFiniquito>): EntradaFiniquito => ({
  fechaAntiguedad: '2026-01-01', fechaBaja: '2026-06-30', causa: { tipo: 'dimision' },
  salarioMensual: 200_000, salarioAnual: 2_800_000, pagasExtra: [], vacaciones: { diasAnuales: 30, diasDisfrutados: 0 }, ...p,
})
const FRACCION = 'regla:finiquito_fraccion_mes'

describe('fechas', () => {
  it('días inclusive y meses de servicio (fracción aparte)', () => {
    expect(diasInclusive('2026-01-01', '2026-06-30')).toBe(181)
    expect(diasInclusive('2026-02-01', '2026-01-31')).toBe(0)
    expect(mesesDeServicio('2020-03-01', '2026-02-28')).toEqual({ completos: 72, diasResto: 0 })
    expect(mesesDeServicio('2020-01-31', '2020-02-28')).toEqual({ completos: 1, diasResto: 0 })
    expect(mesesDeServicio('2026-01-01', '2026-01-01')).toEqual({ completos: 0, diasResto: 1 })
    expect(mesesDeServicio('2015-01-10', '2026-11-06')).toEqual({ completos: 141, diasResto: 28 })
  })
})

describe('dimisión: vacaciones + pagas devengadas, sin indemnización', () => {
  it('alta 01/01, baja 30/06, 30 días/año, 10 disfrutados, verano (ene-jun) y navidad (anual) pendientes', () => {
    // vacaciones: 30 × 181/365 = 14,88 devengados; pendientes (5.430 − 3.650)/365 = 4,8767 días × 2.000×12/365 = 320,66 €
    // verano 181/181 × 2.000 = 2.000 · navidad 181/365 × 2.000 = 991,78 · total 3.312,44 €
    const f = calcularFiniquito(base({
      vacaciones: { diasAnuales: 30, diasDisfrutados: 10 },
      pagasExtra: [
        { concepto: 'Verano', importe: 200_000, inicioDevengo: '2026-01-01', finDevengo: '2026-06-30' },
        { concepto: 'Navidad', importe: 200_000, inicioDevengo: '2026-01-01', finDevengo: '2026-12-31' },
      ],
    }), 'calculo')
    expect(f.vacaciones).toEqual({ diasDevengados: 14.88, diasPendientes: 4.88, importe: 32_066 })
    expect(f.pagasExtra.map(p => p.importe)).toEqual([200_000, 99_178])
    expect(f.indemnizacion).toMatchObject({ obligatoria: 0, pagada: 0, exenta: 0, sujeta: 0 })
    expect(f.total).toBe(331_244)
    expect(f.cifrasPendientes).toEqual([])
  })
  it('valor del día de vacaciones del convenio (70 €): 4,8767 × 70 = 341,37 €; disfrutar de más da importe negativo con aviso', () => {
    const f = calcularFiniquito(base({ vacaciones: { diasAnuales: 30, diasDisfrutados: 10, valorDiaVacaciones: 7_000 } }), 'calculo')
    expect(f.vacaciones.importe).toBe(34_137)
    const g = calcularFiniquito(base({ vacaciones: { diasAnuales: 30, diasDisfrutados: 20 } }), 'calculo')
    expect(g.vacaciones.importe).toBeLessThan(0)
    expect(g.avisos).toContain('vacaciones_disfrutadas_de_mas')
  })
  it('la antigüedad posterior al inicio del periodo de devengo de la paga recorta la parte devengada', () => {
    // alta 01/04, baja 30/06 → navidad 91/365 × 2.000 = 498,63
    const f = calcularFiniquito(base({ fechaAntiguedad: '2026-04-01', pagasExtra: [{ concepto: 'Navidad', importe: 200_000, inicioDevengo: '2026-01-01', finDevengo: '2026-12-31' }] }), 'calculo')
    expect(f.pagasExtra[0]).toMatchObject({ diasDevengados: 91, importe: 49_863 })
  })
})

describe('fin de contrato temporal (art. 49.1.c ET: 12 días/año, parte proporcional)', () => {
  it('un año (365 días): 12 × 76,7123 = 920,55 €; la exención del art. 7.e queda PENDIENTE (doctrina, no ley)', () => {
    const e = base({ fechaAntiguedad: '2025-07-01', fechaBaja: '2026-06-30', causa: { tipo: 'fin_contrato_temporal', modalidad: 'ordinaria' } })
    const f = calcularFiniquito(e, 'simulacion')
    expect(f.indemnizacion).toMatchObject({ dias: 12, obligatoria: 92_055, exenta: 92_055, sujeta: 0 })
    expect(f.cifrasPendientes).toEqual(['regla:finiquito_exencion_fin_contrato'])
    expect(() => calcularFiniquito(e, 'calculo')).toThrow(CifraPendienteError)
  })
  it('sustitución y formativos: sin indemnización', () => {
    for (const modalidad of ['sustitucion', 'formativo'] as const) {
      const f = calcularFiniquito(base({ fechaAntiguedad: '2025-07-01', causa: { tipo: 'fin_contrato_temporal', modalidad } }), 'calculo')
      expect(f.indemnizacion.obligatoria).toBe(0)
    }
  })
})

describe('despido objetivo (art. 53.1.b ET: 20 días/año, máx. 12 mensualidades)', () => {
  const seis = { fechaAntiguedad: '2020-03-01', fechaBaja: '2026-02-28' } // 72 meses exactos
  it('6 años exactos: 120 días = 9.205,48 €, exenta entera; sin fracción de mes no hay pendientes', () => {
    const f = calcularFiniquito(base({ ...seis, causa: { tipo: 'objetivo', causa52c: false } }), 'calculo')
    expect(f.indemnizacion).toMatchObject({ dias: 120, obligatoria: 920_548, pagada: 920_548, exenta: 920_548, sujeta: 0, topeAplicado: false })
  })
  it('pagada de más (15.000 €): sin 52.c tributa el exceso; con 52.c exenta hasta el límite del improcedente (198 días = 15.189,04 €)', () => {
    const sin = calcularFiniquito(base({ ...seis, causa: { tipo: 'objetivo', causa52c: false }, indemnizacionPagada: 1_500_000 }), 'calculo')
    expect(sin.indemnizacion).toMatchObject({ exenta: 920_548, sujeta: 579_452 })
    expect(sin.avisos).toContain('indemnizacion_superior_a_la_obligatoria')
    const con = calcularFiniquito(base({ ...seis, causa: { tipo: 'objetivo', causa52c: true }, indemnizacionPagada: 1_600_000 }), 'calculo')
    expect(con.indemnizacion).toMatchObject({ exenta: 1_518_904, sujeta: 81_096 })
  })
  it('36 años: 720 días → tope de 12 mensualidades (= salario anual 28.000 €)', () => {
    const f = calcularFiniquito(base({ fechaAntiguedad: '1990-03-01', fechaBaja: '2026-02-28', causa: { tipo: 'objetivo', causa52c: false } }), 'calculo')
    expect(f.indemnizacion).toMatchObject({ dias: 720, obligatoria: 2_800_000, topeAplicado: true })
  })
})

describe('despido improcedente (art. 56.1 ET: 33 días/año, máx. 24 mensualidades; DT 11.ª)', () => {
  it('posterior a 2012 con fracción de mes: 141 meses + 28 días → 142 meses → 390,5 días = 29.956,16 €; fracción PENDIENTE', () => {
    const e = base({ fechaAntiguedad: '2015-01-10', fechaBaja: '2026-11-06', causa: { tipo: 'improcedente', via: 'sentencia' } })
    const f = calcularFiniquito(e, 'simulacion')
    expect(f.indemnizacion).toMatchObject({ dias: 390.5, obligatoria: 2_995_616, exenta: 2_995_616, sujeta: 0 })
    expect(f.cifrasPendientes).toEqual([FRACCION])
    expect(() => calcularFiniquito(e, 'calculo')).toThrow(CifraPendienteError)
  })
  it('reconocida por la empresa sin conciliación administrativa: no es cuantía obligatoria → no exenta', () => {
    const f = calcularFiniquito(base({ fechaAntiguedad: '2020-03-01', fechaBaja: '2026-02-28', causa: { tipo: 'improcedente', via: 'reconocimiento_empresa' } }), 'calculo')
    expect(f.indemnizacion).toMatchObject({ dias: 198, obligatoria: 1_518_904, exenta: 0, sujeta: 1_518_904 })
    expect(f.avisos).toContain('improcedencia_sin_conciliacion_no_exenta')
    const c = calcularFiniquito(base({ fechaAntiguedad: '2020-03-01', fechaBaja: '2026-02-28', causa: { tipo: 'improcedente', via: 'conciliacion_administrativa' } }), 'calculo')
    expect(c.indemnizacion.exenta).toBe(1_518_904)
  })
  it('DT 11.ª, antigüedad 2000: 45 × 146 meses (547,5 d) + 33 × 168 meses (462 d) = 1.009,5 d → tope 720 días = 55.232,88 €', () => {
    const f = calcularFiniquito(base({ fechaAntiguedad: '2000-01-01', fechaBaja: '2026-01-31', causa: { tipo: 'improcedente', via: 'sentencia' } }), 'simulacion')
    expect(f.indemnizacion).toMatchObject({ dias: 1_009.5, obligatoria: 5_523_288, topeAplicado: true })
  })
  it('DT 11.ª, antigüedad 1990: el tramo anterior (45 × 266 meses = 997,5 d > 720) es el tope: 76.520,55 € (< 42 mensualidades)', () => {
    const f = calcularFiniquito(base({ fechaAntiguedad: '1990-01-01', fechaBaja: '2026-01-31', causa: { tipo: 'improcedente', via: 'sentencia' } }), 'simulacion')
    expect(f.indemnizacion).toMatchObject({ obligatoria: 7_652_055, topeAplicado: true })
  })
  it('exención con límite de 180.000 € (salario 200.000 €/año, 14 años exactos: 462 días = 253.150,68 €)', () => {
    const f = calcularFiniquito(base({ fechaAntiguedad: '2012-03-01', fechaBaja: '2026-02-28', salarioAnual: 20_000_000, causa: { tipo: 'improcedente', via: 'sentencia' } }), 'calculo')
    expect(f.indemnizacion).toMatchObject({ dias: 462, obligatoria: 25_315_068, exenta: LIMITE_EXENCION_INDEMNIZACION, sujeta: 7_315_068 })
    expect(f.avisos).toContain('limite_exencion_180000')
  })
})

describe('validación', () => {
  it('fechas imposibles, baja anterior a la antigüedad, importes no enteros → error', () => {
    expect(() => calcularFiniquito(base({ fechaBaja: '2025-12-31' }), 'calculo')).toThrow()
    expect(() => calcularFiniquito(base({ fechaBaja: '2026-02-30' }), 'calculo')).toThrow(/Fecha inválida/)
    expect(() => calcularFiniquito(base({ salarioAnual: 10.5 }), 'calculo')).toThrow()
    expect(() => calcularFiniquito(base({ indemnizacionPagada: -1 }), 'calculo')).toThrow()
    expect(() => calcularFiniquito(base({ pagasExtra: [{ concepto: 'x', importe: 1, inicioDevengo: '2026-06-30', finDevengo: '2026-01-01' }] }), 'calculo')).toThrow(/vacío/)
  })
})
