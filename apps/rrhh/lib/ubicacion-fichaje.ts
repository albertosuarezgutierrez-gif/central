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

// ---- Fichar sin ubicación (emergencia, migración 0024) ----
// Si el GPS falla, el empleado puede fichar SIN ubicación cuando su empresa lo permite
// (`empresas.permite_fichar_sin_ubicacion`). El fichaje queda marcado y lo ve el responsable.
export const CONFIRMAR_SIN_UBICACION = 'Se registrará la hora sin tu ubicación y lo verá tu responsable.'
export const CAUSAS_UBICACION = ['permiso', 'no_disponible', 'timeout', 'sin_soporte', 'desconocido'] as const
export const PLATAFORMAS = ['ios', 'android', 'otro'] as const
export const ESTADOS_PERMISO = ['granted', 'prompt', 'denied', 'desconocido'] as const
export type CausaIncidencia = typeof CAUSAS_UBICACION[number]
export type PlataformaIncidencia = typeof PLATAFORMAS[number]
export type EstadoPermiso = typeof ESTADOS_PERMISO[number]
export const MAX_USER_AGENT = 300

function deLista<T extends string>(lista: readonly T[], v: unknown): T | null {
  return typeof v === 'string' && (lista as readonly string[]).includes(v) ? (v as T) : null
}

/** `coords.accuracy` en metros enteros; fuera de [0, 100000] o no finito → null («no se sabe»). */
export function normalizarPrecision(v: unknown): number | null {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 100000) return null
  return Math.round(v)
}

export type DecisionFichaje =
  | { ok: true; modo: 'con_ubicacion'; lat: number; lng: number; precision_m: number | null }
  | { ok: true; modo: 'sin_ubicacion'; causa: CausaIncidencia; plataforma: PlataformaIncidencia }
  | { ok: false; codigo: 'ubicacion_requerida'; error: string }

/**
 * Decide cómo se registra un fichaje. Coordenadas válidas mandan siempre (aunque venga
 * `sin_ubicacion`). Sin ellas, solo se acepta `sin_ubicacion: true` (booleano estricto) y SOLO si la
 * empresa lo permite; si no, 400 `ubicacion_requerida` como antes. Una causa/plataforma fuera de
 * la lista no tumba el fichaje de emergencia: cae a `desconocido`/`otro`.
 */
export function decidirFichaje(body: unknown, permiteSinUbicacion: boolean): DecisionFichaje {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>
  const u = validarUbicacionFichaje(b)
  if (u.ok) return { ok: true, modo: 'con_ubicacion', ...u.ubicacion, precision_m: normalizarPrecision(b.precision) }
  if (b.sin_ubicacion === true && permiteSinUbicacion === true) {
    return {
      ok: true, modo: 'sin_ubicacion',
      causa: deLista(CAUSAS_UBICACION, b.causa) ?? 'desconocido',
      plataforma: deLista(PLATAFORMAS, b.plataforma) ?? 'otro',
    }
  }
  return u
}

export type IncidenciaUbicacion = {
  causa: CausaIncidencia; plataforma: PlataformaIncidencia
  estado_permiso: EstadoPermiso | null; user_agent: string | null
}

/** Valida el registro de una incidencia: causa y plataforma de la lista cerrada (si no, null → 400). */
export function validarIncidenciaUbicacion(body: unknown, userAgent: string | null): IncidenciaUbicacion | null {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>
  const causa = deLista(CAUSAS_UBICACION, b.causa)
  const plataforma = deLista(PLATAFORMAS, b.plataforma)
  if (!causa || !plataforma) return null
  return {
    causa, plataforma,
    estado_permiso: deLista(ESTADOS_PERMISO, b.estado_permiso),
    user_agent: userAgent ? userAgent.slice(0, MAX_USER_AGENT) : null,
  }
}

// ---- Panel del responsable (/admin/fichajes) ----
export const ETIQUETA_CAUSA: Record<CausaIncidencia, string> = {
  permiso: 'Permiso denegado', no_disponible: 'Posición no disponible', timeout: 'Tiempo agotado',
  sin_soporte: 'Navegador sin ubicación', desconocido: 'Desconocida',
}
export const ETIQUETA_PLATAFORMA: Record<PlataformaIncidencia, string> = { ios: 'iPhone/iPad', android: 'Android', otro: 'Otro' }

/** Distintivo «sin ubicación» de un fichaje: qué tramo se registró sin GPS, o null si ninguno. */
export function tramoSinUbicacion(f: { sin_ubicacion_entrada?: boolean | null; sin_ubicacion_salida?: boolean | null }): string | null {
  const e = f.sin_ubicacion_entrada === true, s = f.sin_ubicacion_salida === true
  if (e && s) return 'sin ubicación (entrada y salida)'
  if (e) return 'sin ubicación (entrada)'
  if (s) return 'sin ubicación (salida)'
  return null
}

/** «±12 m»; null (no se sabe) no se pinta, nunca «±0 m» por defecto. */
export function textoPrecision(m: number | null | undefined): string | null {
  return typeof m === 'number' && Number.isFinite(m) ? `±${String(Math.round(m)).replace(/\B(?=(\d{3})+(?!\d))/g, '.')} m` : null
}
