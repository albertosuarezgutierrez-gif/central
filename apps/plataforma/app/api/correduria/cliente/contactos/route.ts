import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import {
  anadirContactoAsegura,
  borrarContactoAsegura,
  cambiarContactoAsegura,
  contactosAsegura,
} from '@/lib/cliente-edicion-asegura'

export const dynamic = 'force-dynamic'

/**
 * /api/correduria/cliente/contactos — los teléfonos y emails de una ficha.
 * Esta app no toca la BD de la correduría: reenvía al puerto de asegura
 * (`/api/operador/cliente/contactos`) con el secreto de operador y devuelve
 * el MISMO status y json, para que la pantalla lea el contrato del puerto tal
 * cual (ok / conflicto / invalido / no_encontrado). Sesión de plataforma
 * obligatoria: es la pantalla de Alberto.
 */
export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const id = (new URL(req.url).searchParams.get('id') ?? '').trim()
  if (id === '') return NextResponse.json({ estado: 'invalido', motivo: 'Falta el id del cliente.' }, { status: 422 })
  const r = await contactosAsegura(id)
  return NextResponse.json(r.json ?? { estado: 'error', motivo: `HTTP ${r.status}` }, { status: r.status })
}

export async function POST(req: NextRequest) {
  return reenviar(req, anadirContactoAsegura)
}

export async function PATCH(req: NextRequest) {
  return reenviar(req, cambiarContactoAsegura)
}

export async function DELETE(req: NextRequest) {
  return reenviar(req, borrarContactoAsegura)
}

async function reenviar(req: NextRequest, llamada: (body: Record<string, unknown>) => Promise<{ status: number; json: unknown }>) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
  if (!body || typeof body.clienteId !== 'string' || body.clienteId.trim() === '') {
    return NextResponse.json({ estado: 'invalido', motivo: 'Falta el id del cliente.' }, { status: 422 })
  }
  const r = await llamada({ ...body, actor: session.email })
  return NextResponse.json(r.json ?? { estado: 'error', motivo: `HTTP ${r.status}` }, { status: r.status })
}
