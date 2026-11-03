import { describe, it, expect } from 'vitest'
import { seccionDeUrl, seccionDisponible } from './seccion-empleado'

describe('seccionDeUrl', () => {
  it('lee el hash', () => expect(seccionDeUrl('#documentos', '')).toBe('documentos'))
  it('lee ?seccion=', () => expect(seccionDeUrl('', '?seccion=vacaciones')).toBe('vacaciones'))
  it('el hash manda sobre la query', () => expect(seccionDeUrl('#fichaje', '?seccion=vacaciones')).toBe('fichaje'))
  it('valor desconocido = inicio', () => {
    expect(seccionDeUrl('#xx', '')).toBe('inicio')
    expect(seccionDeUrl('', '?seccion=__proto__')).toBe('inicio')
  })
})
describe('seccionDisponible', () => {
  it('fichaje sin fichaje cae en inicio', () => expect(seccionDisponible('fichaje', false)).toBe('inicio'))
  it('fichaje con fichaje se mantiene', () => expect(seccionDisponible('fichaje', true)).toBe('fichaje'))
})
