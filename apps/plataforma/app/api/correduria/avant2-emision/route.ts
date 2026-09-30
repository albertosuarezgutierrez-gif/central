import { NextRequest, NextResponse } from 'next/server'
import { exigirCorreduria } from '@/lib/correduria-acceso'
import { emisionExternaRegistrar, emisionExternaVista } from '@/lib/correduria-puerto'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * Registrar en la intranet una emisión hecha en la web de Avant2 (30/09/2026).
 *
 * `GET ?projectId=&clienteId=&oportunidadId=` → vista previa (gratis, no escribe).
 * `POST { projectId, clienteId, oportunidadId? }` → la registra. `confirmado` y `actor` los pone el
 * servidor (sesión), nunca el cuerpo: la confirmación real es el `confirm` del navegador.
 */
export async function GET(req: NextRequest) {
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return guarda.respuesta
  const q = req.nextUrl.searchParams
  const projectId = q.get('projectId')?.trim() ?? ''
  const clienteId = q.get('clienteId')?.trim() ?? ''
  if (!projectId || !clienteId) return NextResponse.json({ estado: 'error', mensaje: 'faltan projectId y clienteId' }, { status: 400 })
  const r = await emisionExternaVista({ projectId, clienteId, oportunidadId: q.get('oportunidadId')?.trim() || null })
  return NextResponse.json(r.json, { status: r.status })
}

export async function POST(req: NextRequest) {
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return guarda.respuesta
  const cuerpo = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const projectId = typeof cuerpo.projectId === 'string' ? cuerpo.projectId.trim() : ''
  const clienteId = typeof cuerpo.clienteId === 'string' ? cuerpo.clienteId.trim() : ''
  const oportunidadId = typeof cuerpo.oportunidadId === 'string' && cuerpo.oportunidadId.trim() ? cuerpo.oportunidadId.trim() : null
  if (!projectId || !clienteId) return NextResponse.json({ estado: 'error', mensaje: 'faltan projectId y clienteId' }, { status: 400 })
  const r = await emisionExternaRegistrar({ projectId, clienteId, oportunidadId, actor: guarda.session.email })
  return NextResponse.json(r.json, { status: r.status })
}
