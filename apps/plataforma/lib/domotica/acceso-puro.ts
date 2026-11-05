// lib/domotica/acceso-puro.ts — parte PURA del cliente de acceso (sin IO), testeable con node --test.
// Vive aparte de acceso.ts para que los tests no arrastren el import de tuya.ts.

// Códigos DP candidato para "abrir" un control de acceso (orden de preferencia).
// OJO: `remote_no_dp_key` NO va aquí: es un DP raw/de reporte de la apertura remota de los smart lock;
// mandarle `true` por /commands devuelve success pero NO acciona nada (Socorro, 05/11/2026).
export const DP_ABRIR = ['unlock_request', 'open_door', 'manual_lock'] as const
// Códigos DP candidato para batería / nivel.
export const DP_BATERIA = ['residual_electricity', 'battery_percentage', 'battery_state', 'battery'] as const

export function elegirCodigoAbrir(codes: string[]): string | null {
  for (const c of DP_ABRIR) if (codes.includes(c)) return c
  return null
}

// Categorías Tuya de cerradura inteligente (mk = NIVIAN NV-ACCESS-PIN-RFID-W): se abren con la
// "apertura remota sin contraseña" (ticket + open-door), no con un DP booleano.
export const CATEGORIAS_SMART_LOCK = ['mk', 'ms', 'jtmspro'] as const

export type MetodoAbrir =
  | { metodo: 'password-free' }
  | { metodo: 'commands'; code: string }

// Elige CÓMO abrir. Smart lock (categoría mk/ms/jtmspro, o solo expone `remote_no_dp_key`) → apertura
// remota sin contraseña. DP booleano real (unlock_request/open_door/manual_lock) → /commands. Nada → null.
export function elegirMetodoAbrir(codes: string[], categoria?: string | null): MetodoAbrir | null {
  const cat = (categoria || '').toLowerCase()
  const code = elegirCodigoAbrir(codes)
  if ((CATEGORIAS_SMART_LOCK as readonly string[]).includes(cat)) return { metodo: 'password-free' }
  if (code) return { metodo: 'commands', code }
  if (codes.includes('remote_no_dp_key')) return { metodo: 'password-free' }
  return null
}

export type RespuestaTuya = { via: string; success: boolean; code?: number; msg?: string; result?: unknown }

// Recorta la respuesta de Tuya a lo que se puede guardar en el log (sin secretos: nada de tickets/claves).
export function resumirRespuestaTuya(via: string, env: { success?: boolean; code?: number; msg?: string; result?: unknown }): RespuestaTuya {
  const r = env.result
  const result = typeof r === 'boolean' || typeof r === 'number' || r == null ? r
    : typeof r === 'string' ? r.slice(0, 80) : '[objeto]'
  return { via, success: !!env.success, code: env.code, msg: env.msg ? String(env.msg).slice(0, 200) : undefined, result }
}

// ¿Tuya dice que la apertura remota está desactivada en la cerradura? (heurística sobre msg/code).
export function esAperturaRemotaDesactivada(msg?: string): boolean {
  const m = (msg || '').toLowerCase()
  return /remote.{0,30}(unlock|open|door).{0,30}(off|disabled|closed|not (enabled|opened|allowed|support)|turned off)|(disable|not enabled|not opened).{0,30}remote|remote unlock|remote_unlock|apertura remota/.test(m)
}

export const MSG_APERTURA_REMOTA_OFF = 'Activa la apertura remota en la app Tuya/Smart Life de la cerradura'

// Veredicto de un intento de apertura remota: ok solo si success y result no es false.
export function aperturaOk(r: RespuestaTuya): boolean {
  return r.success && r.result !== false
}

// DP estándar de "desbloqueo" de Tuya (los métodos con los que se abre una cerradura). Se piden como
// filtro al leer el HISTORIAL de aperturas. Lista amplia a propósito: el endpoint filtra por los que el
// aparato tenga y descarta el resto, así que sobra-incluir no rompe.
export const DP_UNLOCK = [
  'unlock_password', 'unlock_temporary', 'unlock_dynamic', 'unlock_offline_pd', 'unlock_offline_clear',
  'unlock_card', 'unlock_fingerprint', 'unlock_face', 'unlock_eye', 'unlock_hand', 'unlock_finger_vein',
  'unlock_ble', 'unlock_app', 'unlock_key', 'unlock_remote', 'unlock_phone_remote', 'unlock_special',
] as const

// Query canónica de Tuya: los parámetros DEBEN ir ORDENADOS alfabéticamente por clave; si no, la firma
// HMAC v2 no valida y devuelve 1004 "sign invalid" (el servidor los reordena antes de recomputar la firma).
// Por eso `page_no`/`page_size` (ya ordenados) firmaban bien pero `records?pageNo&pageSize&startTime&endTime`
// (desordenados) daban 1004. Ordenamos SIEMPRE aquí para que el path firmado == el canónico del servidor.
export function queryOrdenada(params: Record<string, string | number>): string {
  return Object.keys(params).sort().map(k => `${k}=${params[k]}`).join('&')
}

// Variantes documentadas para leer el HISTORIAL de aperturas de una cerradura Tuya, en orden de preferencia.
// El endpoint y los nombres de parámetro cambiaron entre versiones de la API (por eso el `open-logs` viejo
// devolvía 1100 = "parámetro inválido"): la vía actual es `door-lock/records` con `pageNo`/`pageSize`/
// `startTime`/`endTime` (ms) y `targetStandardDpCodes`. Probamos en orden y nos quedamos con la primera que
// responda; la sonda anota la `via` buena para luego cablear el vigilante de aperturas sin volver a adivinar.
export function variantesAperturas(
  deviceId: string, ahoraMs: number, ventanaMs = 90 * 24 * 60 * 60 * 1000,
): Array<{ via: string; method: string; path: string }> {
  const desde = ahoraMs - ventanaMs
  const dps = DP_UNLOCK.join(',')
  const base = `/v1.0/devices/${deviceId}/door-lock`
  return [
    { via: 'records+dps', method: 'GET', path: `${base}/records?${queryOrdenada({ pageNo: 1, pageSize: 20, startTime: desde, endTime: ahoraMs, targetStandardDpCodes: dps })}` },
    { via: 'records', method: 'GET', path: `${base}/records?${queryOrdenada({ pageNo: 1, pageSize: 20, startTime: desde, endTime: ahoraMs })}` },
    { via: 'open-logs', method: 'GET', path: `${base}/open-logs?${queryOrdenada({ page_no: 1, page_size: 20 })}` },
    { via: 'device-logs', method: 'GET', path: `/v1.0/devices/${deviceId}/logs?${queryOrdenada({ start_time: desde, end_time: ahoraMs, size: 20, type: 7 })}` },
  ]
}

export type BloqueSonda = { clave: string; ok: boolean; datos: unknown; error: string | null }

export function normalizarAcceso(clave: string, r: { ok: boolean; result?: unknown; msg?: string }): BloqueSonda {
  return r.ok
    ? { clave, ok: true, datos: r.result ?? null, error: null }
    : { clave, ok: false, datos: null, error: r.msg || 'no soportado' }
}
