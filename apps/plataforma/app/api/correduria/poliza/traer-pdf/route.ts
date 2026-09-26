import { NextRequest, NextResponse } from 'next/server'
import { exigirCorreduria } from '@/lib/correduria-acceso'
import { traerPdfCodeoscopicAsegura } from '@/lib/documentos-asegura'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * POST /api/correduria/poliza/traer-pdf { polizaId, projectId? } — pide a asegura que traiga de
 * Codeoscopic el PDF de una póliza ya emitida (gratis) y lo archive visible para el cliente. Asegura
 * comprueba que el número de la solicitud aprobada es el de esta póliza antes de guardar nada.
 */
export async function POST(req: NextRequest) {
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return guarda.respuesta
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null
  const polizaId = typeof b?.polizaId === 'string' ? b.polizaId.trim() : ''
  if (!polizaId) return NextResponse.json({ estado: 'invalido', motivo: 'falta polizaId' }, { status: 400 })
  const projectId = typeof b?.projectId === 'string' && b.projectId.trim() ? b.projectId.trim() : null
  try {
    const r = await traerPdfCodeoscopicAsegura(polizaId, projectId)
    return NextResponse.json(r.json ?? { estado: 'error', motivo: `HTTP ${r.status}` }, { status: r.status })
  } catch (e) {
    return NextResponse.json({ estado: 'error', motivo: e instanceof Error ? e.message : String(e) }, { status: 502 })
  }
}
