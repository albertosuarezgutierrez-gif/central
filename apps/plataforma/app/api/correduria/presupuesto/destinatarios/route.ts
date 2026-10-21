import { NextResponse } from 'next/server'

import { exigirCorreduria } from '@/lib/correduria-acceso'
import { destinatariosPresupuestoAsegura } from '@/lib/presupuesto-asegura'

export const dynamic = 'force-dynamic'

/**
 * GET /api/correduria/presupuesto/destinatarios?clienteId=<tomador> (21/10/2026) — a quién se le puede mandar el
 * presupuesto si el tomador no tiene correo. Reenvía al puerto de asegura con el mismo status y json. Solo LEE: el envío
 * lo vuelve a comprobar asegura con la misma regla.
 */
export async function GET(req: Request) {
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return guarda.respuesta
  const clienteId = new URL(req.url).searchParams.get('clienteId')?.trim() ?? ''
  if (clienteId === '') return NextResponse.json({ estado: 'error', motivo: 'datos_invalidos' }, { status: 400 })
  const r = await destinatariosPresupuestoAsegura(clienteId)
  return NextResponse.json(r.json ?? { estado: 'error', motivo: `HTTP ${r.status}` }, { status: r.status })
}
