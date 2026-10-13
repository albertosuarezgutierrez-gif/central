import { NextResponse } from 'next/server'

import { exigirCorreduria } from '@/lib/correduria-acceso'
import { ENV_SOLICITANTE, puedeSolicitarEmision, solicitarEnAsegura } from '@/lib/tarificador-emision-asegura'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * POST /api/correduria/tarificador/emision { presupuestoId, trabajoOrigenId } — pide al ROBOT que prepare la emisión de
 * la opción que el cliente aceptó y firmó (10/10/2026). NO emite: para en la pantalla previa y, si la prima es
 * EXACTAMENTE la aceptada, te pide el botón por Telegram. Solo la persona de `TARIFICADOR_EMISION_SOLICITANTE` (sin env,
 * nadie). Reenvía el estado y el JSON de asegura tal cual.
 */
export async function POST(req: Request) {
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return guarda.respuesta
  if (!puedeSolicitarEmision(guarda.session.email)) {
    return NextResponse.json({ estado: 'rechazado', motivo: `solo el titular puede pedir una emisión (${ENV_SOLICITANTE})` }, { status: 403 })
  }
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null
  const presupuestoId = typeof b?.presupuestoId === 'string' ? b.presupuestoId.trim() : ''
  const trabajoOrigenId = typeof b?.trabajoOrigenId === 'string' ? b.trabajoOrigenId.trim() : ''
  if (!UUID.test(presupuestoId) || !UUID.test(trabajoOrigenId)) {
    return NextResponse.json({ estado: 'error', mensaje: 'presupuestoId y trabajoOrigenId tienen que ser uuid' }, { status: 400 })
  }
  const r = await solicitarEnAsegura({ presupuestoId, trabajoOrigenId })
  return NextResponse.json(r.json ?? { estado: 'error' }, { status: r.status })
}
