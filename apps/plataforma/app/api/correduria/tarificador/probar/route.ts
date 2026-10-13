import { NextResponse } from 'next/server'

import { exigirCorreduria } from '@/lib/correduria-acceso'
import { probarTarificacion } from '@/lib/tarificador-asegura'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const CLAVE = /^[a-z0-9_-]{1,40}$/

/**
 * POST /api/correduria/tarificador/probar { clienteId, compania, ramo } — «Probar tarificación» de la ficha: encola en
 * el tarificador RPA el último riesgo tarificado de ese cliente en esa compañía+ramo. Solo PRECIO: no emite ni contrata.
 * Reenvía el estado y el JSON de asegura tal cual (incluido `duplicado`).
 */
export async function POST(req: Request) {
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return guarda.respuesta
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null
  const clienteId = typeof b?.clienteId === 'string' ? b.clienteId.trim() : ''
  const compania = typeof b?.compania === 'string' ? b.compania.trim().toLowerCase() : ''
  const ramo = typeof b?.ramo === 'string' ? b.ramo.trim() : ''
  if (!UUID.test(clienteId) || !CLAVE.test(compania) || !CLAVE.test(ramo)) {
    return NextResponse.json({ estado: 'error', mensaje: 'clienteId (uuid), compania y ramo son obligatorios' }, { status: 400 })
  }
  const r = await probarTarificacion(clienteId, compania, ramo)
  return NextResponse.json(r.json ?? { estado: 'error' }, { status: r.status })
}
