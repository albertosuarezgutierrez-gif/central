import { describe, it, expect } from 'vitest'
import { validarUbicacionFichaje } from './ubicacion-fichaje'

describe('validarUbicacionFichaje', () => {
  it.each([undefined, null, {}, { lat: 37.4 }, { lng: -5.9 }, { lat: null, lng: null }, 'x'])('sin coords (%j) -> rechazado', (b) => {
    const r = validarUbicacionFichaje(b)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.codigo).toBe('ubicacion_requerida')
  })
  it.each([
    { lat: '37.4', lng: '-5.9' }, { lat: NaN, lng: 0 }, { lat: Infinity, lng: 0 },
    { lat: 91, lng: 0 }, { lat: -90.01, lng: 0 }, { lat: 0, lng: 181 }, { lat: 0, lng: -180.5 },
  ])('coords inválidas (%j) -> rechazado', (b) => {
    expect(validarUbicacionFichaje(b).ok).toBe(false)
  })
  it('válidas -> ok (incluye 0,0 y límites)', () => {
    expect(validarUbicacionFichaje({ lat: 37.3891, lng: -5.9845 })).toEqual({ ok: true, ubicacion: { lat: 37.3891, lng: -5.9845 } })
    expect(validarUbicacionFichaje({ lat: 0, lng: 0 }).ok).toBe(true)
    expect(validarUbicacionFichaje({ lat: -90, lng: 180 }).ok).toBe(true)
  })
})
