import { describe, it, expect } from 'vitest'
import { normalizarDni, normalizarEmail, coincidenciaPersona, mismaPersona, nuevaPersonaId } from './persona.ts'

describe('normalizarDni', () => {
  it('quita espacios/guiones/puntos y pasa a mayúsculas', () => {
    expect(normalizarDni(' 12.345.678-z ')).toBe('12345678Z')
  })
  it('vacío → null', () => {
    expect(normalizarDni('')).toBeNull()
    expect(normalizarDni(null)).toBeNull()
  })
})

describe('normalizarEmail', () => {
  it('recorta y pasa a minúsculas', () => {
    expect(normalizarEmail('  Vanessa@Ialimp.ES ')).toBe('vanessa@ialimp.es')
  })
})

describe('coincidenciaPersona', () => {
  it('mismo persona_id → misma', () => {
    expect(coincidenciaPersona({ id: 'p1', nombre: 'A' }, { id: 'p1', nombre: 'B' })).toBe('misma')
  })
  it('persona_id distinto → no (aunque coincida el dni)', () => {
    expect(coincidenciaPersona({ id: 'p1', nombre: 'A', dni: '1Z' }, { id: 'p2', nombre: 'B', dni: '1Z' })).toBe('no')
  })
  it('mismo DNI (sin id) → probable', () => {
    expect(coincidenciaPersona({ nombre: 'A', dni: '12345678-z' }, { nombre: 'B', dni: '12345678Z' })).toBe('probable')
  })
  it('mismo email (sin id ni dni) → posible', () => {
    expect(coincidenciaPersona({ nombre: 'A', email: 'v@x.es' }, { nombre: 'B', email: 'V@X.ES' })).toBe('posible')
  })
  it('sin señales → no', () => {
    expect(coincidenciaPersona({ nombre: 'A' }, { nombre: 'B' })).toBe('no')
  })
})

describe('mismaPersona', () => {
  it('true para misma/probable, false para posible/no', () => {
    expect(mismaPersona({ id: 'p1', nombre: 'A' }, { id: 'p1', nombre: 'B' })).toBe(true)
    expect(mismaPersona({ nombre: 'A', dni: '1Z' }, { nombre: 'B', dni: '1z' })).toBe(true)
    expect(mismaPersona({ nombre: 'A', email: 'v@x.es' }, { nombre: 'B', email: 'v@x.es' })).toBe(false)
  })
})

describe('nuevaPersonaId', () => {
  it('genera uuids distintos', () => {
    expect(nuevaPersonaId()).not.toBe(nuevaPersonaId())
    expect(nuevaPersonaId()).toMatch(/^[0-9a-f-]{36}$/)
  })
})
