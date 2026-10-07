// Ubicación OBLIGATORIA al fichar (entrada y salida). El servidor no se fía del cliente.
export type UbicacionFichaje = { lat: number; lng: number }

export type ResultadoUbicacion =
  | { ok: true; ubicacion: UbicacionFichaje }
  | { ok: false; codigo: 'ubicacion_requerida'; error: string }

export const MENSAJE_UBICACION_REQUERIDA =
  'Para fichar tienes que activar la ubicación. Revisa los permisos del navegador y vuelve a intentarlo.'

function coordValida(v: unknown, max: number): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v >= -max && v <= max
}

export function validarUbicacionFichaje(body: unknown): ResultadoUbicacion {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>
  if (!coordValida(b.lat, 90) || !coordValida(b.lng, 180)) {
    return { ok: false, codigo: 'ubicacion_requerida', error: MENSAJE_UBICACION_REQUERIDA }
  }
  return { ok: true, ubicacion: { lat: b.lat, lng: b.lng } }
}
