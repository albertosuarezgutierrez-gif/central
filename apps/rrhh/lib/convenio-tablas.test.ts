import { describe, it, expect } from 'vitest'
import { categoriasDelAnio, eurosTextoACentimos, parsearFilaConvenio, proponerSalario, type FilaTablaConvenio } from './convenio-tablas'

const fila = (p: Partial<FilaTablaConvenio> = {}): FilaTablaConvenio => ({
  convenio: 'Hostelería Sevilla', anio: 2026, categoria: 'Camarero', salarioBaseCent: 145_050, plusConvenioCent: null, pagas: null, ...p,
})

describe('eurosTextoACentimos (sin float)', () => {
  it('formatos español e inglés', () => {
    expect(eurosTextoACentimos('1.234,56')).toBe(123_456)
    expect(eurosTextoACentimos('1234,5')).toBe(123_450)
    expect(eurosTextoACentimos('1234.56')).toBe(123_456)
    expect(eurosTextoACentimos('1.450,50 €')).toBe(145_050)
    expect(eurosTextoACentimos(0.1 + 0.2)).toBe(30)
  })
  it('basura → null', () => {
    expect(eurosTextoACentimos('')).toBeNull()
    expect(eurosTextoACentimos('12,345')).toBeNull()
    expect(eurosTextoACentimos('abc')).toBeNull()
    expect(eurosTextoACentimos(undefined)).toBeNull()
  })
})

describe('parsearFilaConvenio', () => {
  it('valida y deja NULL lo que no se sabe (no 0 ni 12)', () => {
    const f = parsearFilaConvenio({ convenio: ' Hostelería ', anio: '2026', categoria: '  Camarero   II ', salarioBase: '1.450,50', plusConvenio: '', pagas: '' })
    expect(f).toEqual({ convenio: 'Hostelería', anio: 2026, categoria: 'Camarero II', salarioBaseCent: 145_050, plusConvenioCent: null, pagas: null })
  })
  it('rechaza salario 0, año raro y pagas fuera de catálogo', () => {
    expect(() => parsearFilaConvenio({ convenio: 'x', anio: 2026, categoria: 'c', salarioBase: '0' })).toThrow('Salario')
    expect(() => parsearFilaConvenio({ convenio: 'x', anio: 1999, categoria: 'c', salarioBase: '1' })).toThrow('Año')
    expect(() => parsearFilaConvenio({ convenio: 'x', anio: 2026, categoria: 'c', salarioBase: '1', pagas: 13 })).toThrow('Pagas')
    expect(() => parsearFilaConvenio({ convenio: '', anio: 2026, categoria: 'c', salarioBase: '1' })).toThrow('convenio')
  })
})

describe('proponerSalario', () => {
  const filas = [fila(), fila({ anio: 2025, salarioBaseCent: 140_000 }), fila({ categoria: 'Cocinero', salarioBaseCent: 160_000 })]
  it('categoría + año exactos (sin distinguir mayúsculas ni espacios)', () => {
    const p = proponerSalario(filas, { anio: 2026, categoria: '  camarero ' })
    expect(p.ok && p.fila.salarioBaseCent).toBe(145_050)
  })
  it('sin fila del año → sin_tabla (NUNCA la de otro año)', () => {
    expect(proponerSalario(filas, { anio: 2027, categoria: 'Camarero' })).toEqual({ ok: false, motivo: 'sin_tabla' })
  })
  it('varios convenios para la misma categoría → ambigua; con el convenio se desempata', () => {
    const dos = [...filas, fila({ convenio: 'Comercio', salarioBaseCent: 130_000 })]
    expect(proponerSalario(dos, { anio: 2026, categoria: 'Camarero' })).toEqual({ ok: false, motivo: 'ambigua' })
    const p = proponerSalario(dos, { anio: 2026, categoria: 'Camarero', convenio: 'comercio' })
    expect(p.ok && p.fila.salarioBaseCent).toBe(130_000)
  })
  it('sin categoría → sin_categoria', () => {
    expect(proponerSalario(filas, { anio: 2026, categoria: '' })).toEqual({ ok: false, motivo: 'sin_categoria' })
    expect(proponerSalario(filas, { anio: 2026, categoria: null })).toEqual({ ok: false, motivo: 'sin_categoria' })
  })
  it('categorías del año sin repetir', () => {
    expect(categoriasDelAnio([...filas, fila({ categoria: 'CAMARERO', convenio: 'Otro' })], 2026)).toEqual(['Camarero', 'Cocinero'])
  })
})
