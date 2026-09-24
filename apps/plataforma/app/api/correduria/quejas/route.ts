import { NextRequest, NextResponse } from 'next/server'
import { exigirCorreduria } from '@/lib/correduria-acceso'
import { cambiarQuejaAsegura, quejasAsegura, registrarQuejaAsegura } from '@/lib/quejas-asegura'

export const dynamic = 'force-dynamic'

/**
 * /api/correduria/quejas — el registro de quejas y reclamaciones del SAC.
 *
 * Esta app no toca la BD de la correduría: reenvía al puerto de asegura (`/api/operador/quejas`)
 * y devuelve el MISMO status y json, para que la pantalla lea el contrato del puerto tal cual.
 *
 *   GET   [?todas=1]
 *   POST  { reclamante, canal, motivo, detalle, recibidaEl?, clienteId?, polizaId? }
 *   PATCH { id, estado, respuesta? }
 *
 * El `actor` lo pone el SERVIDOR y va el ÚLTIMO: la respuesta que se da a un reclamante es la
 * prueba de haber contestado, y tiene que constar quién la dio aunque el cuerpo trajera otro.
 */
export async function GET(req: NextRequest) {
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return guarda.respuesta
  const todas = new URL(req.url).searchParams.get('todas') === '1'
  const r = await quejasAsegura(todas)
  return NextResponse.json(r.json ?? { estado: 'error', motivo: `HTTP ${r.status}` }, { status: r.status })
}

export async function POST(req: NextRequest) {
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return guarda.respuesta
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
  if (!body) return NextResponse.json({ estado: 'invalida', motivos: ['Cuerpo vacío.'] }, { status: 422 })
  const r = await registrarQuejaAsegura({ ...body, actor: guarda.session.email })
  return NextResponse.json(r.json ?? { estado: 'error', motivo: `HTTP ${r.status}` }, { status: r.status })
}

export async function PATCH(req: NextRequest) {
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return guarda.respuesta
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
  if (!body) return NextResponse.json({ estado: 'invalida', motivo: 'Cuerpo vacío.' }, { status: 422 })
  const r = await cambiarQuejaAsegura({ ...body, actor: guarda.session.email })
  return NextResponse.json(r.json ?? { estado: 'error', motivo: `HTTP ${r.status}` }, { status: r.status })
}
