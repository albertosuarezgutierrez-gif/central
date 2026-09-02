import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { abrirSiniestroAsegura, seguirSiniestroAsegura, siniestroAsegura } from '@/lib/siniestros-asegura'

export const dynamic = 'force-dynamic'

/**
 * /api/correduria/siniestro — siniestros desde la ficha (abrir, seguimiento,
 * estado). Esta app no toca la BD de la correduría: reenvía al puerto de
 * asegura (`/api/operador/siniestro`) con el secreto de operador y devuelve el
 * MISMO status y json, para que la pantalla lea el contrato del puerto tal
 * cual (ok / invalido / no_encontrado / sin_configurar / error). Sesión de
 * plataforma obligatoria: es la pantalla de Alberto, y su email va de `actor`.
 *
 *   GET   ?id=<siniestroId>
 *   POST  { polizaId, tipo, fechaHora, descripcion, … }        → abre uno
 *   PATCH { siniestroId, estado } | { siniestroId, …seguimiento } → estado / seguimiento
 */
export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const id = (new URL(req.url).searchParams.get('id') ?? '').trim()
  if (id === '') return NextResponse.json({ estado: 'invalido', motivo: 'Falta el id del siniestro.' }, { status: 422 })
  const r = await siniestroAsegura(id)
  return NextResponse.json(r.json ?? { estado: 'error', motivo: `HTTP ${r.status}` }, { status: r.status })
}

export async function POST(req: NextRequest) {
  return reenviar(req, abrirSiniestroAsegura, 'polizaId', 'Falta la póliza del siniestro.')
}

export async function PATCH(req: NextRequest) {
  return reenviar(req, seguirSiniestroAsegura, 'siniestroId', 'Falta el id del siniestro.')
}

async function reenviar(
  req: NextRequest,
  llamada: (body: Record<string, unknown>) => Promise<{ status: number; json: unknown }>,
  obligatorio: 'polizaId' | 'siniestroId',
  motivoFalta: string,
) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
  if (!body || typeof body[obligatorio] !== 'string' || (body[obligatorio] as string).trim() === '') {
    return NextResponse.json({ estado: 'invalido', motivo: motivoFalta }, { status: 422 })
  }
  const r = await llamada({ ...body, actor: session.email })
  return NextResponse.json(r.json ?? { estado: 'error', motivo: `HTTP ${r.status}` }, { status: r.status })
}
