import { NextRequest } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { verificarSesion } from '@/lib/session-sign'

export interface ApiSession {
  id: string
  nombre: string
  rol: string
  restaurante_id: string
  local_id?: string          // canónico (rename expand-contract); derivado de restaurante_id tras verificar firma
  restaurante_nombre: string
  cuenta_id?: string
  camarero_id?: string
  seccion_id?: string | null
  puede_comandar?: boolean
  modulos_gestion?: string[]
  _sig?: string
}

// Corte de seguridad. En 'false' (o sin definir) se aceptan sesiones antiguas
// sin firma (no echa a nadie durante la migración). En 'true' solo se aceptan
// sesiones firmadas válidas → cierra el agujero de suplantación.
const ENFORCE = process.env.SESSION_ENFORCE === 'true'

export function getSession(req: NextRequest): ApiSession | null {
  const raw = req.headers.get('x-ia-session')
  if (!raw) return null

  let parsed: ApiSession
  try { parsed = JSON.parse(raw) } catch { return null }

  // Fail-safe: sin SESSION_SECRET no se puede verificar NINGUNA firma. Aceptar
  // sesiones en ese estado equivaldría a confiar en una cabecera forjable, así
  // que se rechaza siempre (deny-by-default). El operador debe configurar
  // SESSION_SECRET en el entorno para que la auth funcione.
  if (!process.env.SESSION_SECRET) return null

  // Si trae firma: tiene que ser válida SIEMPRE. Una firma presente pero
  // incorrecta = manipulación → se rechaza aunque no estemos en enforce.
  if (parsed._sig) {
    if (!verificarSesion(parsed)) return null
  } else if (ENFORCE) {
    // Sin firma: solo se tolera durante la migración (ENFORCE=false).
    return null
  }

  // Canónico derivado tras verificar la firma (NO altera el payload firmado).
  if (parsed.restaurante_id && !parsed.local_id) parsed.local_id = parsed.restaurante_id
  return parsed
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
  // Header directo para cron / server-side. Con ENFORCE exige el secreto
  // compartido CRON_SECRET; antes se tolera para no romper los crons.
  const direct = req.headers.get('x-ia-restaurante-id')
  if (direct) {
    const cs = req.headers.get('x-ia-cron-secret')
    const ok = !!process.env.CRON_SECRET && cs === process.env.CRON_SECRET
    if (ok || !ENFORCE) return direct
  }

  const s = getSession(req)
  if (s?.restaurante_id) return s.restaurante_id
  return '00000000-0000-0000-0000-000000000001'
}

// ── Canónico (rename expand-contract restaurante_id → local_id) ──────────────
// El código NUEVO debe usar getLocalId(). Durante la migración envuelve a
// getRestauranteId() (misma fuente: sesión firmada / header). Cuando todo el
// código use local_id y la sesión migre su clave, esto pasará a ser la fuente.
export function getLocalId(req: NextRequest): string {
  return getRestauranteId(req)
}
