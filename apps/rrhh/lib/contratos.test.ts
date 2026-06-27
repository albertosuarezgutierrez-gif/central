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
