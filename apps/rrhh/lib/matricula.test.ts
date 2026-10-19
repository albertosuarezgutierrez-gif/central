import { describe, expect, it } from 'vitest'
import { normalizarMatriculaFicha } from './matricula'

describe('normalizarMatriculaFicha', () => {
  it('pone mayúsculas y quita espacios, guiones y puntos', () => {
    expect(normalizarMatriculaFicha('1234 bcd')).toBe('1234BCD')
    expect(normalizarMatriculaFicha(' se-1234-ab ')).toBe('SE1234AB')
    expect(normalizarMatriculaFicha('1234.BCD')).toBe('1234BCD')
  })
  it('vacío o solo separadores → null, nunca cadena vacía', () => {
    expect(normalizarMatriculaFicha('')).toBeNull()
    expect(normalizarMatriculaFicha('  - ')).toBeNull()
  })
  it('entrada no string → null', () => {
    expect(normalizarMatriculaFicha(undefined)).toBeNull()
    expect(normalizarMatriculaFicha(null)).toBeNull()
    expect(normalizarMatriculaFicha(1234)).toBeNull()
  })
})
