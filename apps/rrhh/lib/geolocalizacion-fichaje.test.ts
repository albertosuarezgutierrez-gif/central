import { describe, it, expect } from 'vitest'
import {
  causaUbicacion, mensajeUbicacion, obtenerPosicion,
  MENSAJE_UBICACION_PERMISO, MENSAJE_UBICACION_NO_DISPONIBLE, MENSAJE_UBICACION_TIMEOUT,
} from './geolocalizacion-fichaje'

const err = (code: number) => ({ code, message: 'x' })
const pos = { coords: { latitude: 37.4, longitude: -5.9 } } as unknown as GeolocationPosition

describe('causaUbicacion / mensajeUbicacion', () => {
  it('mapea cada código a su causa y mensaje distinto', () => {
    expect(causaUbicacion(err(1))).toBe('permiso')
    expect(causaUbicacion(err(2))).toBe('no_disponible')
    expect(causaUbicacion(err(3))).toBe('timeout')
    expect(causaUbicacion(new Error('sin_soporte'))).toBe('sin_soporte')
    expect(causaUbicacion(undefined)).toBe('desconocido')
    expect(mensajeUbicacion('permiso')).toBe(MENSAJE_UBICACION_PERMISO)
    expect(mensajeUbicacion('no_disponible')).toBe(MENSAJE_UBICACION_NO_DISPONIBLE)
    expect(mensajeUbicacion('timeout')).toBe(MENSAJE_UBICACION_TIMEOUT)
  })
  it('solo el mensaje de permiso habla de Safari/Localización', () => {
    expect(MENSAJE_UBICACION_PERMISO).toContain('Sitios web de Safari')
    expect(MENSAJE_UBICACION_NO_DISPONIBLE).not.toContain('permis')
    expect(MENSAJE_UBICACION_TIMEOUT).not.toContain('Safari')
  })
})

describe('obtenerPosicion', () => {
  it('reintenta con baja precisión y caché tras timeout', async () => {
    const llamadas: PositionOptions[] = []
    const geo = { getCurrentPosition: (ok: PositionCallback, ko: PositionErrorCallback, o?: PositionOptions) => {
      llamadas.push(o!); llamadas.length === 1 ? ko(err(3) as GeolocationPositionError) : ok(pos)
    } }
    await expect(obtenerPosicion(geo)).resolves.toBe(pos)
    expect(llamadas[0]).toMatchObject({ enableHighAccuracy: true })
    expect(llamadas[1]).toMatchObject({ enableHighAccuracy: false, maximumAge: 60000, timeout: 20000 })
  })
  it('reintenta tras POSITION_UNAVAILABLE', async () => {
    let n = 0
    const geo = { getCurrentPosition: (ok: PositionCallback, ko: PositionErrorCallback) => { n++ === 0 ? ko(err(2) as GeolocationPositionError) : ok(pos) } }
    await expect(obtenerPosicion(geo)).resolves.toBe(pos)
  })
  it('permiso denegado NO se reintenta', async () => {
    let n = 0
    const geo = { getCurrentPosition: (_: PositionCallback, ko: PositionErrorCallback) => { n++; ko(err(1) as GeolocationPositionError) } }
    await expect(obtenerPosicion(geo)).rejects.toMatchObject({ code: 1 })
    expect(n).toBe(1)
  })
  it('sin geolocalización -> sin_soporte', async () => {
    await expect(obtenerPosicion(undefined as never)).rejects.toThrow('sin_soporte')
  })
})
