import { NextResponse } from 'next/server'
import { exigirCorreduria } from '@/lib/correduria-acceso'
import { solicitudesPortalAsegura } from '@/lib/portal-cliente-asegura'
import { interpretarSolicitudesPortal } from '@/lib/correduria/solicitudes-portal'

export const dynamic = 'force-dynamic'

/**
 * GET — la cola «Solicitudes del portal» (peticiones de módulo `solicitado`). SOLO LECTURA: este proxy no exporta
 * POST/PUT/PATCH/DELETE. Activar/Rechazar pasan por `/api/correduria/cliente/portal-modulos` (revalida y audita).
 * `error` ≠ vacío: la pantalla dice «no se ha podido leer», nunca «0».
 */
export async function GET() {
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return guarda.respuesta
  const r = await solicitudesPortalAsegura()
  return NextResponse.json(interpretarSolicitudesPortal(r.status, r.json))
}
