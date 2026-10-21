// Obtención de la posición para fichar y mensajes por código de error (W3C GeolocationPositionError).
// Antes TODO error se mostraba como «activa la ubicación»; en iOS un timeout o una posición no disponible
// hacían creer al empleado que le faltaba un permiso que ya tenía concedido.
export type CausaUbicacion = 'permiso' | 'no_disponible' | 'timeout' | 'sin_soporte' | 'desconocido'

export const MENSAJE_UBICACION_PERMISO =
  'No tenemos acceso a tu ubicación. Permítela para este sitio en Safari y, en el iPhone, activa también ' +
  'Ajustes > Privacidad y seguridad > Localización Y, dentro, «Sitios web de Safari» > «Al usar la app». Luego pulsa Reintentar.'
export const MENSAJE_UBICACION_PERMISO_ANDROID =
  'No tenemos acceso a tu ubicación. Toca el candado (o ⓘ) junto a la dirección web > Permisos > Ubicación > Permitir. ' +
  'Comprueba también que la Ubicación del móvil está activada (desliza desde arriba y pulsa «Ubicación»). Luego pulsa Reintentar.'
export const MENSAJE_UBICACION_PERMISO_OTRO =
  'No tenemos acceso a tu ubicación. Pulsa el icono junto a la dirección web > Ubicación > Permitir. Luego pulsa Reintentar.'
export const MENSAJE_UBICACION_NO_DISPONIBLE =
  'No se ha podido obtener tu posición. Sal a un sitio con cobertura (o cerca de una ventana) y reintenta.'
export const MENSAJE_UBICACION_TIMEOUT =
  'Tu móvil ha tardado demasiado en obtener la ubicación. Reintenta; si persiste, sal a un sitio con mejor cobertura.'
export const AVISO_UBICACION_MOVIL_ANDROID = ' Comprueba que la Ubicación del móvil está activada (desliza desde arriba y pulsa «Ubicación»).'
export const MENSAJE_UBICACION_SIN_SOPORTE =
  'Este navegador no permite obtener la ubicación. Abre el portal en Safari o Chrome actualizado.'
export const MENSAJE_UBICACION_DESCONOCIDO =
  'No se ha podido obtener tu ubicación. Reintenta en unos segundos.'

export function causaUbicacion(err: unknown): CausaUbicacion {
  const code = err && typeof err === 'object' ? (err as { code?: unknown }).code : undefined
  if (code === 1) return 'permiso'
  if (code === 2) return 'no_disponible'
  if (code === 3) return 'timeout'
  if (err instanceof Error && err.message === 'sin_soporte') return 'sin_soporte'
  return 'desconocido'
}

export type Plataforma = 'ios' | 'android' | 'otro'
export type EstadoPermisoUbicacion = 'granted' | 'prompt' | 'denied' | 'desconocido'

export function detectarPlataforma(
  userAgent: string = typeof navigator !== 'undefined' ? navigator.userAgent : '',
  maxTouchPoints: number = typeof navigator !== 'undefined' ? navigator.maxTouchPoints ?? 0 : 0,
): Plataforma {
  const ua = userAgent ?? ''
  if (/iPhone|iPad|iPod/i.test(ua)) return 'ios'
  if (/Macintosh/i.test(ua) && maxTouchPoints > 1) return 'ios'
  if (/Android/i.test(ua)) return 'android'
  return 'otro'
}

export function mensajePermisoUbicacion(plataforma: Plataforma): string {
  if (plataforma === 'ios') return MENSAJE_UBICACION_PERMISO
  if (plataforma === 'android') return MENSAJE_UBICACION_PERMISO_ANDROID
  return MENSAJE_UBICACION_PERMISO_OTRO
}

export async function estadoPermisoUbicacion(
  permisos: Pick<Permissions, 'query'> | undefined = typeof navigator !== 'undefined' ? navigator.permissions : undefined,
): Promise<EstadoPermisoUbicacion> {
  try {
    const r = await permisos?.query({ name: 'geolocation' })
    const s = r?.state
    return s === 'granted' || s === 'prompt' || s === 'denied' ? s : 'desconocido'
  } catch {
    return 'desconocido'
  }
}

export function mensajeUbicacion(causa: CausaUbicacion, plataforma: Plataforma = 'otro'): string {
  const android = plataforma === 'android'
  switch (causa) {
    case 'permiso': return mensajePermisoUbicacion(plataforma)
    case 'no_disponible': return android ? MENSAJE_UBICACION_NO_DISPONIBLE + AVISO_UBICACION_MOVIL_ANDROID : MENSAJE_UBICACION_NO_DISPONIBLE
    case 'timeout': return android ? MENSAJE_UBICACION_TIMEOUT + AVISO_UBICACION_MOVIL_ANDROID : MENSAJE_UBICACION_TIMEOUT
    case 'sin_soporte': return android ? 'Este navegador no permite obtener la ubicación. Abre el portal en Chrome actualizado.' : MENSAJE_UBICACION_SIN_SOPORTE
    default: return MENSAJE_UBICACION_DESCONOCIDO
  }
}

// Alta precisión primero (10 s); si falla por timeout/no disponible, reintento con baja precisión y caché de 60 s.
// Un PERMISO denegado no se reintenta. El error final es el del último intento.
export async function obtenerPosicion(
  geo: Pick<Geolocation, 'getCurrentPosition'> | undefined = typeof navigator !== 'undefined' ? navigator.geolocation : undefined,
): Promise<GeolocationPosition> {
  if (!geo) throw new Error('sin_soporte')
  const pedir = (opts: PositionOptions) =>
    new Promise<GeolocationPosition>((res, rej) => geo.getCurrentPosition(res, rej, opts))
  try {
    return await pedir({ enableHighAccuracy: true, timeout: 10000, maximumAge: 0 })
  } catch (e) {
    const c = causaUbicacion(e)
    if (c !== 'timeout' && c !== 'no_disponible') throw e
    return await pedir({ enableHighAccuracy: false, timeout: 20000, maximumAge: 60000 })
  }
}
