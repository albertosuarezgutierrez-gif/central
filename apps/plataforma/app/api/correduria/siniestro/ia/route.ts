import { NextRequest, NextResponse } from 'next/server'
import { exigirCorreduria } from '@/lib/correduria-acceso'
import { iaSiniestroAsegura } from '@/lib/correduria/siniestro-hilo-red'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

/** POST { siniestroId, accion:'analizar'|'redactar', destinatario? } → Mensaje (proxy a asegura; 404 mientras no exista). */
export async function POST(req: NextRequest) {
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return guarda.respuesta
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
  if (!body || typeof body.siniestroId !== 'string' || body.siniestroId.trim() === '') {
    return NextResponse.json({ estado: 'invalido', motivo: 'Falta el id del siniestro.' }, { status: 422 })
  }
  if (body.accion !== 'analizar' && body.accion !== 'redactar') {
    return NextResponse.json({ estado: 'invalido', motivo: 'Acción no válida.' }, { status: 422 })
  }
  const r = await iaSiniestroAsegura({ ...body, correduriaId: guarda.acceso.correduriaId ?? undefined, actor: guarda.session.email })
  return NextResponse.json(r.json ?? { estado: 'error', motivo: `HTTP ${r.status}` }, { status: r.status })
}
