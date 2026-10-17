import { NextRequest, NextResponse } from 'next/server'
import { exigirCorreduria } from '@/lib/correduria-acceso'
import { sellarAnulacionConfirmadaAsegura, sustitucionesAsegura } from '@/lib/correduria-puerto'

export const dynamic = 'force-dynamic'

// GET /api/correduria/sustituciones — seguimiento de cambios de compañía
// pendientes de que CIMA confirme la póliza nueva. Read-only.
export async function GET(req: NextRequest) {
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return guarda.respuesta
  return NextResponse.json(await sustitucionesAsegura())
}

// POST /api/correduria/sustituciones { polizaViejaId, motivo, fechaEfectoBaja? } — «Anulación confirmada por la
// compañía» sobre la póliza vieja. Reenvía al puerto de asegura (que valida); el `actor` lo pone el servidor.
export async function POST(req: NextRequest) {
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return guarda.respuesta
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
  if (!body || typeof body.polizaViejaId !== 'string' || body.polizaViejaId.trim() === '') {
    return NextResponse.json({ estado: 'invalido', motivo: 'Falta la póliza.' }, { status: 400 })
  }
  if (typeof body.motivo !== 'string' || body.motivo.trim() === '') {
    return NextResponse.json({ estado: 'invalido', motivo: 'El motivo es obligatorio: di de dónde sale la confirmación.' }, { status: 400 })
  }
  const efecto = typeof body.fechaEfectoBaja === 'string' && body.fechaEfectoBaja.trim() !== '' ? body.fechaEfectoBaja.trim() : null
  const r = await sellarAnulacionConfirmadaAsegura(body.polizaViejaId.trim(), body.motivo.trim().slice(0, 500), efecto, guarda.session.email)
  if (r.estado === 'ok') return NextResponse.json({ estado: 'ok' })
  if (r.estado === 'sin_configurar') return NextResponse.json({ estado: 'sin_configurar', motivo: 'Falta ASEGURA_OPERADOR_SECRET.' }, { status: 503 })
  if (r.estado === 'rechazado') return NextResponse.json({ estado: 'rechazado', motivo: r.motivo }, { status: 409 })
  return NextResponse.json({ estado: 'sin_respuesta', motivo: r.motivo }, { status: 502 })
}
