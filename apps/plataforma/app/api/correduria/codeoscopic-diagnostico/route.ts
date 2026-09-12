import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { diagnosticoProyectoCodeoscopic } from '@/lib/correduria-puerto'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

/**
 * `GET /api/correduria/codeoscopic-diagnostico?projectId=` — lectura CRUDA de
 * `GET /insurances/{id}` (gratis), para comprobar si Codeoscopic procesó un
 * Submit que se cortó a mitad de camino, sin arriesgar un segundo envío no
 * idempotente. Sesión de plataforma obligatoria: es la pantalla de Alberto,
 * no un curl suelto ni el portal del vendor.
 */
export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const projectId = req.nextUrl.searchParams.get('projectId')?.trim()
  if (!projectId) return NextResponse.json({ error: 'falta projectId' }, { status: 400 })

  const r = await diagnosticoProyectoCodeoscopic(projectId)
  if (r.estado === 'sin_configurar') {
    return NextResponse.json({ error: 'ASEGURA_OPERADOR_SECRET no está configurado' }, { status: 503 })
  }
  if (r.estado === 'error') {
    return NextResponse.json({ error: r.motivo }, { status: 502 })
  }
  return NextResponse.json({ estado: 'ok', crudo: r.crudo })
}
