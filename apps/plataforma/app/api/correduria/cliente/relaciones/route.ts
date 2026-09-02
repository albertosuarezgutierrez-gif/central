import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import {
  autorizarRelacionAsegura,
  borrarRelacionAsegura,
  crearRelacionAsegura,
  relacionesAsegura,
} from '@/lib/relaciones-asegura'

export const dynamic = 'force-dynamic'

/**
 * /api/correduria/cliente/relaciones — cónyuge, hijos, empresa… de una ficha y
 * la autorización para ver los seguros del otro.
 * Esta app no toca la BD de la correduría: reenvía al puerto de asegura
 * (`/api/operador/cliente/relaciones`) con el secreto de operador y devuelve
 * el MISMO status y json, para que la pantalla lea el contrato del puerto tal
 * cual (ok / conflicto / invalido / no_encontrado). Sesión de plataforma
 * obligatoria: es la pantalla de Alberto. El `actor` (quién autorizó y cuándo
 * queda en el historial de asegura) sale de la sesión, nunca del body.
 */
export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const id = (new URL(req.url).searchParams.get('clienteId') ?? new URL(req.url).searchParams.get('id') ?? '').trim()
  if (id === '') return NextResponse.json({ estado: 'invalido', motivo: 'Falta el id del cliente.' }, { status: 422 })
  const r = await relacionesAsegura(id)
  return NextResponse.json(r.json ?? { estado: 'error', motivo: `HTTP ${r.status}` }, { status: r.status })
}

export async function POST(req: NextRequest) {
  return reenviar(req, crearRelacionAsegura)
}

export async function PATCH(req: NextRequest) {
  return reenviar(req, autorizarRelacionAsegura)
}

export async function DELETE(req: NextRequest) {
  return reenviar(req, borrarRelacionAsegura)
}

async function reenviar(req: NextRequest, llamada: (body: Record<string, unknown>) => Promise<{ status: number; json: unknown }>) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
  if (!body || typeof body.clienteId !== 'string' || body.clienteId.trim() === '') {
    return NextResponse.json({ estado: 'invalido', motivo: 'Falta el id del cliente.' }, { status: 422 })
  }
  if (typeof body.relacionadoId !== 'string' || body.relacionadoId.trim() === '') {
    return NextResponse.json({ estado: 'invalido', motivo: 'Falta el id del cliente relacionado.' }, { status: 422 })
  }
  if (body.relacionadoId === body.clienteId) {
    return NextResponse.json({ estado: 'invalido', motivo: 'Una ficha no puede relacionarse consigo misma.' }, { status: 422 })
  }
  const r = await llamada({ ...body, actor: session.email })
  return NextResponse.json(r.json ?? { estado: 'error', motivo: `HTTP ${r.status}` }, { status: r.status })
}
