import { describe, it, expect } from 'vitest'
import {
  validarUbicacionFichaje, decidirFichaje, normalizarPrecision, validarIncidenciaUbicacion,
  tramoSinUbicacion, textoPrecision, CONFIRMAR_SIN_UBICACION, MAX_USER_AGENT,
} from './ubicacion-fichaje'

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

describe('normalizarPrecision', () => {
  it('redondea los metros válidos (incluye límites)', () => {
    expect(normalizarPrecision(12.6)).toBe(13)
    expect(normalizarPrecision(0)).toBe(0)
    expect(normalizarPrecision(100000)).toBe(100000)
  })
  it.each([undefined, null, '12', NaN, Infinity, -1, 100000.5])('inválida (%j) -> null, nunca 0', (v) => {
    expect(normalizarPrecision(v)).toBeNull()
  })
})

describe('decidirFichaje', () => {
  it('con coords válidas registra la ubicación y su precisión (aunque venga sin_ubicacion)', () => {
    expect(decidirFichaje({ lat: 37.4, lng: -5.9, precision: 8.4 }, false))
      .toEqual({ ok: true, modo: 'con_ubicacion', lat: 37.4, lng: -5.9, precision_m: 8 })
    expect(decidirFichaje({ lat: 37.4, lng: -5.9, sin_ubicacion: true }, true))
      .toMatchObject({ ok: true, modo: 'con_ubicacion', precision_m: null })
  })
  it('sin coords y la empresa lo permite -> fichaje sin ubicación con causa y plataforma', () => {
    expect(decidirFichaje({ sin_ubicacion: true, causa: 'timeout', plataforma: 'ios' }, true))
      .toEqual({ ok: true, modo: 'sin_ubicacion', causa: 'timeout', plataforma: 'ios' })
  })
  it('causa/plataforma fuera de lista no tumban la emergencia: desconocido/otro', () => {
    expect(decidirFichaje({ sin_ubicacion: true, causa: 'hack', plataforma: 'win' }, true))
      .toEqual({ ok: true, modo: 'sin_ubicacion', causa: 'desconocido', plataforma: 'otro' })
  })
  it('la empresa NO lo permite -> 400 ubicacion_requerida como siempre', () => {
    expect(decidirFichaje({ sin_ubicacion: true, causa: 'permiso', plataforma: 'android' }, false))
      .toMatchObject({ ok: false, codigo: 'ubicacion_requerida' })
  })
  it.each([{}, { sin_ubicacion: 'true' }, { sin_ubicacion: 1 }, null])('sin pedirlo de forma explícita (%j) -> rechazado', (b) => {
    expect(decidirFichaje(b, true)).toMatchObject({ ok: false, codigo: 'ubicacion_requerida' })
  })
})

describe('validarIncidenciaUbicacion', () => {
  it('acepta la lista cerrada y trunca el user agent', () => {
    const ua = 'x'.repeat(500)
    const r = validarIncidenciaUbicacion({ causa: 'permiso', plataforma: 'android', estado_permiso: 'denied' }, ua)
    expect(r).toMatchObject({ causa: 'permiso', plataforma: 'android', estado_permiso: 'denied' })
    expect(r?.user_agent).toHaveLength(MAX_USER_AGENT)
  })
  it('estado_permiso desconocido -> null (no se supo), sin UA -> null', () => {
    expect(validarIncidenciaUbicacion({ causa: 'timeout', plataforma: 'ios', estado_permiso: 'quizá' }, null))
      .toEqual({ causa: 'timeout', plataforma: 'ios', estado_permiso: null, user_agent: null })
  })
  it.each([{}, { causa: 'permiso' }, { plataforma: 'ios' }, { causa: 'otra', plataforma: 'ios' }, { causa: 'permiso', plataforma: 'mac' }])(
    'fuera de la lista (%j) -> null', (b) => { expect(validarIncidenciaUbicacion(b, 'ua')).toBeNull() })
})

describe('panel: distintivo y precisión', () => {
  it('marca el tramo sin ubicación', () => {
    expect(tramoSinUbicacion({ sin_ubicacion_entrada: true })).toBe('sin ubicación (entrada)')
    expect(tramoSinUbicacion({ sin_ubicacion_salida: true })).toBe('sin ubicación (salida)')
    expect(tramoSinUbicacion({ sin_ubicacion_entrada: true, sin_ubicacion_salida: true })).toBe('sin ubicación (entrada y salida)')
    expect(tramoSinUbicacion({})).toBeNull()
  })
  it('precisión: null no se pinta; miles con punto', () => {
    expect(textoPrecision(null)).toBeNull()
    expect(textoPrecision(undefined)).toBeNull()
    expect(textoPrecision(0)).toBe('±0 m')
    expect(textoPrecision(1500)).toBe('±1.500 m')
  })
  it('texto de confirmación exacto', () => {
    expect(CONFIRMAR_SIN_UBICACION).toBe('Se registrará la hora sin tu ubicación y lo verá tu responsable.')
  })
})
