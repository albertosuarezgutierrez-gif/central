import { NextRequest, NextResponse } from 'next/server'
import { exigirCorreduria } from '@/lib/correduria-acceso'
import { carnetAsegura } from '@/lib/cliente-edicion-asegura'

export const dynamic = 'force-dynamic'

/**
 * /api/correduria/cliente/carnets — añadir (POST), corregir (PATCH) o quitar (DELETE) un carné
 * de conducir de la ficha. Reenvía al puerto de asegura (`/api/operador/cliente/carnets`) y
 * devuelve su MISMO status y json. El `actor` sale de la sesión, nunca del cuerpo.
 */
export async function POST(req: NextRequest) {
  return reenviar(req, 'POST')
}

export async function PATCH(req: NextRequest) {
  return reenviar(req, 'PATCH')
}

export async function DELETE(req: NextRequest) {
  return reenviar(req, 'DELETE')
}

async function reenviar(req: NextRequest, method: 'POST' | 'PATCH' | 'DELETE') {
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return guarda.respuesta
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
  if (!body || typeof body.clienteId !== 'string' || body.clienteId.trim() === '') {
    return NextResponse.json({ estado: 'invalido', motivo: 'Falta el id del cliente.' }, { status: 422 })
  }
  const r = await carnetAsegura(method, { ...body, actor: guarda.session.email })
  return NextResponse.json(r.json ?? { estado: 'error', motivo: `HTTP ${r.status}` }, { status: r.status })
}
