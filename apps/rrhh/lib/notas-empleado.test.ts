import { describe, expect, it } from 'vitest'
import { NOTAS_MAX, normalizarNotas } from './notas-empleado'

describe('normalizarNotas', () => {
  it('recorta espacios y conserva los saltos de línea interiores', () => {
    expect(normalizarNotas('  hola\nmundo \n')).toEqual({ ok: true, valor: 'hola\nmundo' })
  })
  it('vacío, solo espacios o null → null, nunca cadena vacía', () => {
    expect(normalizarNotas('')).toEqual({ ok: true, valor: null })
    expect(normalizarNotas(' \n\t ')).toEqual({ ok: true, valor: null })
    expect(normalizarNotas(null)).toEqual({ ok: true, valor: null })
  })
  it('acepta exactamente 5000 caracteres y rechaza 5001', () => {
    expect(normalizarNotas('a'.repeat(NOTAS_MAX))).toEqual({ ok: true, valor: 'a'.repeat(NOTAS_MAX) })
    expect(normalizarNotas('a'.repeat(NOTAS_MAX + 1)).ok).toBe(false)
  })
  it('los espacios de los extremos no cuentan para el límite', () => {
    expect(normalizarNotas(` ${'a'.repeat(NOTAS_MAX)} `).ok).toBe(true)
  })
  it('entrada no string → error', () => {
    expect(normalizarNotas(undefined).ok).toBe(false)
    expect(normalizarNotas(12).ok).toBe(false)
    expect(normalizarNotas({}).ok).toBe(false)
  })
})
