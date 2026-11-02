import { NextRequest } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { verificarSesion, verificarObjeto } from '@/lib/session-sign'
import { secretoCronValido } from '@/lib/cron-auth'

export interface ApiSession {
  id: string
  nombre: string
  rol: string
  restaurante_id: string
  restaurante_nombre: string
  cuenta_id?: string
  camarero_id?: string
  seccion_id?: string | null
  puede_comandar?: boolean
  modulos_gestion?: string[]
  cocina_central?: boolean
  _sig?: string
}

// Única puerta de lectura de la cabecera `x-ia-session` en las rutas API
// (lo vigila test/regression-ia-rest-sesion-firmada.test.ts). La firma HMAC es
// OBLIGATORIA siempre: el antiguo modo permisivo (variable de corte de migración,
// que aceptaba sesiones sin `_sig`) se eliminó el 02/11/2026.
function leerCabeceraSesion(req: NextRequest): Record<string, unknown> | null {
  const raw = req.headers.get('x-ia-session')
  if (!raw) return null
  try {
    const p = JSON.parse(raw)
    return p && typeof p === 'object' && !Array.isArray(p) ? p : null
  } catch { return null }
}

export function getSession(req: NextRequest): ApiSession | null {
  const parsed = leerCabeceraSesion(req)
  if (!parsed) return null
  // Sin SESSION_SECRET no se puede verificar nada → deny-by-default.
  // Sin `_sig` o con firma incorrecta → se rechaza.
  return verificarSesion(parsed) ? (parsed as unknown as ApiSession) : null
}

/** Token de CUENTA (firmarObjeto en /api/auth/pin-cuenta) enviado en `x-ia-session`. */
export function getSesionCuenta(req: NextRequest): { cuenta_id: string; rol?: string; nombre?: string } | null {
  const parsed = leerCabeceraSesion(req)
  if (!parsed || !verificarObjeto(parsed)) return null
  return typeof parsed.cuenta_id === 'string' && parsed.cuenta_id
    ? (parsed as { cuenta_id: string; rol?: string; nombre?: string })
    : null
}

/**
 * Cabecera `x-ia-session` para reenviar a otra ruta interna (fetch servidor→servidor).
 * Solo se reenvía si la firma es válida; si no, cadena vacía (la ruta destino rechazará).
 */
export function sesionParaReenviar(req: NextRequest): string {
  return getSession(req) ? (req.headers.get('x-ia-session') ?? '') : ''
}

/**
 * Resuelve el restaurante_id objetivo VALIDANDO que pertenece a la cuenta de la
 * sesión firmada. Evita IDOR cross-tenant cuando una ruta acepta un
 * restaurante_id por query/body.
 *
 * - Sin `requested` o igual al de la sesión → devuelve el de la sesión.
 * - super_admin (operador) → cualquiera, es cross-tenant por diseño.
 * - owner/resto → solo si el restaurante pertenece a `session.cuenta_id`.
 *   Si no pertenece (o la sesión no tiene cuenta_id) → null, y el caller
 *   debe responder 403.
 */
export async function resolverRestauranteIdDeCuenta(
  supabase: SupabaseClient,
  session: ApiSession,
  requested: string | null | undefined
): Promise<string | null> {
  const current = session.restaurante_id
  if (!requested || requested === current) return current ?? null
  if (session.rol === 'super_admin') return requested
  if (!session.cuenta_id) return null
  const { data } = await supabase
    .from('restaurantes')
    .select('id')
    .eq('id', requested)
    .eq('cuenta_id', session.cuenta_id)
    .maybeSingle()
  return data ? requested : null
}

export function getRestauranteId(req: NextRequest): string {
  // Header directo para cron / server-side: exige SIEMPRE el secreto compartido
  // CRON_SECRET (fail-closed, tiempo constante).
  const direct = req.headers.get('x-ia-restaurante-id')
  if (direct && secretoCronValido(req.headers.get('x-ia-cron-secret'))) return direct

  const s = getSession(req)
  if (s?.restaurante_id) return s.restaurante_id
  return '00000000-0000-0000-0000-000000000001'
}