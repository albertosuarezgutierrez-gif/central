// lib/domotica/acceso-puro.ts — parte PURA del cliente de acceso (sin IO), testeable con node --test.
// Vive aparte de acceso.ts para que los tests no arrastren el import de tuya.ts.

// Códigos DP candidato para "abrir" un control de acceso (orden de preferencia).
export const DP_ABRIR = ['unlock_request', 'open_door', 'manual_lock', 'remote_no_dp_key'] as const
// Códigos DP candidato para batería / nivel.
export const DP_BATERIA = ['residual_electricity', 'battery_percentage', 'battery_state', 'battery'] as const

export function elegirCodigoAbrir(codes: string[]): string | null {
  for (const c of DP_ABRIR) if (codes.includes(c)) return c
  return null
}

export type BloqueSonda = { clave: string; ok: boolean; datos: unknown; error: string | null }

export function normalizarAcceso(clave: string, r: { ok: boolean; result?: unknown; msg?: string }): BloqueSonda {
  return r.ok
    ? { clave, ok: true, datos: r.result ?? null, error: null }
    : { clave, ok: false, datos: null, error: r.msg || 'no soportado' }
}
