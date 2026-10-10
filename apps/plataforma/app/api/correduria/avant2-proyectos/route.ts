import { NextRequest, NextResponse } from 'next/server'
import { exigirCorreduria } from '@/lib/correduria-acceso'
import { proyectosAvant2Cliente, traerProyectoAvant2 } from '@/lib/correduria-puerto'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * Los presupuestos del cliente en Avant2, hechos en la web o aquí (29/09/2026).
 *
 * `GET ?clienteId=` → la lista (gratis). `POST { clienteId, projectId }` → trae uno de la web como
 * tarificación, con su oportunidad. Ninguno de los dos tarifica: 0€.
 */
export async function GET(req: NextRequest) {
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return guarda.respuesta
  const clienteId = req.nextUrl.searchParams.get('clienteId')?.trim() ?? ''
  if (!clienteId) return NextResponse.json({ estado: 'error', mensaje: 'falta clienteId' }, { status: 400 })
  const r = await proyectosAvant2Cliente(clienteId)
  return NextResponse.json(r.json, { status: r.status })
}

export async function POST(req: NextRequest) {
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return guarda.respuesta
  const cuerpo = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const clienteId = typeof cuerpo.clienteId === 'string' ? cuerpo.clienteId.trim() : ''
  const projectId = typeof cuerpo.projectId === 'string' ? cuerpo.projectId.trim() : ''
  if (!clienteId || !projectId) return NextResponse.json({ estado: 'error', mensaje: 'faltan clienteId y projectId' }, { status: 400 })
  // Quién lo trae lo pone el servidor con la sesión, no el cuerpo.
  const r = await traerProyectoAvant2(clienteId, projectId, guarda.session.email)
  return NextResponse.json(r.json, { status: r.status })
}
