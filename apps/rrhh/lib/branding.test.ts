import { describe, it, expect } from 'vitest'
import { normalizaHex, esHexValido, derivarPaleta, estiloMarca } from './branding'

describe('branding (marca blanca por empresa)', () => {
  it('normaliza hex de 3 y 6 dígitos y rechaza lo inválido', () => {
    expect(normalizaHex('#2B6A6E')).toBe('#2b6a6e')
    expect(normalizaHex('2b6a6e')).toBe('#2b6a6e')
    expect(normalizaHex('#abc')).toBe('#aabbcc')
    expect(normalizaHex('rojo')).toBeNull()
    expect(normalizaHex('')).toBeNull()
    expect(normalizaHex(null)).toBeNull()
    expect(esHexValido('#fff')).toBe(true)
    expect(esHexValido('#12345')).toBe(false)
  })

  it('deriva una paleta con acento, una tinta oscura y una clara', () => {
    const p = derivarPaleta('#2b6a6e')!
    expect(p.accent).toBe('#2b6a6e')
    // accentInk más oscuro que el acento; accentSoft más claro
    expect(parseInt(p.accentInk.slice(1, 3), 16)).toBeLessThan(parseInt('2b', 16))
    expect(parseInt(p.accentSoft.slice(1, 3), 16)).toBeGreaterThan(parseInt('2b', 16))
    expect(derivarPaleta('no-color')).toBeNull()
  })

  it('estiloMarca devuelve las 3 variables CSS, o {} si no hay color', () => {
    const s = estiloMarca('#d9442b')
    expect(s['--accent']).toBe('#d9442b')
    expect(s['--accent-ink']).toBeTruthy()
    expect(s['--accent-soft']).toBeTruthy()
    expect(estiloMarca(null)).toEqual({})
    expect(estiloMarca('basura')).toEqual({})
  })
})
