import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { actualizarParteAsegura, partesAsegura } from '@/lib/partes-asegura'

export const dynamic = 'force-dynamic'

/**
 * /api/correduria/partes — los partes de siniestro que abre el CLIENTE desde el
 * portal (`apps/asegura-portal`). Esta app no toca la BD de la correduría:
 * reenvía al puerto de asegura (`/api/operador/partes`) con el secreto de
 * operador y devuelve el MISMO status y json, para que la pantalla lea el
 * contrato del puerto tal cual. Sesión de plataforma obligatoria: es la bandeja
 * de Alberto, y su email va de `actor` en cada cambio de estado (un descarte
 * sin quién ni por qué no lo puede revisar nadie después).
 *
 *   GET   ?estado=&clienteId=&limite=
 *   PATCH { id, estado, siniestroId?, motivoDescarte? }
 */
export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const p = new URL(req.url).searchParams
  const limiteTexto = (p.get('limite') ?? '').trim()
  const limite = /^\d{1,4}$/.test(limiteTexto) ? Number(limiteTexto) : undefined
  const r = await partesAsegura({
    estado: (p.get('estado') ?? '').trim() || undefined,
    clienteId: (p.get('clienteId') ?? '').trim() || undefined,
    limite,
  })
  return NextResponse.json(r.json ?? { estado: 'error', motivo: `HTTP ${r.status}` }, { status: r.status })
}

export async function PATCH(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
  if (!body || typeof body.id !== 'string' || body.id.trim() === '') {
    return NextResponse.json({ error: 'parte_requerido', motivo: 'Falta el id del parte.' }, { status: 400 })
  }
  // El `actor` lo pone el servidor SIEMPRE, y va el último: un cliente que
  // mandara su propio `actor` en el cuerpo no puede firmar el cambio con otro
  // nombre.
  const r = await actualizarParteAsegura({ ...body, actor: session.email })
  return NextResponse.json(r.json ?? { estado: 'error', motivo: `HTTP ${r.status}` }, { status: r.status })
}
