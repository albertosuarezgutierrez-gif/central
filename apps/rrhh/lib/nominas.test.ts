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
