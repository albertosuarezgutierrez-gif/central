// Reglas PURAS de «visible para el empleado» (migración 0029). Sin BD.
import { describe, it, expect } from 'vitest'
import {
  empleadoPuedeVerDocumento, normalizarVisible, validarVisibilidad, CARPETA_SIEMPRE_VISIBLE,
} from '@/lib/visibilidad-documento'

describe('normalizarVisible: por defecto VISIBLE (comportamiento anterior)', () => {
  it('solo un false explícito oculta', () => {
    expect(normalizarVisible(undefined)).toBe(true)
    expect(normalizarVisible(null)).toBe(true)
    expect(normalizarVisible(true)).toBe(true)
    expect(normalizarVisible(false)).toBe(false)
    expect(normalizarVisible('0')).toBe(false)
    expect(normalizarVisible('false')).toBe(false)
    expect(normalizarVisible('1')).toBe(true)
    expect(normalizarVisible('true')).toBe(true)
    expect(normalizarVisible('')).toBe(true)
  })
})

describe('empleadoPuedeVerDocumento', () => {
  it('visible → sí; oculto → no', () => {
    expect(empleadoPuedeVerDocumento({ carpeta: 'contratos', visible_empleado: true })).toBe(true)
    expect(empleadoPuedeVerDocumento({ carpeta: 'contratos', visible_empleado: false })).toBe(false)
  })
  it('valor ausente (fila antigua) → visible', () => {
    expect(empleadoPuedeVerDocumento({ carpeta: 'contratos' })).toBe(true)
    expect(empleadoPuedeVerDocumento({ carpeta: 'contratos', visible_empleado: null })).toBe(true)
  })
  it('las nóminas se ven SIEMPRE', () => {
    expect(CARPETA_SIEMPRE_VISIBLE).toBe('nominas')
    expect(empleadoPuedeVerDocumento({ carpeta: 'nominas', visible_empleado: false })).toBe(true)
  })
})

describe('validarVisibilidad: requiere firma ⇒ visible', () => {
  it('oculto + sin firma → ok', () => {
    expect(validarVisibilidad({ carpeta: 'contratos', visible: false, firma: 'no_requiere' })).toBeNull()
  })
  for (const firma of ['pendiente', 'pendiente_empresa', 'firmado', 'solo_empleado', 'empresa_y_empleado']) {
    it(`oculto + ${firma} → error`, () => {
      expect(validarVisibilidad({ carpeta: 'contratos', visible: false, firma })).toMatch(/firma.*visible/i)
    })
  }
  it('visible + firma → ok', () => {
    expect(validarVisibilidad({ carpeta: 'contratos', visible: true, firma: 'pendiente' })).toBeNull()
  })
  it('nóminas no se pueden ocultar', () => {
    expect(validarVisibilidad({ carpeta: 'nominas', visible: false, firma: 'no_requiere' })).toMatch(/nóminas/i)
    expect(validarVisibilidad({ carpeta: 'nominas', visible: true, firma: 'no_requiere' })).toBeNull()
  })
  it('modo de firma "none" / "no_requiere" no cuenta como firma', () => {
    expect(validarVisibilidad({ carpeta: 'x', visible: false, firma: 'none' })).toBeNull()
  })
})
