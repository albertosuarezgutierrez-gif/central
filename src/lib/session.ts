import { NextRequest } from 'next/server'
import { verificarSesion } from '@/lib/session-sign'

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

  // Si trae firma: tiene que ser válida SIEMPRE. Una firma presente pero
  // incorrecta = manipulación → se rechaza aunque no estemos en enforce.
  if (parsed._sig) {
    return verificarSesion(parsed) ? parsed : null
  }

  // Sin firma: solo se tolera durante la migración (ENFORCE=false).
  return ENFORCE ? null : parsed
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
