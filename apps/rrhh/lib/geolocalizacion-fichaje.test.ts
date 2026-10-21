import { describe, it, expect } from 'vitest'
import {
  causaUbicacion, mensajeUbicacion, obtenerPosicion, detectarPlataforma, mensajePermisoUbicacion, estadoPermisoUbicacion,
  MENSAJE_UBICACION_PERMISO, MENSAJE_UBICACION_NO_DISPONIBLE, MENSAJE_UBICACION_TIMEOUT,
  MENSAJE_UBICACION_PERMISO_ANDROID, MENSAJE_UBICACION_PERMISO_OTRO,
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
    expect(mensajeUbicacion('permiso', 'ios')).toBe(MENSAJE_UBICACION_PERMISO)
    expect(mensajeUbicacion('no_disponible')).toBe(MENSAJE_UBICACION_NO_DISPONIBLE)
    expect(mensajeUbicacion('timeout')).toBe(MENSAJE_UBICACION_TIMEOUT)
  })
  it('solo el mensaje de permiso habla de Safari/Localización', () => {
    expect(MENSAJE_UBICACION_PERMISO).toContain('Sitios web de Safari')
    expect(MENSAJE_UBICACION_NO_DISPONIBLE).not.toContain('permis')
    expect(MENSAJE_UBICACION_TIMEOUT).not.toContain('Safari')
  })
})

const UA_IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1'
const UA_IPAD_MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15'
const UA_ANDROID = 'Mozilla/5.0 (Linux; Android 14; SM-S911B) AppleWebKit/537.36 Chrome/124.0 Mobile Safari/537.36'
const UA_WINDOWS = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36'

describe('detectarPlataforma', () => {
  it('detecta iOS, iPadOS (Mac con touch), Android y otro', () => {
    expect(detectarPlataforma(UA_IPHONE, 5)).toBe('ios')
    expect(detectarPlataforma(UA_IPAD_MAC, 5)).toBe('ios')
    expect(detectarPlataforma(UA_IPAD_MAC, 0)).toBe('otro')
    expect(detectarPlataforma(UA_ANDROID, 5)).toBe('android')
    expect(detectarPlataforma(UA_WINDOWS, 0)).toBe('otro')
    expect(detectarPlataforma('', 0)).toBe('otro')
  })
})

describe('mensaje de permiso por plataforma', () => {
  it('Android no menciona Safari ni Ajustes de iPhone; iOS sí', () => {
    expect(mensajeUbicacion('permiso', 'android')).toBe(MENSAJE_UBICACION_PERMISO_ANDROID)
    expect(MENSAJE_UBICACION_PERMISO_ANDROID).not.toContain('Safari')
    expect(MENSAJE_UBICACION_PERMISO_ANDROID).toContain('Permisos > Ubicación > Permitir')
    expect(mensajePermisoUbicacion('ios')).toContain('Safari')
    expect(mensajePermisoUbicacion('otro')).toBe(MENSAJE_UBICACION_PERMISO_OTRO)
    expect(MENSAJE_UBICACION_PERMISO_OTRO).not.toContain('Safari')
  })
  it('en Android timeout y no disponible piden activar la Ubicación del móvil; en el resto no', () => {
    expect(mensajeUbicacion('timeout', 'android')).toContain('Ubicación del móvil')
    expect(mensajeUbicacion('no_disponible', 'android')).toContain('Ubicación del móvil')
    expect(mensajeUbicacion('timeout', 'ios')).toBe(MENSAJE_UBICACION_TIMEOUT)
    expect(mensajeUbicacion('no_disponible', 'otro')).toBe(MENSAJE_UBICACION_NO_DISPONIBLE)
  })
})

describe('estadoPermisoUbicacion', () => {
  it('devuelve el estado de la Permissions API', async () => {
    const q = (state: string) => ({ query: async () => ({ state }) as PermissionStatus })
    await expect(estadoPermisoUbicacion(q('denied'))).resolves.toBe('denied')
    await expect(estadoPermisoUbicacion(q('granted'))).resolves.toBe('granted')
    await expect(estadoPermisoUbicacion(q('prompt'))).resolves.toBe('prompt')
  })
  it('sin permissions, si query lanza o estado raro -> desconocido', async () => {
    await expect(estadoPermisoUbicacion(undefined as never)).resolves.toBe('desconocido')
    await expect(estadoPermisoUbicacion({ query: async () => { throw new TypeError('x') } })).resolves.toBe('desconocido')
    await expect(estadoPermisoUbicacion({ query: async () => ({ state: 'otro' }) as unknown as PermissionStatus })).resolves.toBe('desconocido')
  })
})

describe('obtenerPosicion', () => {
  it('reintenta con baja precisión y caché tras timeout', async () => {
    const llamadas: PositionOptions[] = []
    const geo = { getCurrentPosition: (ok: PositionCallback, ko: PositionErrorCallback, o?: PositionOptions) => {
      llamadas.push(o!); llamadas.length === 1 ? ko(err(3) as GeolocationPositionError) : ok(pos)
    } }
    await expect(obtenerPosicion(geo)).resolves.toBe(pos)
    expect(llamadas[0]).toMatchObject({ enableHighAccuracy: true, timeout: 10000 })
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
