import { vi, describe, it, expect } from 'vitest'
vi.mock('@/lib/prisma', () => ({ prisma: {} }))

import { parsearDatosContrato } from '@/lib/contratos'

const base = {
  salarioBase: 1800,
  grupoCotizacion: 5,
  tipoContrato: 'indefinido',
  jornadaPct: 100,
  irpfRetencionPct: 15,
  vigenteDesde: '2026-01-01',
  conceptosFijos: [],
}

describe('parsearDatosContrato', () => {
  it('parsea un contrato válido', () => {
    const c = parsearDatosContrato(base)
    expect(c.salarioBase).toBe(1800)
    expect(c.grupoCotizacion).toBe(5)
    expect(c.tipoContrato).toBe('indefinido')
    expect(c.jornadaPct).toBe(100)
    expect(c.irpfRetencionPct).toBe(15)
    expect(c.vigenteDesde).toBeInstanceOf(Date)
    expect(c.conceptosFijos).toEqual([])
    expect(c.categoriaConvenio).toBeNull()
  })

  it('normaliza categoriaConvenio vacío a null', () => {
    expect(parsearDatosContrato({ ...base, categoriaConvenio: '' }).categoriaConvenio).toBeNull()
    expect(parsearDatosContrato({ ...base, categoriaConvenio: 'Grupo I' }).categoriaConvenio).toBe('Grupo I')
  })

  it('rechaza salarioBase <= 0', () => {
    expect(() => parsearDatosContrato({ ...base, salarioBase: 0 })).toThrow('salarioBase')
    expect(() => parsearDatosContrato({ ...base, salarioBase: -100 })).toThrow('salarioBase')
  })

  it('rechaza grupoCotizacion fuera de 1-11', () => {
    expect(() => parsearDatosContrato({ ...base, grupoCotizacion: 0 })).toThrow('grupoCotizacion')
    expect(() => parsearDatosContrato({ ...base, grupoCotizacion: 12 })).toThrow('grupoCotizacion')
  })

  it('rechaza tipoContrato inválido', () => {
    expect(() => parsearDatosContrato({ ...base, tipoContrato: 'obra' })).toThrow('tipoContrato')
  })

  it('rechaza jornadaPct fuera de rango', () => {
    expect(() => parsearDatosContrato({ ...base, jornadaPct: 0 })).toThrow('jornadaPct')
    expect(() => parsearDatosContrato({ ...base, jornadaPct: 101 })).toThrow('jornadaPct')
  })

  it('rechaza irpfRetencionPct > 45', () => {
    expect(() => parsearDatosContrato({ ...base, irpfRetencionPct: 46 })).toThrow('irpfRetencionPct')
  })

  it('rechaza fecha inválida', () => {
    expect(() => parsearDatosContrato({ ...base, vigenteDesde: 'not-a-date' })).toThrow('fecha')
  })
})

import { duracionDe, duracionInferiorAnio } from '@/lib/contratos'

describe('fechas y duración del contrato (0033)', () => {
  it('sin fechas ni duración: fechas null y la duración la da el tipo (parcial → null, «no se sabe»)', () => {
    const c = parsearDatosContrato(base)
    expect(c.fechaInicio).toBeNull()
    expect(c.fechaFin).toBeNull()
    expect(c.duracion).toBe('indefinido')
    expect(parsearDatosContrato({ ...base, tipoContrato: 'parcial' }).duracion).toBeNull()
  })
  it('parcial con duración explícita; tipo y duración contradictorios → error', () => {
    expect(parsearDatosContrato({ ...base, tipoContrato: 'parcial', duracion: 'temporal' }).duracion).toBe('temporal')
    expect(() => parsearDatosContrato({ ...base, tipoContrato: 'indefinido', duracion: 'temporal' })).toThrow('duracion')
    expect(() => duracionDe('obra', 'parcial')).toThrow('duracion')
  })
  it('un indefinido no lleva fecha de fin; fin anterior al inicio → error', () => {
    expect(() => parsearDatosContrato({ ...base, fechaFin: '2026-12-31' })).toThrow('indefinido')
    expect(() => parsearDatosContrato({ ...base, tipoContrato: 'temporal', fechaInicio: '2026-06-01', fechaFin: '2026-05-31' })).toThrow('fechaFin')
    expect(() => parsearDatosContrato({ ...base, tipoContrato: 'temporal', fechaFin: '2026-02-30' })).toThrow('fecha')
    const t = parsearDatosContrato({ ...base, tipoContrato: 'temporal', fechaInicio: '2026-06-01', fechaFin: '2026-11-30' })
    expect(t.fechaFin?.toISOString().slice(0, 10)).toBe('2026-11-30')
  })
  it('duracionInferiorAnio: true/false solo con datos; undefined = no se sabe', () => {
    const d = (s: string) => new Date(`${s}T00:00:00Z`)
    expect(duracionInferiorAnio({ duracion: 'temporal', fechaInicio: d('2026-01-01'), fechaFin: d('2026-06-30') })).toBe(true)
    expect(duracionInferiorAnio({ duracion: 'temporal', fechaInicio: d('2026-01-01'), fechaFin: d('2026-12-31') })).toBe(false)
    expect(duracionInferiorAnio({ duracion: 'temporal', fechaInicio: d('2026-01-01'), fechaFin: d('2026-12-30') })).toBe(true)
    expect(duracionInferiorAnio({ duracion: 'temporal', fechaInicio: d('2026-01-01'), fechaFin: null })).toBeUndefined()
    expect(duracionInferiorAnio({ duracion: null, fechaInicio: d('2026-01-01'), fechaFin: d('2026-03-01') })).toBeUndefined()
    expect(duracionInferiorAnio({ duracion: 'indefinido', fechaInicio: null, fechaFin: null })).toBe(false)
  })
})
