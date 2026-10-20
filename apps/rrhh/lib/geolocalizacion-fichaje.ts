// Obtención de la posición para fichar y mensajes por código de error (W3C GeolocationPositionError).
// Antes TODO error se mostraba como «activa la ubicación»; en iOS un timeout o una posición no disponible
// hacían creer al empleado que le faltaba un permiso que ya tenía concedido.
export type CausaUbicacion = 'permiso' | 'no_disponible' | 'timeout' | 'sin_soporte' | 'desconocido'

export const MENSAJE_UBICACION_PERMISO =
  'No tenemos acceso a tu ubicación. Permítela para este sitio en Safari y, en el iPhone, activa también ' +
  'Ajustes > Privacidad y seguridad > Localización Y, dentro, «Sitios web de Safari» > «Al usar la app». Luego pulsa Reintentar.'
export const MENSAJE_UBICACION_NO_DISPONIBLE =
  'No se ha podido obtener tu posición. Sal a un sitio con cobertura (o cerca de una ventana) y reintenta.'
export const MENSAJE_UBICACION_TIMEOUT =
  'Tu móvil ha tardado demasiado en obtener la ubicación. Reintenta; si persiste, sal a un sitio con mejor cobertura.'
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

export function mensajeUbicacion(causa: CausaUbicacion): string {
  switch (causa) {
    case 'permiso': return MENSAJE_UBICACION_PERMISO
    case 'no_disponible': return MENSAJE_UBICACION_NO_DISPONIBLE
    case 'timeout': return MENSAJE_UBICACION_TIMEOUT
    case 'sin_soporte': return MENSAJE_UBICACION_SIN_SOPORTE
    default: return MENSAJE_UBICACION_DESCONOCIDO
  }
}

// Alta precisión primero (15 s); si falla por timeout/no disponible, reintento con baja precisión y caché de 60 s.
// Un PERMISO denegado no se reintenta. El error final es el del último intento.
export async function obtenerPosicion(
  geo: Pick<Geolocation, 'getCurrentPosition'> | undefined = typeof navigator !== 'undefined' ? navigator.geolocation : undefined,
): Promise<GeolocationPosition> {
  if (!geo) throw new Error('sin_soporte')
  const pedir = (opts: PositionOptions) =>
    new Promise<GeolocationPosition>((res, rej) => geo.getCurrentPosition(res, rej, opts))
  try {
    return await pedir({ enableHighAccuracy: true, timeout: 15000, maximumAge: 0 })
  } catch (e) {
    const c = causaUbicacion(e)
    if (c !== 'timeout' && c !== 'no_disponible') throw e
    return await pedir({ enableHighAccuracy: false, timeout: 20000, maximumAge: 60000 })
  }
}
