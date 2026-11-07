import { vi, describe, it, expect } from 'vitest'
vi.mock('@/lib/prisma', () => ({ prisma: {} }))

import { parsePeriodo, periodoActual } from '@/lib/nominas'

describe('parsePeriodo', () => {
  it('parsea un período válido', () => {
    expect(parsePeriodo('2026-06')).toEqual({ year: 2026, month: 6 })
    expect(parsePeriodo('2025-12')).toEqual({ year: 2025, month: 12 })
    expect(parsePeriodo('2026-01')).toEqual({ year: 2026, month: 1 })
  })

  it('rechaza formatos incorrectos', () => {
    expect(() => parsePeriodo('2026-6')).toThrow('inválido')
    expect(() => parsePeriodo('26-06')).toThrow('inválido')
    expect(() => parsePeriodo('2026/06')).toThrow('inválido')
    expect(() => parsePeriodo('abcd-ef')).toThrow('inválido')
  })

  it('rechaza meses fuera de rango', () => {
    expect(() => parsePeriodo('2026-00')).toThrow('inválido')
    expect(() => parsePeriodo('2026-13')).toThrow('inválido')
  })
})

describe('periodoActual', () => {
  it('devuelve formato YYYY-MM', () => {
    expect(periodoActual()).toMatch(/^\d{4}-\d{2}$/)
  })

  it('mes está en rango 01-12', () => {
    const m = parseInt(periodoActual().split('-')[1])
    expect(m).toBeGreaterThanOrEqual(1)
    expect(m).toBeLessThanOrEqual(12)
  })
})

import { AVISO_145_ILEGIBLE, contratoDeFila, filaASituacionFamiliar, irpfAlgoritmoPara, mesesEntre, tocaEnPeriodo, ultimoDiaPeriodo } from '@/lib/nominas'

describe('incidencias recurrentes', () => {
  const o = (periodicidad: string | null, recurrenteHasta: string | null = null) => ({ periodoOrigen: '2026-01', periodicidad, recurrenteHasta })
  it('mensual: todos los meses siguientes, nunca el mismo ni anteriores', () => {
    expect(tocaEnPeriodo(o('mensual'), '2026-01')).toBe(false)
    expect(tocaEnPeriodo(o('mensual'), '2025-12')).toBe(false)
    expect(tocaEnPeriodo(o('mensual'), '2026-02')).toBe(true)
    expect(tocaEnPeriodo(o('mensual'), '2027-07')).toBe(true)
  })
  it('trimestral / anual', () => {
    expect(['2026-02', '2026-03', '2026-04', '2026-07'].map(p => tocaEnPeriodo(o('trimestral'), p))).toEqual([false, false, true, true])
    expect(['2026-12', '2027-01', '2028-01'].map(p => tocaEnPeriodo(o('anual'), p))).toEqual([false, true, true])
  })
  it('«hasta» incluido; puntual (null) o valor raro → no se copia', () => {
    expect(tocaEnPeriodo(o('mensual', '2026-03'), '2026-03')).toBe(true)
    expect(tocaEnPeriodo(o('mensual', '2026-03'), '2026-04')).toBe(false)
    expect(tocaEnPeriodo(o(null), '2026-02')).toBe(false)
    expect(tocaEnPeriodo(o('semanal'), '2026-02')).toBe(false)
  })
  it('utilidades de periodo', () => {
    expect(mesesEntre('2025-11', '2026-02')).toBe(3)
    expect(ultimoDiaPeriodo('2026-02')).toBe('2026-02-28')
    expect(ultimoDiaPeriodo('2028-02')).toBe('2028-02-29')
    expect(ultimoDiaPeriodo('2026-12')).toBe('2026-12-31')
  })
})

describe('modelo 145 → irpfAlgoritmo', () => {
  const fila = (p: Record<string, unknown> = {}) => ({
    vigente_desde: new Date('2026-01-01T00:00:00Z'), vigente_hasta: null, situacion: 2, fecha_nacimiento_contribuyente: '1985-04-02',
    discapacidad: 'ninguna', necesita_asistencia: false, datos: { descendientes: [{ fechaNacimiento: '2015-01-01', discapacidad: 'ninguna', porEntero: true }], ascendientes: [] },
    pension_compensatoria_cent: BigInt(120_000), anualidades_alimentos_cent: BigInt(0), hipoteca_vivienda_anterior_2013: false, firma_documento_id: null, ...p,
  })
  const temporal = { duracion: 'temporal' as const, fechaInicio: new Date('2026-01-01T00:00:00Z'), fechaFin: new Date('2026-06-30T00:00:00Z') }
  const sinFechas = { duracion: null, fechaInicio: null, fechaFin: null }

  it('mapea la fila: fechas ISO y céntimos enteros (BIGINT → number)', () => {
    const s = filaASituacionFamiliar(fila())
    expect(s.vigenteDesde).toBe('2026-01-01')
    expect(s.vigenteHasta).toBeNull()
    expect(s.situacion).toBe(2)
    expect(s.pensionCompensatoriaAnual).toBe(120_000)
    expect(s.descendientes).toHaveLength(1)
    expect(filaASituacionFamiliar(fila({ datos: null })).descendientes).toEqual([])
  })
  it('elige el 145 vigente al ÚLTIMO día del periodo', () => {
    const h = [
      filaASituacionFamiliar(fila({ vigente_hasta: '2026-03-15' })),
      filaASituacionFamiliar(fila({ vigente_desde: '2026-03-16', situacion: 3 })),
    ]
    expect(irpfAlgoritmoPara(h, '2026-02', sinFechas)?.situacion?.situacion).toBe(2)
    expect(irpfAlgoritmoPara(h, '2026-03', sinFechas)?.situacion?.situacion).toBe(3)
  })
  it('tabla leída sin 145 vigente → situacion null (regla de ausencia); tabla ilegible → undefined (no se afirma «sin 145»)', () => {
    expect(irpfAlgoritmoPara([], '2026-02', sinFechas)).toEqual({ situacion: null })
    expect(irpfAlgoritmoPara(null, '2026-02', sinFechas)).toBeUndefined()
    expect(AVISO_145_ILEGIBLE).toMatch(/^irpf:/)
  })
  it('duración inferior al año solo si se sabe', () => {
    expect(irpfAlgoritmoPara([], '2026-02', temporal)).toEqual({ situacion: null, duracionInferiorAño: true })
    expect(irpfAlgoritmoPara([], '2026-02', sinFechas)).not.toHaveProperty('duracionInferiorAño')
  })
})

describe('contratoDeFila', () => {
  const c = { tipo_contrato: 'parcial', jornada_pct: '50', salario_base: '1800.00', grupo_cotizacion: 5, irpf_retencion_pct: '12', conceptos_fijos: [] }
  it('parcial sin duración no inventa «indefinido»; con duración la pasa al motor', () => {
    expect(contratoDeFila(c).laboral.duracion).toBeUndefined()
    expect(contratoDeFila({ ...c, duracion: 'temporal', fecha_fin: '2026-12-31' }).laboral.duracion).toBe('temporal')
    expect(contratoDeFila({ ...c, duracion: 'temporal', fecha_fin: '2026-12-31' }).fechaFin?.toISOString().slice(0, 10)).toBe('2026-12-31')
    expect(contratoDeFila(c).laboral.salarioBase).toBe(1800)
  })
})
